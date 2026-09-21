import {expect,it} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
it('protects manual buddy selection, first-year self enrollment, privacy and capacity',async()=>{
 const db=await PGlite.create();const ids=Array.from({length:6},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`),p='10000000-0000-4000-8000-000000000001',c='20000000-0000-4000-8000-000000000001'
 try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE profiles(id uuid PRIMARY KEY,name text);CREATE TABLE communities(id uuid PRIMARY KEY);CREATE TABLE community_members(community_id uuid,user_id uuid,status text);CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 INSERT INTO communities VALUES('${c}');INSERT INTO auth.users VALUES ${ids.map((id,i)=>`('${id}','s${i}@example.test')`).join(',')};INSERT INTO profiles SELECT id,email FROM auth.users;INSERT INTO community_members SELECT '${c}',id,'member' FROM auth.users WHERE id<>'${ids[5]}';`)
 await db.exec(await readFile(new URL('../../../scripts/migration-buddy-program.sql',import.meta.url),'utf8'))
 await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${p}','${c}','Test',1);INSERT INTO buddy_coordinators VALUES('${p}','${ids[0]}');`)
 const migration=await readFile(new URL('../../../scripts/migration-buddy-choice.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration)
 const openAccess=await readFile(new URL('../../../scripts/migration-buddy-open-access.sql',import.meta.url),'utf8');await db.exec(openAccess);await db.exec(openAccess)
 const as=async n=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${ids[n]}',false)`)
 const rpc=async(sql,args=[]) =>(await db.query(sql,args)).rows[0]?.value
 const state=()=>rpc('SELECT buddy_choice_state($1) AS value',[p])
 const post={needs:'Finance recruiting advice',offers:'Python skills',helpType:['Advice'],industry:['Finance'],time:'30 min',is_anonymous:true}
 await as(5);await expect(state()).rejects.toThrow('Program not available');await expect(db.query('select buddy_choice_join($1)',[p])).rejects.toThrow('Join your student community')
 await expect(db.query('select buddy_choice_join_upper($1)',[p])).rejects.toThrow('Join your student community')
 await as(1);await db.query('select buddy_choice_join($1)',[p]);const a=await rpc('select buddy_choice_publish($1,$2) as value',[p,post]);expect((await state()).posts).toHaveLength(1)
 await expect(db.query('select buddy_choice_join_upper($1)',[p])).rejects.toThrow('already registered as a first year');expect((await state()).role).toBe('first')
 await as(2);expect((await state()).posts).toHaveLength(0);await expect(db.query('select buddy_choice_select($1)',[a])).rejects.toThrow('Upper-year access');await expect(db.query('select buddy_choice_access($1,$2,true)',[p,'s2@example.test'])).rejects.toThrow('Coordinator access')
 await db.exec(`RESET ROLE;UPDATE buddy_programs SET choice_enabled=false WHERE id='${p}';SET ROLE authenticated`);await expect(db.query('select buddy_choice_join_upper($1)',[p])).rejects.toThrow('Joining is paused')
 await db.exec(`RESET ROLE;UPDATE buddy_programs SET choice_enabled=true WHERE id='${p}';SET ROLE authenticated`)
 await db.query('select buddy_choice_join_upper($1)',[p]);await db.query('select buddy_choice_join_upper($1)',[p]);expect((await state()).role).toBe('upper');expect((await state()).coordinator).toBe(false)
 await as(0);await db.query('select buddy_choice_access($1,$2,true)',[p,'s3@example.test']);expect((await state()).posts).toHaveLength(0)
 await as(2);expect((await state()).posts[0].name).toBeNull();await db.query('select buddy_choice_select($1)',[a]);expect((await state()).invitations[0].name).toBeNull();const invite=(await state()).invitations[0].id
 await as(4);await expect(db.query('select buddy_choice_respond($1,$2)',[invite,'accept'])).rejects.toThrow('Invitation not available');await db.query('select buddy_choice_join($1)',[p]);const b=await rpc('select buddy_choice_publish($1,$2) as value',[p,post])
 await as(2);await expect(db.query('select buddy_choice_select($1)',[b])).rejects.toThrow('places are currently reserved')
 await as(3);await db.query('select buddy_choice_select($1)',[a]);await as(1);await db.query('select buddy_choice_respond($1,$2)',[invite,'accept']);expect((await state()).invitations.find(i=>i.id===invite).name).toBe('s2@example.test')
 await as(3);expect((await state()).invitations[0].status).toBe('withdrawn');expect((await state()).posts.map(x=>x.id)).not.toContain(a)
 await as(0);await db.query('select buddy_choice_access($1,$2,false)',[p,'s2@example.test']);await as(2);expect((await state()).posts).toHaveLength(0);await expect(db.query('select * from buddy_choice_posts')).rejects.toThrow('permission denied');await expect(db.query('select buddy_choice_sweep($1)',[p])).rejects.toThrow('permission denied')
 await expect(db.query('select buddy_choice_join_upper($1)',[p])).rejects.toThrow('Your participation is paused');expect((await state()).role).toBeNull()
 await as(3);await db.exec(`RESET ROLE;INSERT INTO blocks VALUES('${ids[1]}','${ids[3]}');SET ROLE authenticated`);await expect(db.query('select buddy_choice_select($1)',[a])).rejects.toThrow('Upper-year access');expect((await state()).posts.map(x=>x.id)).not.toContain(a)
 await as(4);await db.query('select buddy_choice_remove($1)',[b]);expect((await state()).posts).toHaveLength(0)
 await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");await expect(db.query('select buddy_choice_join_upper($1)',[p])).rejects.toThrow('Please sign in')
 await db.exec('RESET ROLE;SET ROLE anon');await expect(db.query('select buddy_choice_join_upper($1)',[p])).rejects.toThrow('permission denied')
 }finally{await db.close()}
},30000)
