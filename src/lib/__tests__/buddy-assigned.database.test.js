import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

it('binds verified school accounts and protects assigned conversations, replies and reports',async()=>{
 const db=await PGlite.create(),ids=Array.from({length:7},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`),p='10000000-0000-4000-8000-000000000001',c='20000000-0000-4000-8000-000000000001'
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE TABLE profiles(id uuid PRIMARY KEY,name text);CREATE TABLE communities(id uuid PRIMARY KEY);CREATE TABLE community_members(community_id uuid,user_id uuid,status text);CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
 INSERT INTO communities VALUES('${c}');INSERT INTO auth.users VALUES ${ids.map((id,i)=>`('${id}','s${i}@rotman.utoronto.ca',${i===4?'null':'now()'})`).join(',')};INSERT INTO profiles SELECT id,email FROM auth.users;INSERT INTO community_members SELECT '${c}',id,'member' FROM auth.users WHERE id<>'${ids[6]}';`)
 for(const file of ['migration-buddy-program.sql','migration-buddy-choice.sql','migration-buddy-open-access.sql','migration-buddy-assigned.sql','migration-buddy-assigned.sql'])await db.exec(await readFile(new URL(`../../../scripts/${file}`,import.meta.url),'utf8'))
 await db.exec(`INSERT INTO buddy_programs(id,community_id,name,max_mentees) VALUES('${p}','${c}','Test',3);INSERT INTO buddy_coordinators VALUES('${p}','${ids[0]}');INSERT INTO buddy_choice_members VALUES('${p}','${ids[1]}','upper',true),('${p}','${ids[2]}','first',true),('${p}','${ids[3]}','upper',true),('${p}','${ids[4]}','first',true),('${p}','${ids[5]}','first',true)`)
 const as=async n=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${ids[n]}',false)`)
 const rpc=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value
 const state=()=>rpc('select buddy_assigned_state($1) as value',[p])
 await as(1);const roster=[{name:'Student 2',email:'s2@rotman.utoronto.ca'},{name:'Student 4',email:'s4@rotman.utoronto.ca'},{name:'New student',email:'new@rotman.utoronto.ca'}]
 await db.query('select buddy_assigned_add($1,$2)',[p,roster]);await db.query('select buddy_assigned_add($1,$2)',[p,roster]);expect((await state()).pairs).toHaveLength(3)
 const pair=(await state()).pairs.find(x=>x.email==='s2@rotman.utoronto.ca').id
 await expect(db.query('select buddy_assigned_ask($1,$2)',[pair,'secret'])).rejects.toThrow('Only the assigned student')
 await as(4);expect((await state()).pairs).toHaveLength(0)
 await db.exec(`RESET ROLE;UPDATE auth.users SET email_confirmed_at=now() WHERE id='${ids[4]}';SET ROLE authenticated`);expect((await state()).pairs).toHaveLength(1);expect((await state()).pairs[0].requests).toEqual([])
 await as(2);expect((await state()).pairs[0].name).toBe('s1@rotman.utoronto.ca');expect((await state()).pairs[0].requests).toEqual([])
 await db.query('select buddy_assigned_confirm($1,true)',[pair]);const request=await rpc('select buddy_assigned_ask($1,$2) as value',[pair,'Private question about recruiting'])
 await as(5);expect((await state()).pairs).toEqual([]);await expect(db.query('select buddy_assigned_reply($1,$2)',[request,'intruder'])).rejects.toThrow('not available')
 await as(1);expect((await state()).pairs.find(x=>x.id===pair).requests[0].body).toContain('Private question');await db.query('select buddy_assigned_reply($1,$2)',[request,'Private mentor advice'])
 await expect(db.query('select buddy_assigned_resolve($1,true)',[request])).rejects.toThrow('Only the student')
 await as(2);expect((await state()).pairs[0].requests[0].replied).toBe(true);await db.query('select buddy_assigned_resolve($1,true)',[request]);await expect(db.query('select buddy_assigned_reply($1,$2)',[request,'more'])).rejects.toThrow('Reopen')
 await db.query('select buddy_assigned_resolve($1,false)',[request]);await db.query('select buddy_assigned_reply($1,$2)',[request,'Thanks'])
 await as(0);const summary=await rpc('select buddy_assigned_summary($1) as value',[p]);expect(summary).toEqual({assigned:1,pending:2,requests:1,answered:1,resolved:0});expect(JSON.stringify(summary)).not.toContain('Private');expect((await state()).pairs).toEqual([])
 await as(3);await db.query('select buddy_assigned_add($1,$2)',[p,[{email:'s2@rotman.utoronto.ca'}]]);await as(2);const other=(await state()).pairs.find(x=>x.id!==pair);await expect(db.query('select buddy_assigned_confirm($1,true)',[other.id])).rejects.toThrow('already have a school Buddy')
 await db.query('select buddy_assigned_confirm($1,false)',[other.id]);await expect(db.query('select buddy_assigned_summary($1)',[p])).rejects.toThrow('Coordinator')
 await db.exec(`RESET ROLE;INSERT INTO blocks VALUES('${ids[2]}','${ids[1]}');SET ROLE authenticated`);expect((await state()).pairs.some(x=>x.id===pair)).toBe(false);await expect(db.query('select buddy_assigned_reply($1,$2)',[request,'blocked'])).rejects.toThrow('not available')
 await db.exec(`RESET ROLE;DELETE FROM blocks;UPDATE buddy_choice_members SET active=false WHERE user_id='${ids[1]}';SET ROLE authenticated`);expect((await state()).pairs.some(x=>x.id===pair)).toBe(false)
 await as(6);await expect(state()).rejects.toThrow('community');await expect(db.query('select buddy_assigned_add($1,$2)',[p,roster])).rejects.toThrow('upper year')
 await as(2);await expect(db.query('select * from buddy_assigned_replies')).rejects.toThrow('permission denied');await expect(db.query('select buddy_assigned_access($1)',[pair])).rejects.toThrow('permission denied')
 await db.exec('RESET ROLE;SET ROLE anon');await expect(db.query('select buddy_assigned_state($1)',[p])).rejects.toThrow('permission denied')
 }finally{await db.close()}
},30000)
