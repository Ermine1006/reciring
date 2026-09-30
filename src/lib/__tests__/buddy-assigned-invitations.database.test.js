import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('discovers a verified email invitation before enrolment and accepts atomically without bypassing access rules',async()=>{
 const db=await PGlite.create(),ids=Array.from({length:8},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`)
 const program='10000000-0000-4000-8000-000000000001',community='20000000-0000-4000-8000-000000000001'
 const emails=['admin@rotman.utoronto.ca','serine@rotman.utoronto.ca','erminelyu@gmail.com','othermentor@rotman.utoronto.ca','unverified@gmail.com','applicant@gmail.com','paused@gmail.com','outsider@gmail.com']
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   CREATE TABLE profiles(id uuid PRIMARY KEY,name text);
   CREATE TABLE communities(id uuid PRIMARY KEY);CREATE TABLE community_members(community_id uuid,user_id uuid,status text);
   CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
   CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,body text,payload jsonb DEFAULT '{}'::jsonb,read_at timestamptz,created_at timestamptz DEFAULT now());
   GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
   INSERT INTO communities VALUES('${community}');
   INSERT INTO auth.users VALUES ${ids.map((id,i)=>`('${id}','${emails[i]}',${i===4?'null':'now()'})`).join(',')};
   INSERT INTO profiles SELECT id,email FROM auth.users;
   INSERT INTO community_members SELECT '${community}',id,'member' FROM auth.users WHERE id<>'${ids[7]}';`)
  for(const name of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-recommendations.sql','migration-buddy-open-access.sql','migration-buddy-assigned.sql','migration-buddy-assigned-withdraw.sql'])await db.exec(await readFile(new URL(`../../../scripts/${name}`,import.meta.url),'utf8'))
  await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${program}','${community}','Rotman Buddy Program',3);
   INSERT INTO buddy_choice_members VALUES('${program}','${ids[1]}','upper',true),('${program}','${ids[3]}','upper',true),('${program}','${ids[6]}','first',false);`)
  for(const name of ['migration-buddy-upper-approval.sql','migration-buddy-first-year-mentor-verification.sql','migration-buddy-assigned-invitations.sql','migration-buddy-assigned-invitations.sql'])await db.exec(await readFile(new URL(`../../../scripts/${name}`,import.meta.url),'utf8'))
  const as=async i=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${ids[i]}',false)`)
  const admin=async sql=>{await db.exec('RESET ROLE');try{return await db.query(sql)}finally{await db.exec('SET ROLE authenticated')}}
  const incoming=async()=>((await db.query('select buddy_assigned_invitations() value')).rows[0].value.invitations)
  const respond=(id,accept=true)=>db.query('select buddy_assigned_respond($1,$2) value',[id,accept])
  await as(1);await db.query('select buddy_assigned_add($1,$2)',[program,emails.slice(2).map(email=>({email}))])
  const pair=(await admin(`select id from buddy_assigned_pairs where student_email='${emails[2]}'`)).rows[0].id
  await as(2)
  expect(await incoming()).toEqual([expect.objectContaining({id:pair,can_accept:true,program_id:program})])
  expect((await admin(`select * from buddy_choice_members where user_id='${ids[2]}'`)).rows).toHaveLength(0)
  expect((await admin(`select student_id from buddy_assigned_pairs where id='${pair}'`)).rows[0].student_id).toBeNull()
  await as(3);await expect(respond(pair)).rejects.toThrow('no longer available')
  expect((await incoming())[0].can_accept).toBe(false)
  await as(4);expect(await incoming()).toEqual([])
  const unverified=(await admin(`select id from buddy_assigned_pairs where student_email='${emails[4]}'`)).rows[0].id
  await expect(respond(unverified)).rejects.toThrow('no longer available')
  await as(7);expect(await incoming()).toEqual([])
  const outsider=(await admin(`select id from buddy_assigned_pairs where student_email='${emails[7]}'`)).rows[0].id
  await expect(respond(outsider)).rejects.toThrow('no longer available')
  await as(5);await db.query('select buddy_upper_apply($1,$2,$3)',[program,['Advice'],[]])
  await admin(`update buddy_upper_applications set status='declined' where user_id='${ids[5]}'`)
  const applicant=(await incoming())[0];expect(applicant.can_accept).toBe(false)
  await expect(respond(applicant.id)).rejects.toThrow('upper year track')
  await as(6);const paused=(await incoming())[0];expect(paused.can_accept).toBe(false)
  await expect(respond(paused.id)).rejects.toThrow('paused')
  await as(2)
  await admin(`update buddy_upper_applications set status='paused' where user_id='${ids[1]}'`)
  expect(await incoming()).toEqual([]);await expect(respond(pair)).rejects.toThrow('no longer available')
  await admin(`update buddy_upper_applications set status='approved' where user_id='${ids[1]}'`)
  await admin(`INSERT INTO blocks VALUES('${ids[2]}','${ids[1]}')`)
  expect(await incoming()).toEqual([]);await expect(respond(pair)).rejects.toThrow('no longer available')
  await admin('DELETE FROM blocks')
  await respond(pair,false);expect(await incoming()).toEqual([])
  expect((await admin(`select * from buddy_choice_members where user_id='${ids[2]}'`)).rows).toHaveLength(0)
  await admin(`update buddy_assigned_pairs set status='pending',student_id=null where id='${pair}'`)
  await as(1);await db.query('select buddy_assigned_withdraw($1)',[pair])
  await as(2);expect(await incoming()).toEqual([]);await expect(respond(pair)).rejects.toThrow('no longer available')
  await admin(`update buddy_assigned_pairs set status='pending' where id='${pair}'`)
  await admin(`update auth.users set email='ERMINELYU@gmail.com' where id='${ids[2]}'`)
  await db.query('select buddy_first_year_request($1,$2)',[program,emails[3]])
  const accepted=(await respond(pair)).rows[0].value
  expect(accepted).toEqual({program_id:program,pair_id:pair,status:'confirmed'})
  expect(await incoming()).toEqual([])
  expect((await admin(`select role,active from buddy_choice_members where user_id='${ids[2]}'`)).rows[0]).toEqual({role:'first',active:true})
  expect((await db.query('select buddy_assigned_state($1) value',[program])).rows[0].value.pairs[0].status).toBe('confirmed')
  expect((await db.query('select buddy_first_year_access_state($1) value',[program])).rows[0].value.request.status).toBe('cancelled')
  await expect(respond(pair)).rejects.toThrow('no longer available')
  await as(3);await db.query('select buddy_assigned_add($1,$2)',[program,[{email:emails[2]}]])
  await as(2);const second=(await incoming())[0];expect(second.can_accept).toBe(false)
  await expect(respond(second.id)).rejects.toThrow('already have a confirmed Buddy')
  await db.exec('RESET ROLE;SET ROLE anon');await expect(incoming()).rejects.toThrow('permission denied')
  await expect(respond(pair)).rejects.toThrow('permission denied')
 }finally{await db.close()}
},30000)
