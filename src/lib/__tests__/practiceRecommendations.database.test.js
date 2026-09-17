import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

it('ranks eligible anonymous peers using private focus and opted in response evidence', async () => {
  const db = await PGlite.create()
  const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`)
  const c = '10000000-0000-4000-8000-000000000001'
  const other = '10000000-0000-4000-8000-000000000002'
  const rid = i => `20000000-0000-4000-8000-00000000000${i + 1}`
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
      CREATE TABLE profiles(id uuid PRIMARY KEY); CREATE TABLE communities(id uuid PRIMARY KEY);
      CREATE TABLE members(user_id uuid,community_id uuid);
      CREATE FUNCTION practice_is_community_eligible(u uuid,c uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM members WHERE user_id=u AND community_id=c) $$;
      CREATE TABLE practice_requests(id uuid PRIMARY KEY,user_id uuid,community_id uuid,want_types text[],help_types text[],want_focus text,help_focus text,help_context text,location_type text,duration_minutes integer,timezone text,status text);
      CREATE TABLE practice_availability_windows(id uuid,request_id uuid,starts_at timestamptz,ends_at timestamptz);
      CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
      CREATE TABLE practice_pairings(id uuid DEFAULT gen_random_uuid(),community_id uuid,requester_user_id uuid,addressee_user_id uuid,user_lo uuid GENERATED ALWAYS AS(LEAST(requester_user_id,addressee_user_id)) STORED,user_hi uuid GENERATED ALWAYS AS(GREATEST(requester_user_id,addressee_user_id)) STORED,status text,invited_at timestamptz,accepted_at timestamptz,declined_at timestamptz);
      INSERT INTO profiles VALUES ${ids.map(id => `('${id}')`).join(',')};
      INSERT INTO communities VALUES('${c}'),('${other}'); INSERT INTO members SELECT id,'${c}' FROM profiles;
      INSERT INTO practice_requests(id,user_id,community_id,want_types,help_types,status) VALUES ${ids.slice(0,4).map((id,i)=>`('${rid(i)}','${id}','${c}',ARRAY['case'],ARRAY['case'],'active')`).join(',')};`)
    const browse = await readFile(new URL('../../../scripts/migration-practice-declined-marker.sql', import.meta.url), 'utf8')
    await db.exec(browse.slice(browse.indexOf('CREATE FUNCTION public.browse_practice_requests')))
    const migration = await readFile(new URL('../../../scripts/migration-practice-recommendations.sql', import.meta.url), 'utf8')
    await db.exec(migration); await db.exec(migration)
    const as = async i => db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids[i]}',false)`)
    const save = (support, focus, share) => db.query('SELECT practice_recommendation_preferences_save($1,$2,$3,$4)', [c,support,focus,share])
    const get = async () => (await db.query('SELECT browse_practice_recommendations($1) AS card', [c])).rows.map(r=>r.card)
    await as(0); await save([],['synthesis'],true)
    await as(1); await save(['synthesis'],['structuring'],true)
    await as(2); await save(['synthesis'],[],true)
    await as(3); await save(['communication'],[],false)
    await db.exec('RESET ROLE')
    // Three independent senders. Caller and candidate 2 both answered promptly.
    for (const target of [0,1,2]) for (const sender of [4,5,6]) await db.query(`INSERT INTO practice_pairings(community_id,requester_user_id,addressee_user_id,status,invited_at,accepted_at,declined_at) VALUES($1,$2,$3,'declined',now()-interval '5 days',NULL,now()-$4::interval)`,[c,ids[sender],ids[target], target===1 ? '1 day' : '4 days'])
    await as(0)
    let cards = await get()
    expect(cards.map(r=>r.request_id)).toEqual([rid(2),rid(1),rid(3)])
    expect(cards[0].recommendation.response_record).toEqual({total:3,prompt:3})
    expect(cards[0].recommendation.similar_response).toBe(true)
    expect(cards[0].recommendation.relevant_skills).toEqual(['synthesis'])
    expect(cards[2].recommendation.response_record).toBeNull()
    for (const id of ids) expect(JSON.stringify(cards)).not.toContain(id)
    expect(JSON.stringify(cards)).not.toContain('structuring') // another person's private focus
    await expect(db.query('SELECT * FROM practice_recommendation_preferences')).rejects.toThrow('permission denied')
    await expect(db.query('SELECT practice_response_evidence($1,$2)',[ids[1],c])).rejects.toThrow('permission denied')
    await expect(save(['invented_skill'],[],false)).rejects.toThrow('practice_rec_skills_known')
    await expect(db.query('SELECT practice_recommendation_preferences_get($1)',[other])).rejects.toThrow('not_eligible')
    // New, withdrawn and repeated invitations cannot inflate independent evidence.
    await db.exec('RESET ROLE')
    await db.query(`INSERT INTO practice_pairings(community_id,requester_user_id,addressee_user_id,status,invited_at,accepted_at) VALUES
      ($1,$2,$3,'accepted',now()-interval '1 hour',now()),
      ($1,$2,$3,'withdrawn',now()-interval '4 days',NULL),
      ($1,$4,$3,'accepted',now()-interval '20 days',now()-interval '19 days')`,[c,ids[7],ids[2],ids[4]])
    await as(0); expect((await get())[0].recommendation.response_record).toEqual({total:3,prompt:3})
    // A saved skill no longer applies if the support category is removed.
    await as(3); await save(['communication','concision'],[],false)
    await db.exec(`RESET ROLE; UPDATE practice_requests SET help_types=ARRAY['case','behavioural'] WHERE user_id='${ids[3]}';`)
    await as(0); expect((await get()).find(r=>r.request_id===rid(3)).recommendation.support_skills).toEqual(['communication','concision'])
    await db.exec(`RESET ROLE; UPDATE practice_requests SET help_types=ARRAY['case'] WHERE user_id='${ids[3]}';`)
    await as(0); expect((await get()).find(r=>r.request_id===rid(3)).recommendation.support_skills).toEqual(['communication'])
    // Opt out removes visible record and ranking signal on next fetch.
    await as(2); await save(['synthesis'],[],false); await as(0)
    expect((await get()).find(r=>r.request_id===rid(2)).recommendation.response_record).toBeNull()
    // Fewer than three distinct senders produces no rate, not 0%.
    await db.exec(`RESET ROLE; DELETE FROM practice_pairings WHERE addressee_user_id='${ids[1]}' AND requester_user_id='${ids[6]}';`)
    await as(0); expect((await get()).find(r=>r.request_id===rid(1)).recommendation.response_record).toBeNull()
    // Existing browse rules still remove blocks, live invitations and other communities.
    await db.exec(`RESET ROLE; INSERT INTO blocks VALUES('${ids[1]}','${ids[0]}'); INSERT INTO practice_pairings(community_id,requester_user_id,addressee_user_id,status,invited_at) VALUES('${c}','${ids[0]}','${ids[2]}','invited',now()); UPDATE practice_requests SET community_id='${other}' WHERE user_id='${ids[3]}';`)
    await as(0); expect(await get()).toEqual([])
    await db.exec('RESET ROLE; SET ROLE anon')
    await expect(get()).rejects.toThrow('permission denied')
  } finally { await db.close() }
},30000)
