import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('separates My Buddy, Buddy Program and Whole community post audiences and supports edits',async()=>{
 const db=await PGlite.create()
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003']
 const p='10000000-0000-4000-8000-000000000001',c='20000000-0000-4000-8000-000000000001'
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   CREATE TABLE profiles(id uuid PRIMARY KEY,name text);
   CREATE TABLE communities(id uuid PRIMARY KEY);CREATE TABLE community_members(community_id uuid,user_id uuid,status text);
   CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
   CREATE TABLE posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid,need_text text,offer_text text,help_type text[],industry_tag text[],time_commitment text,urgency text,expires_at timestamptz,is_anonymous boolean,created_at timestamptz DEFAULT now());
   CREATE TABLE matches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),post_id uuid,requester_user_id uuid,helper_user_id uuid,status text,source text DEFAULT 'post',created_at timestamptz DEFAULT now());
   CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,title text,body text,payload jsonb DEFAULT '{}'::jsonb,read_at timestamptz,created_at timestamptz DEFAULT now());
   GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
   INSERT INTO communities VALUES('${c}');
   INSERT INTO auth.users VALUES('${ids[0]}','admin@rotman.utoronto.ca',now()),('${ids[1]}','mentor@rotman.utoronto.ca',now()),('${ids[2]}','sara@rotman.utoronto.ca',now());
   INSERT INTO profiles VALUES('${ids[0]}','Admin'),('${ids[1]}','Serine'),('${ids[2]}','Sara');
   INSERT INTO community_members SELECT '${c}',id,'member' FROM auth.users;`)

  for(const file of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-recommendations.sql','migration-buddy-open-access.sql','migration-buddy-assigned.sql','migration-buddy-assigned-withdraw.sql']){
   await db.exec(await readFile(new URL(`../../../scripts/${file}`,import.meta.url),'utf8'))
  }

  await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${p}','${c}','Test',3);
   INSERT INTO buddy_coordinators VALUES('${p}','${ids[0]}');
   INSERT INTO buddy_choice_members VALUES('${p}','${ids[1]}','upper',true),('${p}','${ids[2]}','first',true);
   INSERT INTO buddy_assigned_pairs(program_id,mentor_id,student_email,student_label,student_id,status) VALUES('${p}','${ids[1]}','sara@rotman.utoronto.ca','Sara','${ids[2]}','confirmed');`)

  await db.exec(`CREATE TABLE buddy_upper_applications(program_id uuid,user_id uuid,help_topics text[],career_focus text[],status text,submitted_at timestamptz DEFAULT now(),reviewed_at timestamptz);
   INSERT INTO buddy_upper_applications VALUES('${p}','${ids[1]}',ARRAY['Advice'],ARRAY[]::text[],'approved',now(),now());`)

  await db.exec(await readFile(new URL('../../../scripts/migration-buddy-post-audiences-edit.sql',import.meta.url),'utf8'))

  const as=async id=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`)
  const payload=(audience,title)=>({needs:title,offers:'Resume help',helpType:['Advice'],industry:['Finance'],time:'30 min',urgency:null,expiresAt:null,is_anonymous:true,audience})

  await as(ids[2])
  const myBuddy=(await db.query('select buddy_choice_publish($1,$2) as id',[p,payload('assigned_buddy','Buddy only')])).rows[0].id
  const program=(await db.query('select buddy_choice_publish($1,$2) as id',[p,payload('buddy_program','Program only')])).rows[0].id
  const whole=(await db.query('select buddy_choice_publish($1,$2) as id',[p,payload('whole_community','Whole community')])).rows[0].id

  expect((await db.query('select count(*)::int n from posts')).rows[0].n).toBe(1)

  await as(ids[1])
  let state=(await db.query('select buddy_choice_state($1) value',[p])).rows[0].value
  expect(state.posts.map(x=>x.needs)).toEqual(['Program only'])
  const assigned=(await db.query('select buddy_assigned_state($1) value',[p])).rows[0].value
  expect(assigned.pairs[0].posts.map(x=>x.needs)).toEqual(['Buddy only'])
  await expect(db.query('select buddy_choice_select($1)',[myBuddy])).rejects.toThrow('not shared with Buddy Program')

  await as(ids[2])
  await db.query('select buddy_choice_update($1,$2)',[program,payload('assigned_buddy','Edited for my Buddy')])
  await as(ids[1])
  state=(await db.query('select buddy_choice_state($1) value',[p])).rows[0].value
  expect(state.posts).toEqual([])
  const after=(await db.query('select buddy_assigned_state($1) value',[p])).rows[0].value
  expect(after.pairs[0].posts.map(x=>x.needs)).toContain('Edited for my Buddy')

  await as(ids[2])
  await db.query('select buddy_choice_remove($1)',[whole])
  expect((await db.query('select count(*)::int n from posts')).rows[0].n).toBe(0)
 }finally{await db.close()}
},30000)
