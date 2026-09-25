import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))

import { submitPracticeConfirmation } from '../practice'

const MISSING = { code: 'PGRST202', message: 'Could not find the function' }
const OK = { data: { status: 'verified' }, error: null }

const submit = (extra = {}) => submitPracticeConfirmation({
  sessionId: 's', outcome: 'happened',
  completedOwnRound: true, completedPartnerRound: true, ...extra,
})

beforeEach(() => rpc.mockReset())

// A practice that both people confirmed but that stayed `scheduled`,
// because the confirmation was sent to an RPC whose migration had not
// been run. The completion is the thing that must never be lost: the
// Token, the Passport and the partner's record all hang off it.
describe('a confirmation survives a missing database function', () => {
  it('falls back to the plain confirmation when ratings are not installed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: MISSING }).mockResolvedValueOnce(OK)
    const { data, error } = await submit({ skillRatings: { structure: 4 } })

    expect(error).toBeNull()
    expect(data.status).toBe('verified')
    expect(rpc.mock.calls[0][0]).toBe('submit_practice_confirmation_with_ratings')
    expect(rpc.mock.calls[1][0]).toBe('submit_practice_confirmation')
  })

  it('walks down from finance, through ratings and strengths, to plain', async () => {
    rpc.mockResolvedValue({ data: null, error: MISSING })
    await submit({
      financeObservations: { valuation: 'solid' }, skillRatings: { structure: 4 },
      strengthSkills: ['synthesis'], suggestionCode: 'be_more_direct',
    })
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'submit_practice_confirmation_with_finance',
      'submit_practice_confirmation_with_ratings',
      'submit_practice_confirmation_with_strengths',
      'submit_practice_confirmation',
    ])
  })

  it('still carries what the member reported when it falls back', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: MISSING }).mockResolvedValueOnce(OK)
    await submit({ skillRatings: { structure: 4 }, suggestionCode: 'be_more_direct', note: 'clearer close' })
    const plain = rpc.mock.calls[1][1]
    expect(plain.p_outcome).toBe('happened')
    expect(plain.p_completed_own_round).toBe(true)
    expect(plain.p_completed_partner_round).toBe(true)
    expect(plain.p_suggestion_code).toBe('be_more_direct')
  })

  it('never retries a real refusal from the database', async () => {
    const refused = { code: 'P0001', message: 'already confirmed' }
    rpc.mockResolvedValue({ data: null, error: refused })
    const { error } = await submit({ skillRatings: { structure: 4 } })

    expect(error).toEqual(refused)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('sends one call, and no fallback, on the ordinary path', async () => {
    rpc.mockResolvedValue(OK)
    await submit()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('submit_practice_confirmation')
  })
})
