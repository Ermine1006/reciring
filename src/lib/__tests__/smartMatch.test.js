import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => {
  const query = { select: vi.fn(), in: vi.fn(), eq: vi.fn(), order: vi.fn(), update: vi.fn(), single: vi.fn() }
  return { query, from: vi.fn() }
})
vi.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
import { fetchVisibleNudges, setNudgeStatus } from '../smartMatch'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.from.mockReturnValue(mocks.query)
  for (const method of ['select', 'in', 'eq', 'update']) mocks.query[method].mockReturnValue(mocks.query)
})
it('reads pending and saved states without skipped rows or private profiles', async () => {
  const rows = [{ id: 'saved', status: 'interested' }]
  mocks.query.order.mockResolvedValue({ data: rows, error: null })
  expect((await fetchVisibleNudges()).nudges).toEqual(rows)
  expect(mocks.from).toHaveBeenCalledWith('match_nudges')
  expect(mocks.query.in).toHaveBeenCalledWith('status', ['pending', 'interested', 'matched'])
  expect(mocks.query.select).toHaveBeenCalledWith('id, candidate_id, score, reason, status')
})
it('requires proof that the pending row was updated before reporting success', async () => {
  mocks.query.single.mockResolvedValue({ data: { id: 'n1' }, error: null })
  expect((await setNudgeStatus('n1', 'interested')).error).toBeNull()
  expect(mocks.query.eq).toHaveBeenCalledWith('id', 'n1')
  expect(mocks.query.eq).toHaveBeenCalledWith('status', 'pending')
  expect(mocks.query.select).toHaveBeenCalledWith('id')
})
it('rejects a zero-row update rather than falsely confirming interest', async () => {
  mocks.query.single.mockResolvedValue({ data: null, error: null })
  expect((await setNudgeStatus('n1', 'interested')).error).toBeInstanceOf(Error)
})
it('does not let the client promote a suggestion to matched', async () => {
  expect((await setNudgeStatus('n1', 'matched')).error).toBeInstanceOf(Error)
  expect(mocks.from).not.toHaveBeenCalled()
})
it('names only candidates with a Public profile, filtered server side', async () => {
  mocks.query.order.mockResolvedValue({ data: [
    { id: 'a', candidate_id: 'pub', status: 'pending' },
    { id: 'b', candidate_id: 'priv', status: 'pending' },
  ], error: null })
  mocks.query.eq.mockResolvedValueOnce({ data: [{ id: 'pub', name: 'Sarah Chen' }], error: null })
  const { nudges } = await fetchVisibleNudges()
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.query.eq).toHaveBeenCalledWith('visibility', 'public')
  expect(nudges[0].publicName).toBe('Sarah')
  expect(nudges[1].publicName).toBeUndefined()
})
