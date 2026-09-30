import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('requires the requested approved mentor to verify first year access',async()=>{
 const db=await PGlite.create()
 const ids=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`)
 const p='10000000-0000-4000-8000-000000000001',c='20000000-0000-4000-8000-000000000001'
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE profiles(id uuid PRIMARY KEY,name text);
   CREATE TABLE communities(id uuid PRIMARY KEY);CREATE TABLE community_members(community_id uuid,user_id uuid,status text);
   CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
   CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,body text,payload jsonb DEFAULT '{}'::jsonb,read_at timestamptz,created_at timestamptz DEFAULT now());
   CREATE TABLE buddy_assigned_pairs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),program_id uuid,mentor_id uuid,student_email text,student_label text DEFAULT '',student_id uuid,status text DEFAULT 'pending',created_at timestamptz DEFAULT now(),UNIQUE(program_id,mentor_id,student_email));
   CREATE UNIQUE INDEX buddy_assigned_one_mentor ON buddy_assigned_pairs(program_id,student_id) WHERE status='confirmed';
   GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
   INSERT INTO communities VALUES('${c}');
   INSERT INTO auth.users VALUES('${ids[0]}','admin@rotman.utoronto.ca'),('${ids[1]}','mentor@rotman.utoronto.ca'),('${ids[2]}','student@rotman.utoronto.ca'),('${ids[3]}','other@rotman.utoronto.ca');
   INSERT INTO profiles VALUES('${ids[0]}','Admin'),('${ids[1]}','Mentor'),('${ids[2]}','Milan Patel'),('${ids[3]}','Other Mentor');
   INSERT INTO community_members SELECT '${c}',id,'member' FROM auth.users;`)

  for(const file of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-recommendations.sql','migration-buddy-open-access.sql']){
   await db.exec(await readFile(new URL(`../../../scripts/${file}`,import.meta.url),'utf8'))
  }
  await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${p}','${c}','Test',3);INSERT INTO buddy_coordinators VALUES('${p}','${ids[0]}');`)
  await db.exec(await readFile(new URL('../../../scripts/migration-buddy-upper-approval.sql',import.meta.url),'utf8'))
  await db.exec(`INSERT INTO buddy_choice_members VALUES('${p}','${ids[1]}','upper',true),('${p}','${ids[3]}','upper',true);
   INSERT INTO buddy_upper_applications(program_id,user_id,help_topics,career_focus,status) VALUES('${p}','${ids[1]}',ARRAY['Advice'],ARRAY[]::text[],'approved'),('${p}','${ids[3]}',ARRAY['Advice'],ARRAY[]::text[],'approved') ON CONFLICT(program_id,user_id) DO UPDATE SET status='approved';`)
  await db.exec(await readFile(new URL('../../../scripts/migration-buddy-first-year-mentor-verification.sql',import.meta.url),'utf8'))

  const as=async id=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`)
  await as(ids[2])
  const req=(await db.query('select buddy_first_year_request($1,$2) as id',[p,'mentor@rotman.utoronto.ca'])).rows[0].id
  let state=(await db.query('select buddy_first_year_access_state($1) as value',[p])).rows[0].value
  expect(state.request.status).toBe('pending_verification')
  await expect(db.query('select buddy_choice_join($1)',[p])).rejects.toThrow('requires verification')

  await as(ids[3])
  await expect(db.query('select buddy_first_year_verify($1,true)',[req])).rejects.toThrow('not available')

  await as(ids[1])
  state=(await db.query('select buddy_first_year_access_state($1) as value',[p])).rows[0].value
  expect(state.incoming[0].name).toBe('Milan Patel')
  await db.query('select buddy_first_year_verify($1,true)',[req])

  await as(ids[2])
  const role=(await db.query('select role from buddy_choice_members where program_id=$1 and user_id=$2',[p,ids[2]])).rows[0].role
  expect(role).toBe('first')
  const pair=(await db.query('select status,mentor_id from buddy_assigned_pairs where program_id=$1 and student_id=$2',[p,ids[2]])).rows[0]
  expect(pair.status).toBe('confirmed')
  expect(pair.mentor_id).toBe(ids[1])
  state=(await db.query('select buddy_first_year_access_state($1) as value',[p])).rows[0].value
  expect(state.request.status).toBe('verified')
 }finally{await db.close()}
},30000)
