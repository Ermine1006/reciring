import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('supports all audience combinations atomically while preserving single-audience privacy and editing',async()=>{
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

  await db.exec(await readFile(new URL('../../../scripts/migration-buddy-post-multi-audiences.sql',import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../../../scripts/migration-buddy-post-multi-audiences.sql',import.meta.url),'utf8'))
  await db.exec('ALTER TABLE buddy_choice_invites ADD COLUMN match_id uuid')

  const publicCount=async()=>{await db.exec('RESET ROLE');try{return (await db.query('select count(*)::int n from posts')).rows[0].n}finally{await db.exec('SET ROLE authenticated')}}
  const as=async id=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`)
  const payload=(audience,title)=>({needs:title,offers:'Resume help',helpType:['Advice'],industry:['Finance'],time:'30 min',urgency:null,expiresAt:null,is_anonymous:true,audience})

  await as(ids[2])
  const myBuddy=(await db.query('select buddy_choice_publish($1,$2) as id',[p,payload('assigned_buddy','Buddy only')])).rows[0].id
  const program=(await db.query('select buddy_choice_publish($1,$2) as id',[p,payload('buddy_program','Program only')])).rows[0].id
  const whole=(await db.query('select buddy_choice_publish($1,$2) as id',[p,payload('whole_community','Whole community')])).rows[0].id

  expect(await publicCount()).toBe(1)

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
  expect(await publicCount()).toBe(0)

  // Each non-empty subset is persisted as one Buddy post, with at most one public mirror.
  await db.exec(`RESET ROLE;INSERT INTO buddy_choice_members VALUES('${p}','${ids[0]}','upper',true);SET ROLE authenticated`)
  const all=['assigned_buddy','buddy_program','whole_community']
  const multi=audiences=>({...payload('buddy_program','Multi audience'),audiences})
  const own=async id=>(await db.query('select buddy_choice_state($1) value',[p])).rows[0].value.posts.find(x=>x.id===id)
  for(let mask=1;mask<8;mask++){
   const audiences=all.filter((_,i)=>mask&(1<<i));await as(ids[2])
   const id=(await db.query('select buddy_choice_publish_multi($1,$2) id',[p,multi(audiences)])).rows[0].id
   expect((await own(id)).audiences).toEqual(audiences)
   expect(await publicCount()).toBe(audiences.includes('whole_community')?1:0)
   await as(ids[1]);const assigned=(await db.query('select buddy_assigned_state($1) value',[p])).rows[0].value
   expect(assigned.pairs[0].posts.some(x=>x.id===id)).toBe(audiences.includes('assigned_buddy'))
   await as(ids[0]);expect(Boolean(await own(id))).toBe(audiences.includes('buddy_program'))
   await as(ids[2]);await db.query('select buddy_choice_remove($1)',[id])
   expect(await publicCount()).toBe(0)
  }
  for(const audiences of [[],['assigned_buddy','buddy_program','whole_community','extra'],['unknown'],['buddy_program','buddy_program'],['buddy_program',null],'buddy_program',null]){
   await expect(db.query('select buddy_choice_publish_multi($1,$2)',[p,multi(audiences)])).rejects.toThrow(/Choose/)
  }
  await expect(db.query('select buddy_choice_publish_multi($1,$2)',[p,payload('buddy_program','Missing selections')])).rejects.toThrow(/Choose/)
  await db.exec("RESET ROLE;UPDATE buddy_assigned_pairs SET status='pending';SET ROLE authenticated")
  await expect(db.query('select buddy_choice_publish_multi($1,$2)',[p,multi(all)])).rejects.toThrow('Confirm your assigned Buddy')
  expect(await publicCount()).toBe(0)
  await db.exec("RESET ROLE;UPDATE buddy_assigned_pairs SET status='confirmed';SET ROLE authenticated")
  const id=(await db.query('select buddy_choice_publish_multi($1,$2) id',[p,multi(all)])).rows[0].id
  const publicId=(await own(id)).public_post_id
  await as(ids[1]);await db.query('select buddy_choice_select($1)',[id])
  await as(ids[2]);await db.query('select buddy_choice_update_multi($1,$2)',[id,multi([...all].reverse())])
  expect((await own(id)).public_post_id).toBe(publicId)
  expect(await publicCount()).toBe(1)
  const invitations=(await db.query('select buddy_choice_state($1) value',[p])).rows[0].value.invitations
  expect(invitations.find(x=>x.post_id===id).status).toBe('pending')
  await db.query('select buddy_choice_update_multi($1,$2)',[id,multi(['buddy_program'])])
  expect((await own(id)).audiences).toEqual(['buddy_program'])
  expect(await publicCount()).toBe(0)
  await as(ids[1]);const afterEdit=(await db.query('select buddy_assigned_state($1) value',[p])).rows[0].value
  expect(afterEdit.pairs[0].posts.some(x=>x.id===id)).toBe(false)
  await expect(db.query('select buddy_choice_update_multi($1,$2)',[id,multi(all)])).rejects.toThrow('Post not available')
  await db.exec('RESET ROLE;SET ROLE anon')
  await expect(db.query('select buddy_choice_publish_multi($1,$2)',[p,multi(all)])).rejects.toThrow('permission denied')
 }finally{await db.close()}
},30000)
