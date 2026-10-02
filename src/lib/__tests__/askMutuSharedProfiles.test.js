import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), rows: {}, error: null, profileBatches: [] }))
vi.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
import { buildSharedProfilesContext } from '../askMutuSharedProfiles'
import { readSharedProfiles } from '../../../api/_lib/shared-profiles'
const fetchAskMutuSharedProfiles = userId => readSharedProfiles({ from: mocks.from }, userId)
import { serializeAssistantContext } from '../askMutuPayload'
const match = (peer, extra = {}) => ({ id: peer, requester_user_id: 'me', helper_user_id: peer, status: 'active', identity_reveal_status: 'accepted', ...extra })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.error = null; mocks.profileBatches = []
  mocks.rows = { matches: [], blocks: [], profiles: [] }
  mocks.from.mockImplementation(table => {
    let start = 0, end = Infinity, ids = null
    const query = {
      select: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      range(a, b) { start = a; end = b; return this },
      in(_key, values) { ids = values; mocks.profileBatches.push(values); return this },
      then(resolve) { return Promise.resolve({ data: mocks.rows[table].filter(r => !ids || ids.includes(r.id)).slice(start, end + 1), error: mocks.error === table ? new Error('Offline') : null }).then(resolve) },
    }
    return query
  })
})
it('includes a revealed Serine regardless of met history and deduplicates Buddy/practice chats', async () => {
  mocks.rows.matches = [match('serine'), match('serine', { id: 'practice', status: 'completed' })]
  mocks.rows.profiles = [{ id: 'serine', name: 'Serine Lyu', personal_interests: ['yoga'], prompt_weekend: 'Yoga classes', email: 'private@example.com', is_admin: true }]
  const result = await fetchAskMutuSharedProfiles('me')
  expect(result.error).toBeNull()
  expect(result.data).toHaveLength(1)
  expect(result.data[0].profile.personal_interests).toEqual(['Yoga'])
  expect(mocks.from).not.toHaveBeenCalledWith('event_encounters')
  expect(JSON.stringify(buildSharedProfilesContext(result.data))).not.toMatch(/email|is_admin|private@example/)
})
it('requires accepted sharing, active membership of the match, and no block in either direction', async () => {
  mocks.rows.matches = [match('ok'), match('public', { identity_reveal_status: 'none' }), match('pending', { identity_reveal_status: 'pending' }), match('declined', { identity_reveal_status: 'declined' }), match('removed', { status: 'unmatched' }), match('cancelled', { status: 'cancelled' }), match('mine-block'), match('their-block'), match('other', { requester_user_id: 'someone-else' })]
  mocks.rows.blocks = [{ blocker_id: 'me', blocked_user_id: 'mine-block' }, { blocker_id: 'their-block', blocked_user_id: 'me' }]
  mocks.rows.profiles = mocks.rows.matches.map(m => ({ id: m.helper_user_id, name: m.helper_user_id, visibility: 'public' }))
  const result = await fetchAskMutuSharedProfiles('me')
  expect(result.data.map(row => row.peerId)).toEqual(['ok'])
  expect(mocks.profileBatches).toEqual([['ok']])
})
it.each(['matches', 'blocks', 'profiles'])('fails closed if %s cannot load', async table => {
  mocks.rows.matches = [match('serine')]
  mocks.rows.profiles = [{ id: 'serine', name: 'Serine' }]
  mocks.error = table
  const result = await fetchAskMutuSharedProfiles('me')
  expect(result.error).toBeTruthy()
  expect(result.data).toEqual([])
})
it('loads all shared profiles across pages and limits profile reads to authorized batches', async () => {
  mocks.rows.matches = Array.from({ length: 501 }, (_, i) => match(`peer${i}`))
  mocks.rows.profiles = mocks.rows.matches.map(m => ({ id: m.helper_user_id, name: m.helper_user_id }))
  const result = await fetchAskMutuSharedProfiles('me')
  expect(result.data).toHaveLength(501)
  expect(mocks.profileBatches.every(batch => batch.length <= 100)).toBe(true)
})
it('retains the requested shared profile even when it is late in a large network', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ name: `Member ${i}`, profile: { prompt_weekend: 'Other'.repeat(200) } }))
  rows.push({ name: 'Serine Lyu', profile: { personal_interests: ['Yoga'], prompt_weekend: 'Weekend classes' } })
  const compact = JSON.parse(serializeAssistantContext({ shared_profiles: rows }, 12000, 'Tell me about Serine'))
  expect(compact.shared_profiles[0]).toEqual(rows.at(-1))
})
