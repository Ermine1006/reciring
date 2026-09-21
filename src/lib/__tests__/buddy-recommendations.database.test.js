import {expect,it} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
it('recommends opted-in buddies including self-enrolled uppers without releasing identity',async()=>{
 const db=await PGlite.create(),ids=Array.from({length:5},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`),p='10000000-0000-4000-8000-000000000001',c='20000000-0000-4000-8000-000000000001'
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE TABLE profiles(id uuid PRIMARY KEY,name text);CREATE TABLE communities(id uuid PRIMARY KEY);CREATE TABLE community_members(community_id uuid,user_id uuid,status text);CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;INSERT INTO communities VALUES('${c}');INSERT INTO auth.users VALUES ${ids.map((id,i)=>`('${id}','private${i}@example.test')`).join(',')};INSERT INTO profiles SELECT id,email FROM auth.users;INSERT INTO community_members SELECT '${c}',id,'member' FROM auth.users;`)
 for(const name of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-recommendations.sql','migration-buddy-recommendations.sql','migration-buddy-open-access.sql'])await db.exec(await readFile(new URL(`../../../scripts/${name}`,import.meta.url),'utf8'))
 await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${p}','${c}','Test',1);INSERT INTO buddy_coordinators VALUES('${p}','${ids[0]}');`)
 const as=async n=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${ids[n]}',false)`)
 const rpc=async(name,args=[])=>(await db.query(name,args)).rows[0]?.value
 const rec=post=>rpc('select buddy_recommendations($1,$2) as value',[p,post])
 await as(2);await db.query('select buddy_choice_join_upper($1)',[p]);await as(3);await db.query('select buddy_choice_join_upper($1)',[p])
 await as(1);await db.query('select buddy_choice_join($1)',[p]);const post=await rpc('select buddy_choice_publish($1,$2) as value',[p,{needs:'Finance recruiting',offers:'Python',helpType:['Advice'],industry:['Finance'],time:'30 min',is_anonymous:true}]);expect((await rec(post)).items).toEqual([])
 await expect(db.query('select buddy_upper_card_save($1,$2,$3,true)',[p,['Advice'],['Finance']])).rejects.toThrow('Approved upper-year')
 await as(2);await db.query('select buddy_upper_card_save($1,$2,$3,false)',[p,['Advice'],['Finance']]);await as(1);expect((await rec(post)).items).toEqual([])
 await as(2);await db.query('select buddy_upper_card_save($1,$2,$3,true)',[p,['Advice'],['Finance']]);await as(3);await db.query('select buddy_upper_card_save($1,$2,$3,true)',[p,['Advice'],['Consulting']]);await as(1)
 const items=(await rec(post)).items;expect(items).toHaveLength(2);expect(items[0].common_focus).toEqual(['Finance']);expect(JSON.stringify(items)).not.toContain('private');expect(JSON.stringify(items)).not.toContain(ids[2]);expect(items[0]).not.toHaveProperty('score')
 const card=items[0].id;await db.query('select buddy_recommendation_act($1,$2,$3)',[post,card,'interested']);expect((await rec(post)).items[0].status).toBe('interested');expect((await rpc('select buddy_choice_state($1) as value',[p])).invitations).toEqual([])
 await as(2);expect((await rec(null)).incoming_post_ids).toEqual([post]);await as(4);await expect(db.query('select buddy_recommendation_act($1,$2,$3)',[post,card,'interested'])).rejects.toThrow('Post not available')
 await as(1);await db.query('select buddy_recommendation_act($1,$2,$3)',[post,card,'skipped']);expect((await rec(post)).items.map(x=>x.id)).not.toContain(card);await as(2);expect((await rec(null)).incoming_post_ids).toEqual([])
 await as(0);await db.query('select buddy_choice_access($1,$2,false)',[p,'private3@example.test']);await as(1);expect((await rec(post)).items).toEqual([])
 await expect(db.query('select * from buddy_upper_cards')).rejects.toThrow('permission denied');await expect(db.query('select * from buddy_recommendation_actions')).rejects.toThrow('permission denied')
 // Re-enable and verify blocks and occupied places remove recommendations.
 await as(0);await db.query('select buddy_choice_access($1,$2,true)',[p,'private3@example.test']);await db.exec(`RESET ROLE;INSERT INTO blocks VALUES('${ids[1]}','${ids[3]}');SET ROLE authenticated`);await as(1);expect((await rec(post)).items).toEqual([]);await db.exec('RESET ROLE;DELETE FROM blocks');await as(3);await db.query('select buddy_choice_select($1)',[post]);await as(1);expect((await rec(post)).items).toEqual([])
 }finally{await db.close()}
},30000)
