import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const session = vi.hoisted(() => vi.fn())
vi.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { auth: { getSession: session } } }))
import { fetchAskMutuSharedProfiles } from '../askMutuSharedProfiles'
beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: 'me' } } } }) })
afterEach(() => vi.unstubAllGlobals())
it('does not fetch another account’s shared profiles during an auth transition', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
  const result = await fetchAskMutuSharedProfiles('other')
  expect(result.error).toBeTruthy()
  expect(result.data).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
})
it('uses the current bearer token without a caller-controlled viewer id', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ profiles: [{ name: 'Shared member' }] }) }))
  vi.stubGlobal('fetch', fetchMock)
  expect((await fetchAskMutuSharedProfiles('me')).data).toEqual([{ name: 'Shared member' }])
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/shared-profiles$/)
  expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer test-token' }, cache: 'no-store' })
})
it('returns no profiles on a failed authenticated fetch', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Unavailable' }) })))
  const result = await fetchAskMutuSharedProfiles('me')
  expect(result.data).toEqual([])
  expect(result.error.message).toBe('Unavailable')
})
