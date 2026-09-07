import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

// A disposable PostgreSQL engine, with Supabase's role/auth.uid contract.
// No environment variables, credentials, network, or production connection.
const C = '10000000-0000-4000-8000-000000000001'
const OTHER = '10000000-0000-4000-8000-000000000002'
const A = '20000000-0000-4000-8000-000000000001'
const B = '20000000-0000-4000-8000-000000000002'
const D = '20000000-0000-4000-8000-000000000003'
const OUT = '20000000-0000-4000-8000-000000000004'
let db, migration

async function owner(sql, values = []) {
  await db.exec('RESET ROLE')
  return db.query(sql, values)
}
async function call(user, name, args = [], role = 'authenticated') {
  if (!['anon', 'authenticated'].includes(role)) throw Error('Test role')
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user || ''])
  await db.exec(`SET ROLE ${role}`)
  return (await db.query(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS result`, args)).rows[0].result
}
const save = (user = A, overrides = {}) => {
  const x = { id: randomUUID(), title: 'A small mistake', body: '  I am still learning.\nNot every story needs an ending.  ', topic: 'work', identity: 'anonymous', response: 'sharing', version: 0, publish: true, pledge: true, ...overrides }
  return call(user, 'story_save', [x.id, x.community || C, x.title, x.body, x.topic, x.identity, x.response, x.version, x.publish, x.pledge])
}
const reply = (story, user = B, overrides = {}) => {
  const x = { id: randomUUID(), body: 'I have felt this too.', identity: 'anonymous', version: 0, pledge: true, ...overrides }
  return call(user, 'story_save_reply', [x.id, story.id, x.body, x.identity, x.version, x.pledge])
}
const list = (user, view = 'garden', cursor = null, limit = 4, topic = null, community = C) =>
  call(user, 'story_list', [community, view, topic, cursor?.at || null, cursor?.id || null, limit])
function expectNoIdentity(value) {
  const text = JSON.stringify(value)
  for (const secret of [A, B, D, 'author_id', 'user_id', 'writer_id', 'reporter_id', 'avatar', '@example', 'reaction_count']) {
    expect(text).not.toContain(secret)
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, name text, access_status text NOT NULL DEFAULT 'pending', member_type text);
    CREATE TABLE public.communities (id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE public.community_members (
      community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
      user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
      status text NOT NULL CHECK(status IN ('member','removed')),
      source text NOT NULL CHECK(source IN ('institutional_email','backfill','admin','invite')),
      joined_at timestamptz DEFAULT now(), removed_at timestamptz, PRIMARY KEY(community_id,user_id));
    CREATE TABLE public.blocks (blocker_id uuid REFERENCES public.profiles(id), blocked_user_id uuid REFERENCES public.profiles(id), created_at timestamptz DEFAULT now(), PRIMARY KEY(blocker_id,blocked_user_id));
  `)
  migration = await readFile(new URL('../../../scripts/migration-story-garden.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  const inspection = await db.exec(await readFile(new URL('../../../scripts/verify-story-garden.sql', import.meta.url), 'utf8'))
  expect(inspection[0].rows).toHaveLength(7)
  for (const row of inspection[0].rows) {
    expect(row.rls_enabled).toBe(true)
    for (const key of ['anon_select', 'member_select', 'member_insert', 'member_update', 'member_delete']) expect(row[key]).toBe(false)
  }
  expect(inspection[1].rows).toHaveLength(15)
  for (const row of inspection[1].rows) {
    expect(row.security_definer).toBe(true); expect(row.anon_execute).toBe(false); expect(row.member_execute).toBe(true)
  }
}, 60000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await owner('TRUNCATE profiles, communities CASCADE')
  for (const [id, name] of [[A, 'Alumni Alice'], [B, 'MBA Bao'], [D, 'Community Dee'], [OUT, 'Other school']]) {
    await owner('INSERT INTO profiles(id,name,email,access_status,member_type) VALUES($1,$2,$3,$4,$5)', [id, name, `${name.split(' ')[0]}@example.test`, 'active', 'student'])
  }
  await owner('INSERT INTO communities(id,slug,name) VALUES($1,$2,$3),($4,$5,$6)', [C, 'rotman', 'Rotman', OTHER, 'other', 'Other'])
  for (const id of [A, B, D]) await owner("INSERT INTO community_members(community_id,user_id,status,source) VALUES($1,$2,'member','admin')", [C, id])
  await owner("INSERT INTO community_members(community_id,user_id,status,source) VALUES($1,$2,'member','admin')", [OTHER, OUT])
})

describe('Story Garden migration and privacy boundary', () => {
  it('can be rerun without altering existing product rows', async () => {
    const story = await save()
    await owner('SELECT 1'); await db.exec(migration)
    expect((await call(B, 'story_get', [story.id])).body).toBe(story.body)
    expect((await owner('SELECT count(*)::int AS n FROM profiles')).rows[0].n).toBe(4)
  })
  it('has no raw table or private helper access, even for an author', async () => {
    await save()
    for (const table of ['stories', 'story_bookmarks', 'story_reactions', 'story_replies', 'story_mutes', 'story_moderators', 'story_reports']) {
      await call(A, 'story_access', [C])
      await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/)
      await expect(db.query(`DELETE FROM public.${table}`)).rejects.toThrow(/permission denied/)
    }
    await expect(db.query('SELECT story_private.eligible($1,$2)', [A, C])).rejects.toThrow(/permission denied/)
  })
  it('denies anonymous callers, pending users, removed members and other communities', async () => {
    await expect(call(null, 'story_access', [C], 'anon')).rejects.toThrow(/permission denied/)
    await expect(call(null, 'story_access', [C])).rejects.toThrow('STORY_ACCESS')
    await expect(call(OUT, 'story_access', [C])).rejects.toThrow('STORY_ACCESS')
    await owner("UPDATE profiles SET access_status='pending' WHERE id=$1", [B])
    await expect(call(B, 'story_access', [C])).rejects.toThrow('STORY_ACCESS')
    await owner("UPDATE community_members SET status='removed' WHERE user_id=$1", [A])
    await expect(save(A)).rejects.toThrow('STORY_ACCESS')
  })
  it('allows approved alumni without a practice request and exposes only projected identity', async () => {
    await owner("UPDATE profiles SET member_type='alumni' WHERE id=$1", [A])
    const story = await save()
    const result = await call(B, 'story_get', [story.id])
    expect(result.author_name).toBe('A community member')
    expect(result).not.toHaveProperty('version')
    expect(result).not.toHaveProperty('received_reactions')
    expectNoIdentity(result)
    expectNoIdentity(await list(B))
    const named = await save(A, { identity: 'named' })
    expect((await call(B, 'story_get', [named.id])).author_name).toBe('Alumni Alice')
    expectNoIdentity(await call(B, 'story_get', [named.id]))
  })
  it('keeps drafts owner only and preserves exact authored text', async () => {
    const story = await save(A, { publish: false, pledge: false })
    expect((await list(A)).items).toEqual([])
    expect((await list(B, 'mine')).items).toEqual([])
    expect((await list(A, 'mine')).items[0].body).toBe(story.body)
    await expect(call(B, 'story_get', [story.id])).rejects.toThrow('STORY_UNAVAILABLE')
    await expect(save(B, { id: story.id, version: story.version })).rejects.toThrow('STORY_UNAVAILABLE')
  })
  it('rejects forged moderation through a profile role', async () => {
    await owner("UPDATE profiles SET member_type='admin' WHERE id=$1", [B])
    expect((await call(B, 'story_access', [C])).can_moderate).toBe(false)
    await expect(call(B, 'story_moderation_queue', [C])).rejects.toThrow('STORY_ACCESS')
    await expect(db.query('INSERT INTO story_moderators(community_id,user_id) VALUES($1,$2)', [C, B])).rejects.toThrow(/permission denied/)
  })
})

describe('Story lifecycle, retries and reading', () => {
  it('requires the own words pledge on every publish, including updates', async () => {
    await expect(save(A, { pledge: false })).rejects.toThrow('STORY_PLEDGE')
    await expect(save(A, { body: ' \n\t ' })).rejects.toThrow('STORY_PLEDGE')
    const story = await save()
    await expect(save(A, { id: story.id, version: story.version, pledge: false })).rejects.toThrow('STORY_PLEDGE')
    await expect(save(A, { title: 'a'.repeat(121) })).rejects.toThrow('STORY_INPUT')
  })
  it('makes a lost-response retry idempotent and rejects stale changed text', async () => {
    const id = randomUUID()
    const first = await save(A, { id })
    const retry = await save(A, { id })
    expect(retry.version).toBe(first.version)
    const newer = await save(A, { id, version: first.version, body: 'Edited in another tab.' })
    await expect(save(A, { id, version: first.version, body: 'My unsaved words.' })).rejects.toThrow('STORY_CONFLICT')
    expect((await call(A, 'story_get', [id])).body).toBe(newer.body)
  })
  it('does not move a published page back into the garden order when edited', async () => {
    const first = await save()
    const second = await save()
    const changed = await save(A, { id: first.id, version: first.version, body: 'Something new.' })
    expect(changed.published_at).toBe(first.published_at)
    expect((await list(B)).items.map(s => s.id)).toEqual([second.id, first.id])
    await expect(save(A, { id: first.id, version: changed.version, publish: false })).rejects.toThrow('STORY_SHARED_EDIT')
  })
  it('paginates through a timestamp tie with no duplicate or missing pages', async () => {
    const ids = []
    for (let i = 0; i < 7; i++) ids.push((await save()).id)
    await owner("UPDATE stories SET published_at='2026-01-01T00:00:00Z'")
    const first = await list(B)
    const second = await list(B, 'garden', first.next_cursor)
    expect(new Set([...first.items, ...second.items].map(s => s.id)).size).toBe(7)
    expect(second.next_cursor).toBeNull()
    expect((await list(B, 'garden', null, 4, 'mba')).items).toEqual([])
    await expect(call(B, 'story_list', [C, 'garden', null, '2026-01-01', null])).rejects.toThrow('STORY_INPUT')
  })
  it('withdraws immediately from readers, bookmarks and replies while retaining an owner draft', async () => {
    const story = await save(A, { response: 'conversation' })
    await reply(story)
    await call(B, 'story_set_bookmark', [story.id, true])
    const takenBack = await call(A, 'story_withdraw', [story.id, story.version])
    expect(takenBack.status).toBe('withdrawn')
    expect((await list(B)).items).toEqual([])
    expect((await list(B, 'bookmarks')).items).toEqual([])
    await expect(call(B, 'story_list_replies', [story.id])).rejects.toThrow('STORY_UNAVAILABLE')
    await expect(reply(story)).rejects.toThrow('STORY_UNAVAILABLE')
    expect((await list(A, 'mine')).items[0].body).toBe(story.body)
    const restored = await save(A, { id: story.id, version: takenBack.version, response: 'conversation' })
    expect((await call(B, 'story_list_replies', [restored.id])).items).toHaveLength(1)
  })
  it('hides an author who loses active membership, including from saved pages', async () => {
    const story = await save()
    await call(B, 'story_set_bookmark', [story.id, true])
    await owner("UPDATE profiles SET access_status='pending' WHERE id=$1", [A])
    expect((await list(B, 'bookmarks')).items).toEqual([])
    await expect(call(B, 'story_get', [story.id])).rejects.toThrow('STORY_UNAVAILABLE')
    await expect(call(A, 'story_get', [story.id])).rejects.toThrow('STORY_UNAVAILABLE')
  })
  it('limits new pages without preventing edits or private recovery', async () => {
    let story
    for (let i = 0; i < 20; i++) story = await save(A, { publish: false })
    await expect(save()).rejects.toThrow('STORY_RATE_LIMIT')
    expect((await save(A, { id: story.id, version: story.version })).status).toBe('published')
  })
})

describe('Private responses, bookmarks and hidden writers', () => {
  it('keeps bookmarks private and reactions reversible without counts or identities', async () => {
    const story = await save()
    await call(B, 'story_set_bookmark', [story.id, true])
    await call(B, 'story_set_reaction', [story.id, 'warmth', true])
    await call(B, 'story_set_reaction', [story.id, 'warmth', true])
    const other = await call(D, 'story_get', [story.id])
    expect(other.bookmarked).toBe(false); expect(other.my_reactions).toEqual([])
    expectNoIdentity(other)
    expect((await call(A, 'story_get', [story.id])).received_reactions).toEqual(['warmth'])
    expect((await list(D, 'bookmarks')).items).toEqual([])
    await call(B, 'story_set_reaction', [story.id, 'warmth', false])
    await call(B, 'story_set_bookmark', [story.id, false])
    expect((await call(A, 'story_get', [story.id])).received_reactions).toEqual([])
    await expect(call(A, 'story_set_reaction', [story.id, 'warmth', true])).rejects.toThrow('STORY_UNAVAILABLE')
  })
  it('uses private bilateral mutes without exposing or modifying account blocks', async () => {
    const a = await save()
    const b = await save(B)
    expect(await call(B, 'story_mute_writer', [a.id])).toEqual({ muted: true })
    expect((await owner('SELECT * FROM blocks')).rows).toEqual([])
    expect((await list(B)).items.map(s => s.id)).toEqual([b.id])
    expect((await list(A)).items.map(s => s.id)).toEqual([a.id])
    await expect(call(B, 'story_get', [a.id])).rejects.toThrow('STORY_UNAVAILABLE')
    await call(B, 'story_clear_mutes')
    expect((await call(B, 'story_get', [a.id])).id).toBe(a.id)
  })
  it('respects account blocks in either direction and cannot undo them via garden preferences', async () => {
    const story = await save()
    await owner('INSERT INTO blocks(blocker_id,blocked_user_id) VALUES($1,$2)', [A, B])
    await call(B, 'story_clear_mutes')
    expect((await list(B)).items).toEqual([])
    await expect(call(B, 'story_set_bookmark', [story.id, true])).rejects.toThrow('STORY_UNAVAILABLE')
    await expect(call(B, 'story_report', [story.id])).rejects.toThrow('STORY_UNAVAILABLE')
  })
  it('allows removal of personal reactions and bookmarks after access is lost', async () => {
    const story = await save()
    await call(B, 'story_set_bookmark', [story.id, true])
    await call(B, 'story_set_reaction', [story.id, 'relate', true])
    await owner("UPDATE community_members SET status='removed' WHERE user_id=$1", [B])
    expect(await call(B, 'story_set_bookmark', [story.id, false])).toEqual({ bookmarked: false })
    expect(await call(B, 'story_set_reaction', [story.id, 'relate', false])).toEqual({ kind: 'relate', selected: false })
  })
})

describe('Written replies and moderation', () => {
  it('enforces reply opt in on the server and preserves existing replies after closure', async () => {
    const sharing = await save()
    await expect(reply(sharing)).rejects.toThrow('STORY_REPLIES_CLOSED')
    const story = await save(A, { response: 'conversation' })
    const r = await reply(story)
    await expect(reply(story, B, { pledge: false })).rejects.toThrow('STORY_PLEDGE')
    await save(A, { id: story.id, version: story.version, response: 'sharing' })
    await expect(reply(story)).rejects.toThrow('STORY_REPLIES_CLOSED')
    expect((await call(B, 'story_list_replies', [story.id])).items[0].id).toBe(r.id)
    await call(B, 'story_delete_reply', [r.id, r.version])
    expect((await call(A, 'story_list_replies', [story.id])).items).toEqual([])
  })
  it('protects anonymous authors in replies and makes reply retries and edits safe', async () => {
    const story = await save(A, { response: 'conversation' })
    const r = await reply(story, A, { identity: 'named' })
    const shown = (await call(B, 'story_list_replies', [story.id])).items[0]
    expect(shown.author_name).toBe('Story author'); expect(shown.is_story_author).toBe(true)
    expectNoIdentity(shown)
    const retry = await reply(story, A, { id: r.id, identity: 'named' })
    expect(retry.version).toBe(r.version)
    await reply(story, A, { id: r.id, version: r.version, body: 'Changed reply.' })
    await expect(reply(story, A, { id: r.id, version: r.version, body: 'Stale edit.' })).rejects.toThrow('STORY_CONFLICT')
    await expect(call(B, 'story_delete_reply', [r.id, r.version])).rejects.toThrow('STORY_UNAVAILABLE')
  })
  it('resolves a reply mute privately and filters it for both viewer and story author blocks', async () => {
    const story = await save(A, { response: 'conversation' })
    const r = await reply(story, B)
    await call(D, 'story_mute_writer', [story.id, r.id])
    expect((await call(D, 'story_list_replies', [story.id])).items).toEqual([])
    expect((await call(A, 'story_list_replies', [story.id])).items).toHaveLength(1)
    await owner('INSERT INTO blocks(blocker_id,blocked_user_id) VALUES($1,$2)', [A, B])
    expect((await call(A, 'story_list_replies', [story.id])).items).toEqual([])
    await expect(reply(story, B)).rejects.toThrow('STORY_UNAVAILABLE')
  })
  it('paginates replies and hides removed members', async () => {
    const story = await save(A, { response: 'conversation' })
    for (let i = 0; i < 3; i++) await reply(story)
    const first = await call(D, 'story_list_replies', [story.id, null, null, 2])
    const second = await call(D, 'story_list_replies', [story.id, first.next_cursor.at, first.next_cursor.id, 2])
    expect(new Set([...first.items, ...second.items].map(r => r.id)).size).toBe(3)
    await owner("UPDATE community_members SET status='removed' WHERE user_id=$1", [B])
    expect((await call(D, 'story_list_replies', [story.id])).items).toEqual([])
  })
  it('snapshots reports, deduplicates retries and limits identity access to appointed moderators', async () => {
    const story = await save()
    const result = await call(B, 'story_report', [story.id, null, 'privacy', 'Contains identifying details.'])
    expect(result).toEqual({ submitted: true }); expectNoIdentity(result)
    await call(B, 'story_report', [story.id, null, 'privacy', 'Retry'])
    await owner('INSERT INTO story_moderators(community_id,user_id) VALUES($1,$2)', [C, D])
    const queue = await call(D, 'story_moderation_queue', [C])
    expect(queue).toHaveLength(1); expect(queue[0].body_snapshot).toBe(story.body)
    expect(queue[0].writer_name).toBe('Alumni Alice')
    await expect(call(B, 'story_review_report', [queue[0].id, 'remove'])).rejects.toThrow('STORY_ACCESS')
    await expect(call(D, 'story_moderation_queue', [OTHER])).rejects.toThrow('STORY_ACCESS')
    await call(D, 'story_review_report', [queue[0].id, 'dismiss'])
    expect((await call(B, 'story_get', [story.id])).id).toBe(story.id)
  })
  it('removes a reported story and prevents the author from republishing it', async () => {
    const story = await save()
    await call(B, 'story_report', [story.id])
    await owner('INSERT INTO story_moderators(community_id,user_id) VALUES($1,$2)', [C, D])
    const [report] = await call(D, 'story_moderation_queue', [C])
    await call(D, 'story_review_report', [report.id, 'remove'])
    await expect(call(B, 'story_get', [story.id])).rejects.toThrow('STORY_UNAVAILABLE')
    await expect(save(A, { id: story.id, version: 2 })).rejects.toThrow('STORY_REMOVED')
    expect((await list(A, 'mine')).items[0].status).toBe('removed')
  })
  it('reports the correct reply writer and removes only that reply', async () => {
    const story = await save(A, { response: 'conversation' })
    const r = await reply(story)
    await call(A, 'story_report', [story.id, r.id, 'unkind'])
    await owner('INSERT INTO story_moderators(community_id,user_id) VALUES($1,$2)', [C, D])
    const [report] = await call(D, 'story_moderation_queue', [C])
    expect(report.writer_name).toBe('MBA Bao'); expect(report.body_snapshot).toBe(r.body)
    await call(D, 'story_review_report', [report.id, 'remove'])
    expect((await call(A, 'story_list_replies', [story.id])).items).toEqual([])
    expect((await call(B, 'story_get', [story.id])).id).toBe(story.id)
    await expect(reply(story, B, { id: r.id, version: 2 })).rejects.toThrow('STORY_UNAVAILABLE')
  })
})
