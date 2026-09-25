import { describe, it, expect } from 'vitest'
import { buildPracticeContext } from '../askMutuPractice'

const ME = 'u-me'
const THEM = 'u-them'
const soon = (d) => new Date(Date.now() + d * 864e5).toISOString()

const base = () => ({
  userId: ME,
  namesById: { [THEM]: 'Maya Khan' },
  myRequest: {
    status: 'active', want_types: ['case'], help_types: ['behavioural'],
    want_focus: 'Market sizing', help_focus: 'STAR stories',
    duration_minutes: 60, timezone: 'America/Toronto',
  },
  myWindows: [{ starts_at: soon(3), ends_at: soon(3) }],
  pairings: [{ id: 'p1', status: 'accepted', counterpart_user_id: THEM }],
  sessions: [{
    id: 's1', pairing_id: 'p1', status: 'scheduled', scheduled_start: soon(2),
    participant_a_user_id: ME, participant_b_user_id: THEM,
    session_mode: 'full_mock_swap', interview_category: 'case', skill_focus: null,
    meeting_url: 'https://utoronto.zoom.us/j/98765432101?pwd=secret',
    meeting_location: 'Rotman, room 2020',
    location_detail: 'https://utoronto.zoom.us/j/98765432101?pwd=secret',
  }],
  passport: { verified: 2, partners: 1, candidateRounds: 2, interviewerRounds: 2, tokenCount: 2 },
  feedback: [{
    id: 'f1', recipient_user_id: ME, author_user_id: THEM,
    suggestion_code: 'recommendation_more_direct',
    note: 'The analysis was strong but the answer came last.',
    reported_at: null,
  }],
})

describe('what Ask Mutu is allowed to know about practice', () => {
  it('carries no meeting link or location, in any form', () => {
    const blob = JSON.stringify(buildPracticeContext(base()))
    for (const secret of ['zoom.us', 'pwd=secret', '98765432101', 'room 2020', 'Rotman,']) {
      expect(blob).not.toContain(secret)
    }
    expect(blob).not.toMatch(/https?:\/\//)
  })

  it('carries the suggestion code as a label, never the partner’s words', () => {
    const ctx = buildPracticeContext(base())
    expect(ctx.suggestions_received).toEqual(['Make the recommendation more direct'])
    expect(JSON.stringify(ctx)).not.toContain('The analysis was strong')
  })

  it('drops a suggestion the user reported', () => {
    const args = base()
    args.feedback[0].reported_at = new Date().toISOString()
    expect(buildPracticeContext(args).suggestions_received).toEqual([])
  })

  it('never carries feedback written about somebody else', () => {
    const args = base()
    args.feedback = [{
      id: 'f2', recipient_user_id: THEM, author_user_id: ME,
      suggestion_code: 'tailor_structure', note: 'about them', reported_at: null,
    }]
    expect(buildPracticeContext(args).suggestions_received).toEqual([])
  })
})

describe('what it does carry, and only from real rows', () => {
  it('describes the listing the member actually posted', () => {
    const ctx = buildPracticeContext(base())
    expect(ctx.in_pool).toBe(true)
    expect(ctx.my_listing).toMatchObject({
      want_to_practise: ['Case interview'],
      can_help_with: ['Behavioural / fit'],
      want_focus: 'Market sizing',
      session_length: '60 min',
    })
    expect(ctx.my_listing.availability).toMatch(/(mornings|afternoons|evenings)$/)
  })

  it('reports the record from the Passport, not from its own counting', () => {
    const ctx = buildPracticeContext(base())
    expect(ctx.record).toEqual({
      verified_practices: 2, different_partners: 1,
      candidate_rounds: 2, interviewer_rounds: 2, shared_tokens: 2,
    })
  })

  it('lists upcoming sessions with the agreement but not the logistics', () => {
    const ctx = buildPracticeContext(base())
    expect(ctx.upcoming_sessions).toHaveLength(1)
    expect(ctx.upcoming_sessions[0]).toMatchObject({
      with: 'Maya Khan', mode: 'Full Mock Swap', interview_type: 'Case interview',
    })
    expect(Object.keys(ctx.upcoming_sessions[0]).sort())
      .toEqual(['date', 'focus', 'interview_type', 'mode', 'with'])
  })

  it('ignores sessions that already happened', () => {
    const args = base()
    args.sessions[0].scheduled_start = '2020-01-01T00:00:00.000Z'
    expect(buildPracticeContext(args).upcoming_sessions).toEqual([])
  })

  it('surfaces a session waiting on confirmation as an action, not as done', () => {
    const args = base()
    args.sessions[0].status = 'completed_pending_confirmation'
    const ctx = buildPracticeContext(args)
    expect(ctx.upcoming_sessions).toEqual([])
    expect(ctx.needs_confirmation).toEqual([{ with: 'Maya Khan', date: expect.any(String) }])
    expect(ctx.partners[0].awaiting_confirmation).toBe(true)
  })

  it('names a partner only when the app already resolved their name', () => {
    const args = base()
    args.namesById = {}
    expect(buildPracticeContext(args).partners).toEqual([])
  })

  it('returns nothing at all for someone who never practised', () => {
    expect(buildPracticeContext({ userId: ME })).toBeNull()
    expect(buildPracticeContext({
      userId: ME, myRequest: null, pairings: [], sessions: [],
      passport: { verified: 0 },
    })).toBeNull()
  })

  it('carries no judgement of how anyone performed', () => {
    const blob = JSON.stringify(buildPracticeContext(base())).toLowerCase()
    for (const word of ['score', 'rating', 'grade', 'rank', 'strong', 'weak', 'ready', 'good', 'bad']) {
      expect(blob).not.toContain(word)
    }
  })
})

// The Sara case, 2026-09-24. Ask Mutu answered "4 verified practices
// with Macie". All four were with Serine Lyu; the only session with
// Macie was still scheduled. The total was free-floating and the
// partner list carried no numbers, so the two could be glued together.
it('never leaves a total that can be pinned on the wrong partner', () => {
  const ctx = buildPracticeContext({
    myRequest: null,
    pairings: [
      { id: 'pair-serine', status: 'accepted', counterpart_user_id: 'serine' },
      { id: 'pair-macie', status: 'accepted', counterpart_user_id: 'macie' },
    ],
    sessions: [{ id: 's-macie', pairing_id: 'pair-macie', status: 'scheduled',
      scheduled_start: new Date(Date.now() + 864e5).toISOString(),
      participant_a_user_id: 'me', participant_b_user_id: 'macie' }],
    passport: { verified: 4, partners: 1, verifiedByPartner: { serine: 4 } },
    namesById: { serine: 'Serine Lyu', macie: 'Macie' },
    userId: 'me',
  })

  expect(ctx.record.verified_practices).toBe(4)
  expect(ctx.practised_with).toEqual([{ name: 'Serine Lyu', verified_practices_together: 4 }])

  const macie = ctx.partners.find((p) => p.name === 'Macie')
  expect(macie.verified_practices_together).toBe(0)
  expect(macie.has_upcoming_session).toBe(true)

  const serine = ctx.partners.find((p) => p.name === 'Serine Lyu')
  expect(serine.verified_practices_together).toBe(4)
})

it('keeps the per-partner numbers summing to the total', () => {
  const ctx = buildPracticeContext({
    myRequest: null, pairings: [], sessions: [],
    passport: { verified: 5, partners: 2, verifiedByPartner: { a: 3, b: 2 } },
    namesById: { a: 'Maya Khan', b: 'Noah Adeyemi' }, userId: 'me',
  })
  const sum = ctx.practised_with.reduce((n, p) => n + p.verified_practices_together, 0)
  expect(sum).toBe(ctx.record.verified_practices)
})

it('accounts for practices with a partner whose name is missing, instead of leaving them loose', () => {
  const ctx = buildPracticeContext({
    myRequest: null,
    pairings: [{ id: 'pair-macie', status: 'accepted', counterpart_user_id: 'macie' }],
    sessions: [],
    // The four were with someone no longer in any pairing, so no name.
    passport: { verified: 4, partners: 1, verifiedByPartner: { 'ex-partner': 4 } },
    namesById: { macie: 'Macie' },
    userId: 'me',
  })

  expect(ctx.practised_with).toEqual([])
  expect(ctx.verified_with_partners_not_named).toBe(4)
  expect(ctx.partners.find((p) => p.name === 'Macie').verified_practices_together).toBe(0)
})

it('says nothing about unnamed partners when every practice has an owner', () => {
  const ctx = buildPracticeContext({
    myRequest: null, pairings: [], sessions: [],
    passport: { verified: 2, partners: 1, verifiedByPartner: { a: 2 } },
    namesById: { a: 'Maya Khan' }, userId: 'me',
  })
  expect('verified_with_partners_not_named' in ctx).toBe(false)
})
