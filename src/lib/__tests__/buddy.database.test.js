import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`)
const program = '10000000-0000-4000-8000-000000000001'
const community = '20000000-0000-4000-8000-000000000001'

it('enforces roster access, matching capacity, bilateral consent, rematch and private coordinator summaries', async () => {
  const db = await PGlite.create()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text); CREATE TABLE profiles(id uuid PRIMARY KEY,name text);
      CREATE TABLE communities(id uuid PRIMARY KEY); CREATE TABLE community_members(community_id uuid,user_id uuid,status text);
      CREATE TABLE blocks(blocker_id uuid,blocked_user_id uuid); GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      INSERT INTO communities VALUES('${community}');
      INSERT INTO auth.users VALUES ${ids.map((id,i) => `('${id}','student${i}@example.test')`).join(',')};
      INSERT INTO profiles SELECT id,email FROM auth.users;
      INSERT INTO community_members SELECT '${community}',id,'member' FROM auth.users;`)
    const sql = await readFile(new URL('../../../scripts/migration-buddy-program.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    await db.exec(`INSERT INTO buddy_programs(id,community_id,name,enabled,max_mentees) VALUES('${program}','${community}','Test',true,1);
      INSERT INTO buddy_coordinators VALUES('${program}','${ids[0]}');
      INSERT INTO buddy_roster VALUES('${program}','${ids[1]}','mentor'),('${program}','${ids[2]}','mentee'),('${program}','${ids[3]}','mentee');`)
    const asUser = async i => { await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids[i]}',false)` ) }
    const rpc = async (sql, params=[]) => (await db.query(sql,params)).rows[0]?.value
    const state = () => rpc('select buddy_state($1) as value',[program])
    const post = (role) => ({ need: role==='mentor'?'Learn AI':'Finance recruiting', offer:role==='mentor'?'Finance recruiting advice':'', experience:'MBA', need_topics:role==='mentor'?['ai_tools']:['finance','recruiting'],offer_topics:role==='mentor'?['finance','recruiting']:[],profile_topics:['finance'],windows:[{start:new Date(Date.now()+86400000).toISOString(),end:new Date(Date.now()+90000000).toISOString()}],meeting_format:'online',capacity:1,contact:'private@example.test',consent:true })
    await asUser(4)
    await expect(state()).rejects.toThrow('Program not available')
    await expect(db.query('select * from buddy_posts')).rejects.toThrow('permission denied')
    await expect(db.query('select buddy_match($1)',[program])).rejects.toThrow('permission denied')
    await expect(db.query('select buddy_dashboard($1)',[program])).rejects.toThrow('Coordinator access')
    await asUser(1); expect((await state()).post).toBeNull(); await db.query('select buddy_publish($1,$2)',[program,post('mentor')])
    await asUser(2); await db.query('select buddy_publish($1,$2)',[program,post('mentee')])
    const first=(await state()).pairings[0]
    expect(first.common_topics).toEqual(['finance','recruiting']); expect(first.peer.contact).toBeNull();expect(first.peer.name).toBe('Upper-year mentor')
    await db.query('select buddy_respond($1,$2)',[first.id,'accept']);expect((await state()).pairings[0].status).toBe('suggested')
    await asUser(3);await db.query('select buddy_publish($1,$2)',[program,post('mentee')]);expect((await state()).pairings).toHaveLength(0)
    await expect(db.query('select buddy_respond($1,$2)',[first.id,'accept'])).rejects.toThrow('Pairing not available')
    await asUser(1);await db.query('select buddy_respond($1,$2)',[first.id,'accept']);const accepted=(await state()).pairings[0];expect(accepted.status).toBe('accepted');expect(accepted.peer.contact).toBe('private@example.test')
    await db.query('select buddy_respond($1,$2)',[first.id,'met']);expect((await state()).pairings[0].both_met).toBe(false)
    await asUser(2);await db.query('select buddy_respond($1,$2)',[first.id,'met']);expect((await state()).pairings[0].both_met).toBe(true)
    await asUser(0);const dashboard=await rpc('select buddy_dashboard($1) as value',[program]);expect(dashboard.stats.confirmed).toBe(1);expect(dashboard.exceptions).toHaveLength(1);expect(JSON.stringify(dashboard)).not.toContain('private@example.test')
    await asUser(2);await db.query('select buddy_respond($1,$2)',[first.id,'rematch']);expect((await state()).pairings).toHaveLength(0)
    await asUser(3);expect((await state()).pairings).toHaveLength(1)
    await db.query('select buddy_withdraw($1)',[program]);expect((await state()).post.active).toBe(false)
    await db.exec(`RESET ROLE; INSERT INTO buddy_roster VALUES('${program}','${ids[4]}','mentor'),('${program}','${ids[5]}','mentee'); INSERT INTO blocks VALUES('${ids[2]}','${ids[4]}')`)
    await asUser(4);await db.query('select buddy_publish($1,$2)',[program,post('mentor')]);expect((await state()).pairings).toHaveLength(0)
    await db.exec('RESET ROLE; DELETE FROM blocks; SET ROLE service_role; SELECT buddy_tick()')
    await asUser(2);const replacementPair=(await state()).pairings[0];expect(replacementPair).toBeTruthy();expect(replacementPair.peer.contact).toBeNull()
    await db.exec(`RESET ROLE; UPDATE buddy_pairings SET created_at=now()-interval '3 days' WHERE id='${replacementPair.id}'; SET ROLE service_role; SELECT buddy_tick(); SELECT buddy_tick()`)
    await asUser(2);expect((await state()).notices).toHaveLength(1)
    await db.exec(`RESET ROLE; INSERT INTO blocks VALUES('${ids[2]}','${ids[4]}'); SET ROLE service_role; SELECT buddy_tick()`)
    await asUser(2);expect((await state()).pairings).toHaveLength(0)
    await asUser(5);const noTime=post('mentee');noTime.windows=[{start:new Date(Date.now()+10*86400000).toISOString(),end:new Date(Date.now()+10*86400000+3600000).toISOString()}]
    await db.query('select buddy_publish($1,$2)',[program,noTime]);expect((await state()).pairings).toHaveLength(0)
    const invalid=post('mentee');invalid.windows=[{start:'2020-01-01',end:'2020-01-02'}]
    await expect(db.query('select buddy_publish($1,$2)',[program,invalid])).rejects.toThrow('Choose future windows')

  } finally { await db.close() }
},30000)
