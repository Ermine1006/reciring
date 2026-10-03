import { beforeEach, expect, it, vi } from 'vitest'
import { readChatProfile } from '../../../api/_lib/shared-profiles'
let rows, client, failure
beforeEach(() => {
  failure = null
  rows = {
    matches: { id: 'chat', requester_user_id: 'peer', helper_user_id: 'me', status: 'active', identity_reveal_status: 'none', source: 'post', post_id: 'post' },
    blocks: [], posts: { created_by: 'peer', is_anonymous: false },
    profiles: { name: 'Serine Lyu', visibility: 'public', email: 'private@example.com', is_admin: true, personal_interests: ['yoga'], prompt_weekend: 'Weekend details '.repeat(100), graduation_year: 2027 },
  }
  client = { from: vi.fn(table => {
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockReturnThis(), then: resolve => Promise.resolve({ data: rows[table], error: failure === table ? new Error('Database detail') : null }).then(resolve) }
    return q
  }) }
})
it('shows a matched Public member their full profile with school email, but no account fields', async () => {
  const result = await readChatProfile(client, 'me', 'chat')
  expect(result.status).toBe(200)
  expect(result.access).toBe('connected')
  expect(result.profile.personal_interests).toEqual(['yoga'])
  expect(result.profile.prompt_weekend).toBe(rows.profiles.prompt_weekend)
  expect(result.profile.graduation_year).toBe(2027)
  expect(result.profile.email).toBe('private@example.com')
  expect(result.profile.is_admin).toBeUndefined()
})
it('shows the full shared private profile and existing shared email after accepted reveal', async () => {
  rows.matches.identity_reveal_status = 'accepted'; rows.profiles.visibility = 'private'
  const result = await readChatProfile(client, 'me', 'chat')
  expect(result.status).toBe(200)
  expect(result.access).toBe('shared')
  expect(result.profile.email).toBe('private@example.com')
})
it('does not treat a public name on a post as consent to a private full profile', async () => {
  rows.profiles.visibility = 'private'
  const result = await readChatProfile(client, 'me', 'chat')
  expect(result.status).toBe(403)
  expect(result.profile).toBeUndefined()
})
it('preserves anonymous posts even when the poster has a public profile', async () => {
  rows.posts.is_anonymous = true
  expect((await readChatProfile(client, 'me', 'chat')).status).toBe(403)
})
it('opens a Public member in a Smart Match or Buddy chat, but never a Private one without a reveal', async () => {
  rows.matches.source = 'smart_match'; rows.matches.post_id = null
  expect((await readChatProfile(client, 'me', 'chat')).access).toBe('connected')
  expect(client.from).not.toHaveBeenCalledWith('posts')
  rows.matches.source = 'buddy'; rows.profiles.visibility = 'private'
  const result = await readChatProfile(client, 'me', 'chat')
  expect(result.status).toBe(403)
  expect(result.profile).toBeUndefined()
})
it('refuses other people’s conversations before fetching a profile', async () => {
  expect((await readChatProfile(client, 'outsider', 'chat')).status).toBe(404)
  expect(client.from).not.toHaveBeenCalledWith('profiles')
})
it.each(['unmatched', 'cancelled'])('refuses %s relationships', async status => {
  rows.matches.status = status
  expect((await readChatProfile(client, 'me', 'chat')).status).toBe(404)
})
it('withholds profiles when either side blocks the other', async () => {
  rows.blocks = [{ blocker_id: 'peer' }]
  expect((await readChatProfile(client, 'me', 'chat')).status).toBe(404)
  expect(client.from).not.toHaveBeenCalledWith('profiles')
})
it.each(['matches', 'blocks', 'profiles', 'posts'])('fails closed when %s cannot be checked', async table => {
  failure = table
  expect((await readChatProfile(client, 'me', 'chat')).status).toBe(503)
})
