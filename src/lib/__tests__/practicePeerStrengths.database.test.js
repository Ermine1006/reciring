import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

it('collects peer strengths atomically and ranks only consented verified evidence', async () => {
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
    const sid = '30000000-0000-4000-8000-000000000001'
    await db.query(`INSERT INTO practice_sessions(id,community_id,participant_a_user_id,participant_b_user_id,status,interview_category,scheduled_start) VALUES($1,$2,$3,$4,'scheduled','case',now()-interval '1 hour')`,[sid,c,ids[3],ids[2]])
    const as = async i => db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids[i]}',false)`)
    const get = async () => (await db.query('SELECT browse_practice_recommendations($1) AS card',[c])).rows.map(r=>r.card)
    const confirm = (skills, outcome='completed') => db.query("SELECT submit_practice_confirmation_with_strengths($1,$2,true,true,NULL,NULL,'',$3)",[sid,outcome,skills])
    await as(0)
    await db.query('SELECT practice_recommendation_preferences_save($1,$2,$3,false)',[c,[],['synthesis']])
    await expect(confirm(['synthesis'])).rejects.toThrow('not_participant')
    await as(3)
    await expect(confirm(['invented'])).rejects.toThrow('invalid_strength_skills')
    await expect(confirm(['concision'])).rejects.toThrow('invalid_strength_skills')
    await expect(confirm(['synthesis','synthesis'])).rejects.toThrow('invalid_strength_skills')
    await expect(confirm(['synthesis'],'cancelled')).rejects.toThrow('strengths_require_completed_rounds')
    await confirm(['synthesis'])
    await expect(confirm(['communication'])).rejects.toThrow('already_confirmed')
    await as(2); await db.query('SELECT practice_peer_strengths_sharing($1,true)',[c])
    await as(0); expect((await get()).find(r=>r.request_id===rid(2)).recommendation.peer_strengths).toEqual([])
    // Force a storage failure after the underlying confirmation verifies.
    // The wrapper must roll back the confirmation AND minted token.
    await db.exec(`RESET ROLE; CREATE FUNCTION reject_strength_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'storage_failure'; END $$; CREATE TRIGGER reject_strength BEFORE INSERT ON practice_peer_strengths FOR EACH ROW EXECUTE FUNCTION reject_strength_test();`)
    await as(2); await expect(confirm(['communication'])).rejects.toThrow('storage_failure')
    await db.exec('RESET ROLE'); expect((await db.query('SELECT * FROM practice_exchange_tokens')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM practice_session_confirmations')).rows).toHaveLength(1)
    await db.exec('DROP TRIGGER reject_strength ON practice_peer_strengths')
    await as(2); await confirm(['communication'])
    await as(0); let cards=await get()
    expect(cards[0].request_id).toBe(rid(2))
    expect(cards[0].recommendation.peer_strengths).toEqual([{skill:'synthesis',partners:1}])
    expect(cards[0].recommendation.peer_relevant_skills).toEqual(['synthesis'])
    for(const id of ids) expect(JSON.stringify(cards)).not.toContain(id)
    expect((await db.query('SELECT * FROM practice_peer_strengths')).rows).toEqual([])
    await expect(db.query('SELECT practice_peer_strength_evidence($1,$2)',[ids[2],c])).rejects.toThrow('permission denied')
    await expect(db.query('DELETE FROM practice_peer_strengths')).rejects.toThrow('permission denied')
    // Repeated sessions with the same partner do not inflate the badge.
    await db.exec(`RESET ROLE; INSERT INTO practice_sessions(id,community_id,participant_a_user_id,participant_b_user_id,status,interview_category) VALUES('30000000-0000-4000-8000-000000000002','${c}','${ids[3]}','${ids[2]}','verified','case'); INSERT INTO practice_peer_strengths SELECT '30000000-0000-4000-8000-000000000002',author_user_id,recipient_user_id,community_id,skills FROM practice_peer_strengths WHERE author_user_id='${ids[3]}';`)
    await as(0); expect((await get())[0].recommendation.peer_strengths).toEqual([{skill:'synthesis',partners:1}])
    await as(2); await db.query('SELECT practice_peer_strengths_sharing($1,false)',[c])
    await as(0); expect((await get()).find(r=>r.request_id===rid(2)).recommendation.peer_strengths).toEqual([])
    await as(2); await db.query('SELECT practice_peer_strengths_sharing($1,true)',[c])
    await db.exec(`RESET ROLE; UPDATE practice_sessions SET status='disputed';`)
    await as(0); expect((await get()).find(r=>r.request_id===rid(2)).recommendation.peer_strengths).toEqual([])
    await db.exec('RESET ROLE'); expect((await db.query('SELECT * FROM practice_exchange_tokens')).rows).toHaveLength(1)
    await db.exec('SET ROLE anon'); await expect(get()).rejects.toThrow('permission denied')
  } finally { await db.close() }
},30000)
