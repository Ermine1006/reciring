import {expect,it} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('keeps first year requests private until an upper year application is approved',async()=>{
 const db=await PGlite.create()
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003']
 const program='10000000-0000-4000-8000-000000000001',community='20000000-0000-4000-8000-000000000001'
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE profiles(id uuid PRIMARY KEY,name text);
   CREATE TABLE communities(id uuid PRIMARY KEY);CREATE TABLE community_members(community_id uuid,user_id uuid,status text);
   CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);CREATE TABLE buddy_assigned_pairs(program_id uuid,mentor_id uuid,student_id uuid,status text);
   GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
   INSERT INTO communities VALUES('${community}');
   INSERT INTO auth.users VALUES('${ids[0]}','admin@example.test'),('${ids[1]}','first@example.test'),('${ids[2]}','upper@example.test');
   INSERT INTO profiles VALUES('${ids[0]}','Admin'),('${ids[1]}','First Student'),('${ids[2]}','Upper Student');
   INSERT INTO community_members SELECT '${community}',id,'member' FROM auth.users;`)
  for(const name of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-recommendations.sql','migration-buddy-open-access.sql']){
   await db.exec(await readFile(new URL(`../../../scripts/${name}`,import.meta.url),'utf8'))
  }
  await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${program}','${community}','Test',3);
   INSERT INTO buddy_coordinators VALUES('${program}','${ids[0]}');`)
  await db.exec(await readFile(new URL('../../../scripts/migration-buddy-upper-approval.sql',import.meta.url),'utf8'))
  const as=async id=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`)
  const state=async()=> (await db.query('select buddy_choice_state($1) as value',[program])).rows[0].value

  await as(ids[1]);await db.query('select buddy_choice_join($1)',[program])
  const post=(await db.query('select buddy_choice_publish($1,$2) as value',[program,{needs:'MBA advice',offers:'Presentation help',helpType:['Advice'],industry:['Consulting'],time:'30 min',is_anonymous:true}])).rows[0].value

  await as(ids[2])
  await expect(db.query('select buddy_choice_join_upper($1)',[program])).rejects.toThrow('requires an application')
  await db.query('select buddy_upper_apply($1,$2,$3)',[program,['Advice'],['Consulting']])
  let pending=await state()
  expect(pending.role).toBeNull();expect(pending.posts).toEqual([])
  expect(pending.upper_application).toMatchObject({status:'pending',help_topics:['Advice'],career_focus:['Consulting']})
  await expect(db.query('select buddy_choice_select($1)',[post])).rejects.toThrow(/Upper-year access|required|unavailable/i)

  await as(ids[0]);let admin=await state()
  expect(admin.upper_applications).toHaveLength(1)
  expect(admin.upper_applications[0]).toMatchObject({name:'Upper Student',status:'pending',help_topics:['Advice']})
  await db.query('select buddy_upper_application_decide($1,$2,$3)',[program,ids[2],'approve'])

  await as(ids[2]);const approved=await state()
  expect(approved.role).toBe('upper');expect(approved.posts.map(x=>x.id)).toContain(post)
  const rec=(await db.query('select buddy_recommendations($1,$2) as value',[program,null])).rows[0].value
  expect(rec.profile).toMatchObject({help_types:['Advice'],career_focus:['Consulting'],discoverable:false})

  await as(ids[0]);await db.query('select buddy_upper_application_decide($1,$2,$3)',[program,ids[2],'pause'])
  await as(ids[2]);const paused=await state()
  expect(paused.role).toBeNull();expect(paused.posts).toEqual([])
  expect(paused.upper_application.status).toBe('paused')
 }finally{await db.close()}
},30000)
