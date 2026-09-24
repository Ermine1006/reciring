import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

it('supports finance taxonomy, private observations, atomic confirmation and scoped access', async () => {
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
    await db.exec(migration)
    await db.exec(`
      ALTER TABLE practice_pairings ADD COLUMN requester_snapshot jsonb DEFAULT '{"want_types":["case"]}', ADD COLUMN addressee_snapshot jsonb DEFAULT '{"want_types":["case"]}';
      CREATE TABLE practice_sessions(id uuid PRIMARY KEY,community_id uuid,pairing_id uuid,participant_a_user_id uuid,participant_b_user_id uuid,status text,interview_category text,scheduled_start timestamptz,completed_at timestamptz,verified_at timestamptz,cancelled_by uuid,UNIQUE(id,community_id));
      CREATE TABLE practice_session_confirmations(session_id uuid,user_id uuid,outcome text,completed_own_round boolean,completed_partner_round boolean,no_show_of uuid,confirmed_at timestamptz DEFAULT now(),PRIMARY KEY(session_id,user_id),CHECK(outcome<>'completed' OR (completed_own_round AND completed_partner_round)));
      CREATE TABLE practice_exchange_tokens(session_id uuid UNIQUE,community_id uuid,pairing_id uuid,user_lo uuid,user_hi uuid,exchange_types text[],verified_at timestamptz);
      CREATE TABLE notifications(user_id uuid,type text,title text,body text,payload jsonb);
    `)
    await db.exec(await readFile(new URL('../../../scripts/migration-practice-feedback.sql', import.meta.url),'utf8'))
    const strengths = await readFile(new URL('../../../scripts/migration-practice-peer-strengths.sql', import.meta.url),'utf8')
    await db.exec(strengths); await db.exec(strengths)
    const teammate = await readFile(new URL('../../../scripts/migration-practice-teammate-feedback.sql', import.meta.url),'utf8')
    await db.exec(teammate); await db.exec(teammate)
    const history = await readFile(new URL('../../../scripts/migration-practice-card-history.sql', import.meta.url),'utf8')
    await db.exec(history); await db.exec(history)

    await db.exec(`ALTER TABLE practice_sessions
      ADD COLUMN skill_focus text, ADD COLUMN session_mode text, ADD COLUMN created_by_user_id uuid,
      ADD COLUMN duration_minutes integer, ADD COLUMN timezone text, ADD COLUMN location_type text,
      ADD COLUMN location_detail text, ADD COLUMN meeting_method text, ADD COLUMN meeting_url text,
      ADD COLUMN meeting_location text;
      ALTER TABLE practice_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE practice_sessions ALTER COLUMN status SET DEFAULT 'proposed';
      GRANT SELECT ON practice_sessions,blocks TO authenticated;
    `)
    await db.exec(await readFile(new URL('../../../scripts/migration-practice-starting-experience.sql', import.meta.url),'utf8'))
    await db.exec(await readFile(new URL('../../../scripts/migration-practice-skill-ratings.sql', import.meta.url),'utf8'))
    const finance = await readFile(new URL('../../../scripts/migration-practice-finance.sql', import.meta.url),'utf8')
    await db.exec(finance); await db.exec(finance)
    const pair='40000000-0000-4000-8000-000000000001'
    await db.query("INSERT INTO practice_pairings(id,community_id,requester_user_id,addressee_user_id,status) VALUES($1,$2,$3,$4,'accepted')",[pair,c,ids[0],ids[1]])
    const as = async i => db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids[i]}',false)`)
    await as(0)
    expect((await db.query('SELECT practice_finance_supported() AS ready')).rows[0].ready).toBe(true)
    await db.query('SELECT practice_recommendation_preferences_save($1,$2,$3,false)',[c,['finance_dcf'],['finance_underwriting']])
    const created=await db.query("SELECT propose_practice_session($1,now()+interval '1 day',60,'America/Toronto','virtual','','quick_skill_drill','finance','finance_dcf') AS s",[pair])
    const sid=created.rows[0].s.id
    await expect(db.query("SELECT propose_practice_session($1,now()+interval '1 day',60,'America/Toronto','virtual','','quick_skill_drill','finance','structuring')",[pair])).rejects.toThrow('invalid_session_agreement')
    await db.exec(`RESET ROLE; UPDATE practice_sessions SET status='scheduled',scheduled_start=now()-interval '1 hour' WHERE id='${sid}'`)
    const confirm=(observations={finance_dcf:['what','why']})=>db.query("SELECT submit_practice_confirmation_with_finance($1,'completed',true,true,NULL,'explain_calculations','Explain assumptions',ARRAY['finance_dcf'],$2::jsonb,$3::jsonb)",[sid,JSON.stringify({finance_dcf:4}),JSON.stringify(observations)])
    await as(2); await expect(confirm()).rejects.toThrow('not_participant')
    await as(0); await expect(confirm({finance_dcf:['invented']})).rejects.toThrow('invalid_finance_observations')
    await expect(confirm({finance_dcf:['why','why']})).rejects.toThrow('invalid_finance_observations')
    await expect(confirm({finance_valuation:['how']})).rejects.toThrow('invalid_finance_observations')
    await confirm()
    expect((await db.query('SELECT * FROM practice_skill_ratings')).rows).toHaveLength(0)
    await db.exec(`RESET ROLE; CREATE FUNCTION reject_finance_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'evidence_storage_failure'; END $$;
      CREATE TRIGGER reject_finance_update BEFORE UPDATE ON practice_skill_ratings FOR EACH ROW EXECUTE FUNCTION reject_finance_update();`)
    await as(1); await expect(confirm({finance_dcf:['how']})).rejects.toThrow('evidence_storage_failure')
    await db.exec('RESET ROLE')
    expect((await db.query('SELECT * FROM practice_exchange_tokens')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM practice_session_confirmations')).rows).toHaveLength(1)
    await db.exec('DROP TRIGGER reject_finance_update ON practice_skill_ratings')
    await as(1); await confirm({finance_dcf:['how']})
    const received=(await db.query('SELECT * FROM practice_skill_ratings')).rows
    expect(received).toHaveLength(2)
    expect(received.find(r=>r.author_user_id===ids[0]).finance_observations).toEqual({finance_dcf:['what','why']})
    await expect(confirm()).rejects.toThrow('invalid_state')
    await as(2); expect((await db.query('SELECT * FROM practice_skill_ratings')).rows).toHaveLength(0)
    await db.exec(`RESET ROLE; INSERT INTO blocks VALUES('${ids[0]}','${ids[1]}')`)
    await as(0); expect((await db.query('SELECT * FROM practice_skill_ratings')).rows).toHaveLength(0)
    await expect(db.query("UPDATE practice_skill_ratings SET finance_observations='{}'")).rejects.toThrow('permission denied')
    await db.exec('RESET ROLE')
    expect((await db.query('SELECT * FROM practice_exchange_tokens')).rows).toHaveLength(1)
    await db.exec('SET ROLE anon')
    await expect(db.query('SELECT practice_finance_supported()')).rejects.toThrow('permission denied')
  } finally { await db.close() }
},30000)
