import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

it('stores private starting experience atomically without changing verified history or consent', async () => {
  const db = await PGlite.create()
  const me = '00000000-0000-4000-8000-000000000001'
  const peer = '00000000-0000-4000-8000-000000000002'
  const community = '10000000-0000-4000-8000-000000000001'
  const outside = '10000000-0000-4000-8000-000000000002'
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
      CREATE TABLE profiles(id uuid PRIMARY KEY); CREATE TABLE communities(id uuid PRIMARY KEY);
      CREATE TABLE members(user_id uuid,community_id uuid);
      CREATE FUNCTION practice_is_community_eligible(u uuid,c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM members WHERE user_id=u AND community_id=c) $$;
      INSERT INTO profiles VALUES ('${me}'),('${peer}'); INSERT INTO communities VALUES ('${community}'),('${outside}');
      INSERT INTO members SELECT id,'${community}' FROM profiles;`)
    const original = await readFile(new URL('../../../scripts/migration-practice-recommendations.sql', import.meta.url), 'utf8')
    // Real existing table and private get/save definitions, without unrelated browse dependencies.
    await db.exec(original.slice(0, original.indexOf('-- Internal evidence helper.')) + '\nCOMMIT;')
    await db.exec(`REVOKE ALL ON FUNCTION practice_recommendation_preferences_get(uuid) FROM PUBLIC,anon;
      REVOKE ALL ON FUNCTION practice_recommendation_preferences_save(uuid,text[],text[],boolean) FROM PUBLIC,anon;
      GRANT EXECUTE ON FUNCTION practice_recommendation_preferences_get(uuid) TO authenticated;
      GRANT EXECUTE ON FUNCTION practice_recommendation_preferences_save(uuid,text[],text[],boolean) TO authenticated;`)
    const migration = await readFile(new URL('../../../scripts/migration-practice-starting-experience.sql', import.meta.url), 'utf8')
    await db.exec(migration); await db.exec(migration)
    const as = user => db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',false)`)
    const get = async (c = community) => (await db.query('SELECT practice_personal_preferences_get($1) AS value', [c])).rows[0].value
    const save = (prior, focus = ['synthesis'], share = false) => db.query(
      'SELECT practice_personal_preferences_save($1,$2,$3,$4,$5)', [community, ['structuring'], focus, share, prior])
    await as(me)
    expect(await get()).toEqual({ focus_skills: [], support_skills: [], share_response: false, prior_practice: {}, prior_practice_supported: true })
    await save({ case: '5_to_10', behavioural: 'none' })
    const saved = await get()
    expect(saved.prior_practice).toEqual({ case: '5_to_10', behavioural: 'none' })
    expect(saved.share_response).toBe(false)
    expect(saved).not.toHaveProperty('verified_sessions')
    await as(peer)
    expect((await get()).prior_practice).toEqual({})
    await save({ case: 'over_20' })
    await as(me)
    expect(await get()).toEqual(saved)
    await expect(db.query('SELECT * FROM practice_recommendation_preferences')).rejects.toThrow('permission denied')
    await expect(get(outside)).rejects.toThrow('not_eligible')
    for (const invalid of [null, [], { case: 20 }, { finance: '5_to_10' }, { case: 'verified' }, { case: null }]) {
      await expect(save(invalid, ['communication'], true)).rejects.toThrow('invalid_prior_practice')
      expect(await get()).toEqual(saved) // Focus and consent roll back too.
    }
    await expect(save({}, ['unknown_skill'])).rejects.toThrow('practice_rec_skills_known')
    await db.query('SELECT practice_recommendation_preferences_save($1,$2,$3,$4)', [community, [], [], false])
    expect((await get()).prior_practice).toEqual(saved.prior_practice) // Old clients preserve it.
    await save({})
    expect((await get()).prior_practice).toEqual({}) // Optional can be cleared.
    await db.exec('RESET ROLE; SET ROLE anon')
    await expect(get()).rejects.toThrow('permission denied')
    await expect(save({})).rejects.toThrow('permission denied')
    await as('')
    await expect(get()).rejects.toThrow('not_eligible')
  } finally { await db.close() }
}, 30000)
