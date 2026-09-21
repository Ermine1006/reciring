import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('corrects both years without bypassing access or losing existing Buddy activity',async()=>{
 const db=await PGlite.create()
 const ids=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`)
 const p='10000000-0000-4000-8000-000000000001',c='20000000-0000-4000-8000-000000000001'
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   CREATE TABLE profiles(id uuid PRIMARY KEY,name text);CREATE TABLE communities(id uuid PRIMARY KEY);
   CREATE TABLE community_members(community_id uuid,user_id uuid,status text);CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
   GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
   INSERT INTO communities VALUES('${c}');
   INSERT INTO auth.users VALUES ${ids.map((id,i)=>`('${id}','s${i}@rotman.utoronto.ca',now())`).join(',')};
   INSERT INTO profiles SELECT id,email FROM auth.users;
   INSERT INTO community_members SELECT '${c}',id,'member' FROM auth.users WHERE id<>'${ids[3]}';`)
  for(const file of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-open-access.sql','migration-buddy-assigned.sql','migration-buddy-change-year.sql','migration-buddy-change-year.sql'])
   await db.exec(await readFile(new URL(`../../../scripts/${file}`,import.meta.url),'utf8'))
  await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${p}','${c}','Test',3);
   INSERT INTO buddy_choice_members VALUES('${p}','${ids[0]}','first',true),('${p}','${ids[1]}','upper',true);`)
  const as=async n=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${ids[n]}',false)`)
  const change=role=>db.query('select buddy_choice_change_year($1,$2)',[p,role])
  const state=async()=>(await db.query('select buddy_choice_state($1) as value',[p])).rows[0].value
  await as(0);await change('upper');expect((await state()).role).toBe('upper')
  await change('upper');await change('first');expect((await state()).role).toBe('first')
  for(const invalid of [null,'second','coordinator'])await expect(change(invalid)).rejects.toThrow('Choose first year')
  await as(2);await expect(change('first')).rejects.toThrow('Join the Buddy Program first')
  await as(3);await expect(change('upper')).rejects.toThrow('Join your student community')
  await as(0);await db.exec(`RESET ROLE;UPDATE buddy_choice_members SET active=false WHERE user_id='${ids[0]}';SET ROLE authenticated`)
  await expect(change('upper')).rejects.toThrow('participation is paused')
  await db.exec(`RESET ROLE;UPDATE buddy_choice_members SET active=true;UPDATE buddy_programs SET choice_enabled=false;SET ROLE authenticated`)
  await expect(change('upper')).rejects.toThrow('Year changes are paused')
  await db.exec('RESET ROLE;UPDATE buddy_programs SET choice_enabled=true;SET ROLE authenticated')
  const post=(await db.query('select buddy_choice_publish($1,$2) as value',[p,{needs:'Advice',offers:'',helpType:['Advice'],industry:[]}])).rows[0].value
  await expect(change('upper')).rejects.toThrow('published Buddy post')
  await as(1);await db.query('select buddy_choice_select($1)',[post]);await expect(change('first')).rejects.toThrow('invitation or connection')
  const invite=(await state()).invitations[0].id
  await as(0);await db.query("select buddy_choice_respond($1,'accept')",[invite]);await expect(change('upper')).rejects.toThrow('invitation or connection')
  expect((await state()).role).toBe('first');expect((await state()).invitations[0].status).toBe('accepted')
  await db.query('select buddy_choice_remove($1)',[post]);await change('upper');await change('first')
  await as(1);await db.query('select buddy_assigned_add($1,$2)',[p,[{email:'s0@rotman.utoronto.ca'}]])
  await expect(change('first')).rejects.toThrow('school Buddy pairing')
  await as(0);const pairs=(await db.query('select buddy_assigned_state($1) as value',[p])).rows[0].value.pairs
  await expect(change('upper')).rejects.toThrow('school Buddy pairing')
  await db.query('select buddy_assigned_confirm($1,true)',[pairs[0].id]);await db.query('select buddy_assigned_ask($1,$2)',[pairs[0].id,'Keep this private question'])
  await expect(change('upper')).rejects.toThrow('school Buddy pairing')
  expect((await db.query('select buddy_assigned_state($1) as value',[p])).rows[0].value.pairs[0].requests[0].body).toBe('Keep this private question')
  // A pairing in the correct role must not trap someone who previously chose the wrong year.
  await db.exec(`RESET ROLE;UPDATE buddy_choice_members SET role='upper' WHERE user_id='${ids[0]}';SET ROLE authenticated`)
  await change('first');expect((await state()).role).toBe('first')
  await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");await expect(change('upper')).rejects.toThrow('Please sign in')
  await db.exec('RESET ROLE;SET ROLE anon');await expect(change('upper')).rejects.toThrow('permission denied')
 }finally{await db.close()}
},30000)
