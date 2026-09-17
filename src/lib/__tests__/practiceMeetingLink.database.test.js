import {it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
it('only session partners can save supported links without changing the confirmed time',async()=>{
 const db=await PGlite.create(),a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',p='00000000-0000-4000-8000-000000000003',s='00000000-0000-4000-8000-000000000004'
 try{
 await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
 CREATE TABLE practice_pairings(id uuid,status text);CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid);
 CREATE TABLE practice_sessions(id uuid,pairing_id uuid,participant_a_user_id uuid,participant_b_user_id uuid,status text,location_type text,location_detail text,scheduled_start timestamptz);
 INSERT INTO practice_pairings VALUES('${p}','accepted');INSERT INTO practice_sessions VALUES('${s}','${p}','${a}','${b}','scheduled','virtual','','2026-09-30T16:09:00Z');`)
 const sql=await readFile(new URL('../../../scripts/migration-practice-update-meeting-link.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
 const as=async id=>db.exec(`RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`)
 const save=url=>db.query('SELECT update_practice_meeting_link($1,$2)',[s,url])
 await as(a);await save('https://zoom.us/j/123?pwd=test')
 await as(b);await save('https://meet.google.com/abc-defg-hij')
 for(const url of ['javascript:alert(1)','https://zoom.us.evil.test/j/123','https://a@zoom.us/j/1','https://zoom.us/','https://zoom.us:999/j/1'])await expect(save(url)).rejects.toThrow('invalid_meeting_link')
 await as(p);await expect(save('https://zoom.us/j/1')).rejects.toThrow('not_participant')
 await db.exec(`RESET ROLE;ALTER TABLE practice_sessions ADD COLUMN meeting_url text,ADD COLUMN meeting_method text,ADD COLUMN meeting_location text;`)
 await as(a);await save('https://teams.microsoft.com/l/meetup-join/example')
 await db.exec('RESET ROLE');let row=(await db.query('SELECT * FROM practice_sessions')).rows[0];expect(row.meeting_method).toBe('teams');expect(row.meeting_url).toBe(row.location_detail);expect(row.status).toBe('scheduled');expect(new Date(row.scheduled_start).toISOString()).toBe('2026-09-30T16:09:00.000Z')
 await db.exec(`INSERT INTO blocks VALUES('${b}','${a}')`);await as(a);await expect(save('https://zoom.us/j/1')).rejects.toThrow('not_participant')
 await db.exec("RESET ROLE;DELETE FROM blocks;UPDATE practice_sessions SET status='verified'");await as(a);await expect(save('https://zoom.us/j/1')).rejects.toThrow('invalid_state')
 await db.exec('RESET ROLE;SET ROLE anon');await expect(save('https://zoom.us/j/1')).rejects.toThrow('permission denied')
 }finally{await db.close()}
},30000)
