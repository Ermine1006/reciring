import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('lets only the mentor withdraw a pending assigned pairing and hides it from both users',async()=>{
 const db=await PGlite.create()
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003']
 const p='10000000-0000-4000-8000-000000000001',c='20000000-0000-4000-8000-000000000001'
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   CREATE TABLE profiles(id uuid PRIMARY KEY,name text);CREATE TABLE communities(id uuid PRIMARY KEY);
   CREATE TABLE community_members(community_id uuid,user_id uuid,status text);CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
   GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
   INSERT INTO communities VALUES('${c}');
   INSERT INTO auth.users VALUES('${ids[0]}','admin@rotman.utoronto.ca',now()),('${ids[1]}','mentor@rotman.utoronto.ca',now()),('${ids[2]}','student@rotman.utoronto.ca',now());
   INSERT INTO profiles VALUES('${ids[0]}','Admin'),('${ids[1]}','Mentor'),('${ids[2]}','Student');
   INSERT INTO community_members SELECT '${c}',id,'member' FROM auth.users;`)

  for(const file of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-open-access.sql','migration-buddy-assigned.sql','migration-buddy-assigned-withdraw.sql']){
   await db.exec(await readFile(new URL(`../../../scripts/${file}`,import.meta.url),'utf8'))
  }

  await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${p}','${c}','Test',3);
   INSERT INTO buddy_coordinators VALUES('${p}','${ids[0]}');
   INSERT INTO buddy_choice_members VALUES('${p}','${ids[1]}','upper',true),('${p}','${ids[2]}','first',true);`)

  const as=async id=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`)
  const state=async()=> (await db.query('select buddy_assigned_state($1) as value',[p])).rows[0].value

  await as(ids[1])
  await db.query('select buddy_assigned_add($1,$2)',[p,[{name:'Student',email:'student@rotman.utoronto.ca'}]])
  let mentorState=await state()
  expect(mentorState.pairs).toHaveLength(1)
  const pair=mentorState.pairs[0].id

  await as(ids[2])
  expect((await state()).pairs).toHaveLength(1)
  await expect(db.query('select buddy_assigned_withdraw($1)',[pair])).rejects.toThrow('Only your pending')

  await as(ids[1])
  await db.query('select buddy_assigned_withdraw($1)',[pair])
  expect((await state()).pairs).toEqual([])

  await as(ids[2])
  expect((await state()).pairs).toEqual([])

  await as(ids[1])
  await db.query('select buddy_assigned_add($1,$2)',[p,[{name:'Student again',email:'student@rotman.utoronto.ca'}]])
  mentorState=await state()
  expect(mentorState.pairs).toHaveLength(1)
  expect(mentorState.pairs[0].status).toBe('pending')

  const newPending=mentorState.pairs[0].id
  await as(ids[2])
  await db.query('select buddy_assigned_confirm($1,true)',[newPending])
  await as(ids[1])
  await expect(db.query('select buddy_assigned_withdraw($1)',[newPending])).rejects.toThrow('Only your pending')
 }finally{await db.close()}
},30000)
