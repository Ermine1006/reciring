import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabase', () => ({ supabase: { rpc }, isSupabaseConfigured: true }))
import { fetchRegistrationCount } from '../registrationCount'
beforeEach(() => rpc.mockReset())
it('uses the global aggregate, including a legitimate zero', async () => {
  rpc.mockResolvedValue({ data: 0, error: null })
  expect(await fetchRegistrationCount()).toBe(0)
  expect(rpc).toHaveBeenCalledWith('mutu_registration_count')
})
it('never substitutes community size or zero for a failed count', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
  expect(await fetchRegistrationCount()).toBeNull()
  rpc.mockRejectedValue(Error('offline'))
  expect(await fetchRegistrationCount()).toBeNull()
  rpc.mockResolvedValue({ data: -1, error: null })
  expect(await fetchRegistrationCount()).toBeNull()
})
