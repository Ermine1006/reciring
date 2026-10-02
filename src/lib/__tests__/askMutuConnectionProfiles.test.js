import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ matches: vi.fn(), blocked: vi.fn(), from: vi.fn(), profiles: [] }))
vi.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
vi.mock('../matches', () => ({ fetchMyMatches: mocks.matches, matchToUI: row => ({ peerId: row.peer, reveal: { status: row.reveal } }) }))
vi.mock('../safety', () => ({ fetchBlockedIds: mocks.blocked }))
import { fetchConnections } from '../relationships'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.blocked.mockResolvedValue({ data: ['blocked'] })
  mocks.matches.mockResolvedValue({ data: ['public', 'revealed', 'hidden', 'blocked'].map(peer => ({ id: peer, peer, reveal: peer === 'revealed' ? 'accepted' : 'pending', status: 'matched' })) })
  mocks.profiles = ['public', 'revealed', 'hidden', 'blocked'].map(id => ({ id, name: id, visibility: id === 'public' ? 'public' : 'private', personal_interests: ['yoga'], prompt_weekend: 'Weekend class', email: 'private@example.com' }))
  mocks.from.mockImplementation(table => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      then: resolve => Promise.resolve({ data: table === 'profiles' ? mocks.profiles : [] }).then(resolve),
    }
    return query
  })
})
it('adds only public or mutually revealed profiles and excludes blocked identities', async () => {
  const { data } = await fetchConnections('me', { includeProfiles: true })
  expect(data.map(row => row.peerId)).not.toContain('blocked')
  expect(data.find(row => row.peerId === 'hidden')).toMatchObject({ name: null, identityKnown: false })
  expect(data.find(row => row.peerId === 'hidden').profile).toBeUndefined()
  expect(data.find(row => row.peerId === 'revealed').profile.personal_interests).toEqual(['Yoga'])
  expect(data.find(row => row.peerId === 'public').profile.prompt_weekend).toBe('Weekend class')
  expect(JSON.stringify(data)).not.toContain('private@example.com')
})
it('keeps expanded profiles opt in for existing consumers', async () => {
  const { data } = await fetchConnections('me')
  expect(data.every(row => !('profile' in row))).toBe(true)
})
it('does not release profiles if block rules cannot be loaded', async () => {
  mocks.blocked.mockResolvedValue({ data: [], error: new Error('Offline') })
  const { data, error } = await fetchConnections('me', { includeProfiles: true })
  expect(data).toEqual([])
  expect(error.message).toBe('Offline')
  expect(mocks.from).not.toHaveBeenCalledWith('profiles')
})
