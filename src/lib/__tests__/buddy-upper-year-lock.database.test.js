import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('prevents an upper year applicant from self enrolling as first year',async()=>{
 const db=await PGlite.create()
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002']
 const p='10000000-0000-4000-8000-000000000001',c='20000000-0000-4000-8000-000000000001'
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE profiles(id uuid PRIMARY KEY,name text);
   CREATE TABLE communities(id uuid PRIMARY KEY);CREATE TABLE community_members(community_id uuid,user_id uuid,status text);
   CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);CREATE TABLE buddy_assigned_pairs(program_id uuid,mentor_id uuid,student_id uuid,status text);
   GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
   INSERT INTO communities VALUES('${c}');
   INSERT INTO auth.users VALUES('${ids[0]}','admin@example.test'),('${ids[1]}','upper@example.test');
   INSERT INTO profiles VALUES('${ids[0]}','Admin'),('${ids[1]}','Upper Applicant');
   INSERT INTO community_members SELECT '${c}',id,'member' FROM auth.users;`)

  for(const file of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-recommendations.sql','migration-buddy-open-access.sql']){
   await db.exec(await readFile(new URL(`../../../scripts/${file}`,import.meta.url),'utf8'))
  }

  await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${p}','${c}','Test',3);
   INSERT INTO buddy_coordinators VALUES('${p}','${ids[0]}');`)

  await db.exec(await readFile(new URL('../../../scripts/migration-buddy-upper-approval.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../../scripts/migration-buddy-lock-upper-application-year.sql',import.meta.url),'utf8'))

  await db.exec(`SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${ids[1]}',false)`)

  await db.query('select buddy_upper_apply($1,$2,$3)',[p,['Advice'],['Finance']])

  await expect(
    db.query('select buddy_choice_join($1)',[p])
  ).rejects.toThrow('upper year application track')

  const state=(await db.query('select buddy_choice_state($1) as value',[p])).rows[0].value
  expect(state.role).toBeNull()
  expect(state.upper_application.status).toBe('pending')

  await db.exec(`RESET ROLE;UPDATE buddy_upper_applications SET status='declined' WHERE program_id='${p}' AND user_id='${ids[1]}';SET ROLE authenticated`)
  await expect(
    db.query('select buddy_choice_join($1)',[p])
  ).rejects.toThrow('upper year application track')
 }finally{await db.close()}
},30000)
