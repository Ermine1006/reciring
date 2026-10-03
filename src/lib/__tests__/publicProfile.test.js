import { beforeEach, expect, it, vi } from 'vitest'
import { readPublicProfile } from '../../../api/_lib/shared-profiles'
import { publicProfileIdForPost } from '../visibility'
let rows, client, failure
beforeEach(() => {
  failure = null
  rows = { blocks: [], profiles: { name: 'Sarah Chen', visibility: 'public', email: 'private@example.com', is_admin: true, program: 'MBA', personal_interests: ['yoga'] } }
  client = { from: vi.fn(table => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockReturnThis(),
    then: resolve => Promise.resolve({ data: rows[table], error: failure === table ? new Error('Database detail') : null }).then(resolve) })) }
})
it('opens a Public profile by member id without contact or account fields', async () => {
  const result = await readPublicProfile(client, 'me', 'peer')
  expect(result.status).toBe(200)
  expect(result.access).toBe('public')
  expect(result.profile.personal_interests).toEqual(['yoga'])
  expect(result.profile.email).toBeUndefined()
  expect(result.profile.is_admin).toBeUndefined()
})
it('answers a Private profile exactly like a missing member', async () => {
  rows.profiles.visibility = 'private'
  const priv = await readPublicProfile(client, 'me', 'peer')
  rows.profiles = null
  const missing = await readPublicProfile(client, 'me', 'peer')
  expect(priv).toEqual(missing)
  expect(priv.profile).toBeUndefined()
})
it('withholds the profile when either side has blocked the other', async () => {
  rows.blocks = [{ blocker_id: 'peer' }]
  expect((await readPublicProfile(client, 'me', 'peer')).status).toBe(404)
  expect(client.from).not.toHaveBeenCalledWith('profiles')
})
it.each(['blocks', 'profiles'])('fails closed when %s cannot be checked', async table => {
  failure = table
  const result = await readPublicProfile(client, 'me', 'peer')
  expect(result.status).toBe(503)
  expect(JSON.stringify(result)).not.toContain('Database detail')
})
it('offers a post author profile only for named posts by Public members', () => {
  const post = { created_by: 'peer', isAnonymous: false, creator: { visibility: 'public', name: 'Sarah' } }
  expect(publicProfileIdForPost(post)).toBe('peer')
  expect(publicProfileIdForPost({ ...post, isAnonymous: true })).toBeNull()
  expect(publicProfileIdForPost({ ...post, creator: { visibility: 'private', name: 'Sarah' } })).toBeNull()
})
