import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
it('preserves the booking until the other participant accepts the exact current proposal',async()=>{
 const db=await PGlite.create(),a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',p='00000000-0000-4000-8000-000000000003',s='00000000-0000-4000-8000-000000000004'
 try{
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
 CREATE TABLE profiles(id uuid PRIMARY KEY);INSERT INTO profiles VALUES('${a}'),('${b}');CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);CREATE TABLE practice_pairings(id uuid,status text);INSERT INTO practice_pairings VALUES('${p}','accepted');
 CREATE TABLE practice_sessions(id uuid,pairing_id uuid,participant_a_user_id uuid,participant_b_user_id uuid,status text,scheduled_start timestamptz,confirmed_at timestamptz,location_detail text,duration_minutes integer);INSERT INTO practice_sessions VALUES('${s}','${p}','${a}','${b}','scheduled',now()+interval '7 days',now(),'https://zoom.us/j/123',60);`)
 const sql=await readFile(new URL('../../../scripts/migration-practice-time-change.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
 const as=async id=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`)
 const row=async()=>{await db.exec('RESET ROLE');return (await db.query('SELECT * FROM practice_sessions')).rows[0]}
 const propose=()=>db.query("SELECT propose_practice_time_change($1,now()+interval '9 days')",[s])
 const respond=(id,accept)=>db.query('SELECT respond_practice_time_change($1,$2,$3)',[s,id,accept])
 const original=await row();await as(a);await propose();let change=await row();expect(change.scheduled_start).toEqual(original.scheduled_start)
 await as(a);await expect(respond(change.time_change_id,true)).rejects.toThrow('cannot_accept_change');await expect(propose()).rejects.toThrow('pending_change_exists')
 await as(p);await expect(respond(change.time_change_id,true)).rejects.toThrow('not_participant')
 await as(b);await respond(change.time_change_id,false);expect((await row()).scheduled_start).toEqual(original.scheduled_start)
 await as(a);await propose();let next=await row();expect(next.time_change_id).not.toBe(change.time_change_id)
 await as(b);await expect(respond(change.time_change_id,true)).rejects.toThrow('invalid_state');await respond(next.time_change_id,true)
 const accepted=await row();expect(accepted.scheduled_start).toEqual(next.time_change_start);expect(accepted.time_change_id).toBeNull();expect(accepted.duration_minutes).toBe(60);expect(accepted.location_detail).toBe(original.location_detail)
 await as(b);await expect(respond(next.time_change_id,true)).rejects.toThrow('invalid_state')
 await db.exec(`RESET ROLE;UPDATE practice_sessions SET status='verified'`);await as(a);await expect(propose()).rejects.toThrow('invalid_state')
 }finally{await db.close()}
},30000)
