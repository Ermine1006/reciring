import { describe, it, expect } from 'vitest'
import {
  mutualFit,
  fitExplanation,
  deriveDisplayState,
  overlapWindows,
  formatWindow,
  formatSessionTime,
  wallTimeToUtc,
  windowsOverlap,
  fitStatus,
} from '../practiceMatching'
import { practiceErrorMessage } from '../../data/practiceOptions'

const me = { want_types: ['case'], help_types: ['behavioural'] }
const partner = { want_types: ['behavioural'], help_types: ['case'] }

describe('mutualFit', () => {
  it('true only when both directions overlap', () => {
    expect(mutualFit(me, partner)).toBe(true)
    // one-way: they can help me, but I cannot help them
    expect(mutualFit(me, { want_types: ['finance'], help_types: ['case'] })).toBe(false)
    // one-way: I can help them, but they cannot help me
    expect(mutualFit(me, { want_types: ['behavioural'], help_types: ['product'] })).toBe(false)
    expect(mutualFit(null, partner)).toBe(false)
    expect(mutualFit(me, { want_types: [], help_types: [] })).toBe(false)
  })
})

describe('fitExplanation', () => {
  it('explains BOTH directions in plain language', () => {
    const fit = fitExplanation(me, partner)
    expect(fit.youGet).toBe('You want to practise case interview, and they can help with that.')
    expect(fit.youGive).toBe('They want to practise behavioural / fit, and you can help with that.')
  })
  it('uses the partner name once revealed', () => {
    const fit = fitExplanation(me, partner, 'Maya')
    expect(fit.youGet).toContain('Maya can help with that')
    expect(fit.youGive).toBe('Maya wants to practise behavioural / fit, and you can help with that.')
  })
  it('null when there is no mutual fit', () => {
    expect(fitExplanation(me, { want_types: ['finance'], help_types: ['case'] })).toBeNull()
  })
})

describe('deriveDisplayState', () => {
  const NOW = new Date('2026-08-26T12:00:00Z')
  const meId = 'me'
  const accepted = { status: 'accepted', i_invited: true }

  it('invitation stages depend on direction', () => {
    const base = { status: 'invited', expires_at: '2026-09-01T00:00:00Z' }
    expect(deriveDisplayState({ pairing: { ...base, i_invited: true }, myUserId: meId, now: NOW }))
      .toBe('awaiting_their_response')
    expect(deriveDisplayState({ pairing: { ...base, i_invited: false }, myUserId: meId, now: NOW }))
      .toBe('invitation_received')
  })
  it('a past expires_at reads as expired even before the sweep runs', () => {
    const pairing = { status: 'invited', i_invited: true, expires_at: '2026-08-01T00:00:00Z' }
    expect(deriveDisplayState({ pairing, myUserId: meId, now: NOW })).toBe('expired')
  })
  it('accepted with no live session is the scheduling stage', () => {
    expect(deriveDisplayState({ pairing: accepted, session: null, myUserId: meId, now: NOW }))
      .toBe('scheduling')
    expect(deriveDisplayState({
      pairing: accepted, session: { status: 'declined' }, myUserId: meId, now: NOW,
    })).toBe('scheduling')
  })
  it('proposal direction: proposer waits, counterpart responds', () => {
    const session = { status: 'proposed', created_by_user_id: meId }
    expect(deriveDisplayState({ pairing: accepted, session, myUserId: meId, now: NOW }))
      .toBe('proposal_sent')
    expect(deriveDisplayState({ pairing: accepted, session, myUserId: 'other', now: NOW }))
      .toBe('proposal_received')
  })
  it('scheduled flips to ready_to_confirm once the start time passes', () => {
    const future = { status: 'scheduled', scheduled_start: '2026-08-26T15:00:00Z' }
    const past = { status: 'scheduled', scheduled_start: '2026-08-26T09:00:00Z' }
    expect(deriveDisplayState({ pairing: accepted, session: future, myUserId: meId, now: NOW }))
      .toBe('scheduled')
    expect(deriveDisplayState({ pairing: accepted, session: past, myUserId: meId, now: NOW }))
      .toBe('ready_to_confirm')
  })
  it('pending confirmation depends on whether I already confirmed', () => {
    const session = { status: 'completed_pending_confirmation' }
    expect(deriveDisplayState({ pairing: accepted, session, myUserId: meId, myConfirmed: true, now: NOW }))
      .toBe('waiting_for_partner')
    expect(deriveDisplayState({ pairing: accepted, session, myUserId: meId, myConfirmed: false, now: NOW }))
      .toBe('ready_to_confirm')
  })
  it('terminal stages pass through', () => {
    expect(deriveDisplayState({ pairing: accepted, session: { status: 'verified' }, myUserId: meId, now: NOW }))
      .toBe('verified')
    expect(deriveDisplayState({ pairing: accepted, session: { status: 'disputed' }, myUserId: meId, now: NOW }))
      .toBe('disputed')
    expect(deriveDisplayState({ pairing: { status: 'declined' }, myUserId: meId, now: NOW }))
      .toBe('declined')
    expect(deriveDisplayState({ pairing: { status: 'ended' }, myUserId: meId, now: NOW }))
      .toBe('ended')
  })
})

describe('fit vs scheduling are separate concepts', () => {
  const winA = [{ starts_at: '2026-08-27T14:00:00Z', ends_at: '2026-08-27T16:00:00Z' }]
  const winB = [{ starts_at: '2026-08-27T15:00:00Z', ends_at: '2026-08-27T17:00:00Z' }]
  const winFar = [{ starts_at: '2026-09-20T14:00:00Z', ends_at: '2026-09-20T16:00:00Z' }]

  it('windowsOverlap is scheduling only', () => {
    expect(windowsOverlap(winA, winB)).toBe(true)
    expect(windowsOverlap(winA, winFar)).toBe(false)
  })
  it('mutualFit NEVER considers availability', () => {
    // reciprocal types + zero shared availability is still a fit
    expect(mutualFit(me, partner)).toBe(true)
    expect(fitStatus(me, partner, winA, winFar)).toBe('fit_no_overlap')
  })
  it('fitStatus refines fit with scheduling status', () => {
    expect(fitStatus(me, partner, winA, winB)).toBe('fit_overlap')
    expect(fitStatus(me, partner, [], winFar)).toBe('fit_no_overlap')
    expect(fitStatus(me, { want_types: ['finance'], help_types: ['case'] }, winA, winB)).toBe('no_fit')
    expect(fitStatus(null, partner, winA, winB)).toBeNull()
  })
})

describe('overlapWindows', () => {
  const A = [{ starts_at: '2026-08-27T14:00:00Z', ends_at: '2026-08-27T17:00:00Z' }]
  it('returns the intersection', () => {
    const B = [{ starts_at: '2026-08-27T15:00:00Z', ends_at: '2026-08-27T18:00:00Z' }]
    expect(overlapWindows(A, B)).toEqual([
      { starts_at: '2026-08-27T15:00:00.000Z', ends_at: '2026-08-27T17:00:00.000Z' },
    ])
  })
  it('drops overlaps shorter than minMinutes', () => {
    const B = [{ starts_at: '2026-08-27T16:45:00Z', ends_at: '2026-08-27T18:00:00Z' }]
    expect(overlapWindows(A, B, 30)).toEqual([])
    expect(overlapWindows(A, B, 15)).toHaveLength(1)
  })
  it('empty when nothing overlaps', () => {
    const B = [{ starts_at: '2026-08-28T14:00:00Z', ends_at: '2026-08-28T15:00:00Z' }]
    expect(overlapWindows(A, B)).toEqual([])
  })
})

describe('timezone-explicit formatting', () => {
  // 2026-08-27 19:00 UTC = 3:00 PM EDT = 12:00 PM PDT — the exact
  // cross-zone case the legacy CoffeeChatModal silently got wrong.
  const start = '2026-08-27T19:00:00Z'
  const end = '2026-08-27T20:30:00Z'
  it('renders the window in the request timezone with a zone label', () => {
    const s = formatWindow(start, end, 'America/Toronto')
    expect(s).toContain('Aug 27')
    expect(s).toContain('3:00')
    expect(s).toContain('4:30')
    expect(s).toContain('EDT')
  })
  it('the same instant reads differently in another zone — zone always shown', () => {
    const s = formatWindow(start, end, 'America/Vancouver')
    expect(s).toContain('12:00')
    expect(s).toContain('PDT')
  })
  it('formats a session start with duration', () => {
    const s = formatSessionTime(start, 60, 'America/Toronto')
    expect(s).toContain('Aug 27')
    expect(s).toContain('3:00')
    expect(s).toContain('EDT')
    expect(s).toContain('(60 min)')
  })
})

describe('wallTimeToUtc', () => {
  it('3 PM Toronto in August (EDT, UTC-4) is 19:00 UTC', () => {
    expect(wallTimeToUtc('2026-08-27', '15:00', 'America/Toronto'))
      .toBe('2026-08-27T19:00:00.000Z')
  })
  it('3 PM Toronto in January (EST, UTC-5) is 20:00 UTC — DST handled', () => {
    expect(wallTimeToUtc('2026-01-15', '15:00', 'America/Toronto'))
      .toBe('2026-01-15T20:00:00.000Z')
  })
  it('round-trips with formatWindow', () => {
    const iso = wallTimeToUtc('2026-08-27', '15:00', 'America/Toronto')
    const end = wallTimeToUtc('2026-08-27', '16:00', 'America/Toronto')
    const s = formatWindow(iso, end, 'America/Toronto')
    expect(s).toContain('3:00')
    expect(s).toContain('EDT')
  })
})

describe('practiceErrorMessage', () => {
  it('maps RPC error codes to friendly copy', () => {
    expect(practiceErrorMessage(new Error('already_invited')))
      .toBe('There is already an invitation between you two.')
    expect(practiceErrorMessage(new Error('own_request_required')))
      .toContain('Set up your own mock interview first')
  })
  it('falls back generically and handles null', () => {
    expect(practiceErrorMessage(new Error('something_weird')))
      .toBe('Something went wrong. Please try again.')
    expect(practiceErrorMessage(null)).toBeNull()
  })
})
