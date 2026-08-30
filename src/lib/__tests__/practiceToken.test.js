import { describe, it, expect, beforeEach } from 'vitest'
import {
  tokenForSession, revealState, revealKey, hasAcknowledged, acknowledgeReveal,
  describeToken, relationshipProgress, passportTokens, REVEAL_VERSION,
} from '../practiceToken'
import { computePassport } from '../practicePassport'

const ME = 'u-me'
const THEM = 'u-them'
const OTHER = 'u-other'

const session = (over = {}) => ({
  id: 's1', community_id: 'c1', status: 'verified',
  participant_a_user_id: ME, participant_b_user_id: THEM,
  session_mode: 'full_mock_swap', interview_category: 'case', skill_focus: null,
  ...over,
})
const token = (over = {}) => ({
  id: 't1', session_id: 's1', community_id: 'c1', pairing_id: 'p1',
  user_lo: ME < THEM ? ME : THEM, user_hi: ME < THEM ? THEM : ME,
  source: 'practice', exchange_types: ['case'], verified_at: '2026-08-30T12:00:00.000Z',
  ...over,
})

// a localStorage stand-in, so acknowledgement is testable without a DOM
const makeStore = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    _map: m,
  }
}

describe('only the server can produce a Token to reveal (tests 1-10)', () => {
  it('one confirmation reveals nothing: the session is not verified yet', () => {
    const s = session({ status: 'completed_pending_confirmation' })
    expect(revealState({ session: s, tokens: [], userId: ME })).toBe('pending')
    expect(revealState({ session: s, tokens: [token()], userId: ME })).toBe('pending')
  })

  it('two compatible confirmations, i.e. a verified session with a real Token, may reveal', () => {
    expect(revealState({ session: session(), tokens: [token()], userId: ME })).toBe('ready')
  })

  it('a disputed session reveals no Token', () => {
    expect(revealState({ session: session({ status: 'disputed' }), tokens: [token()], userId: ME }))
      .toBe('disputed')
  })

  it('incomplete, cancelled and no-show sessions reveal no Token', () => {
    for (const st of ['scheduled', 'proposed', 'cancelled', 'no_show', 'withdrawn', 'expired', 'declined']) {
      expect(revealState({ session: session({ status: st }), tokens: [token()], userId: ME }), st)
        .toBe('none')
    }
  })

  it('nothing the client does locally can reach a reveal', () => {
    // finishing a guide, a timer running out, opening a meeting link:
    // none of them change session.status, which is the only input
    const s = session({ status: 'scheduled' })
    expect(revealState({ session: s, tokens: [token()], userId: ME })).toBe('none')
    // even a local "we finished" flag on the row changes nothing
    expect(revealState({ session: { ...s, guideFinished: true, timerExpired: true }, tokens: [token()], userId: ME }))
      .toBe('none')
  })

  it('the client never mints: with no server Token there is nothing to show', () => {
    expect(revealState({ session: session(), tokens: [], userId: ME })).toBe('unavailable')
    expect(tokenForSession([], 's1')).toBeNull()
    // and the module exposes no way to make one
    expect(typeof tokenForSession).toBe('function')
  })

  it('a session has at most one Token, and a retry adds none', () => {
    // the table's UNIQUE(session_id) makes duplicates unrepresentable;
    // the lookup returns a single row regardless
    const dup = [token(), token({ id: 't2' })]
    expect(tokenForSession(dup, 's1').id).toBe('t1')
    expect(passportTokens({ tokens: dup, eligibleSessionIds: new Set(['s1']) }).length).toBe(2)
    // ...and the Passport counts the SESSION, so a duplicate row could
    // still never inflate the number
    const p = computePassport({
      userId: ME, sessions: [session()], confirmations: [], tokens: dup,
    })
    expect(p.tokenCount).toBe(1)
  })

  it('a Discover token is never treated as a practice session Token', () => {
    expect(tokenForSession([token({ source: 'discover', session_id: null })], 's1')).toBeNull()
  })
})

describe('the Token is shared, the acknowledgement is not (tests 11-14)', () => {
  let store
  beforeEach(() => { store = makeStore() })

  it('both participants read the same row', () => {
    const t = token()
    expect(tokenForSession([t], 's1')).toBe(tokenForSession([t], 's1'))
    // one row carries both people; there is no per-user copy
    expect([t.user_lo, t.user_hi].sort()).toEqual([ME, THEM].sort())
  })

  it('each participant acknowledges independently', () => {
    acknowledgeReveal(ME, 't1', 'viewed', store)
    expect(hasAcknowledged(ME, 't1', store)).toBe(true)
    expect(hasAcknowledged(THEM, 't1', store)).toBe(false)
    acknowledgeReveal(THEM, 't1', 'skipped', store)
    expect(hasAcknowledged(THEM, 't1', store)).toBe(true)
  })

  it('keys are versioned and scoped to one user and one Token', () => {
    expect(revealKey(ME, 't1')).toBe(`mutu_token_reveal:${REVEAL_VERSION}:${ME}:t1`)
    expect(revealKey(ME, 't2')).not.toBe(revealKey(ME, 't1'))
    expect(revealKey(null, 't1')).toBeNull()
    expect(revealKey(ME, null)).toBeNull()
  })

  it('records only what the interface needs, never a claim about the practice', () => {
    acknowledgeReveal(ME, 't1', 'skipped', store, new Date('2026-08-30T12:00:00Z'))
    const raw = JSON.parse(store.getItem(revealKey(ME, 't1')))
    expect(Object.keys(raw).sort()).toEqual(['at', 'how'])
    expect(raw.how).toBe('skipped')
  })

  it('local acknowledgement never moves a Passport number', () => {
    const args = { userId: ME, sessions: [session()], confirmations: [
      { session_id: 's1', user_id: ME, outcome: 'completed', completed_own_round: true, completed_partner_round: true },
    ], tokens: [token()] }
    const before = computePassport(args)
    acknowledgeReveal(ME, 't1', 'viewed', store)
    const after = computePassport(args)
    expect(after).toEqual(before)
    expect(after.verified).toBe(1)
    expect(after.tokenCount).toBe(1)
  })

  it('an already-acknowledged Token is still fully viewable', () => {
    acknowledgeReveal(ME, 't1', 'viewed', store)
    // the state is unchanged: acknowledgement gates the animation only
    expect(revealState({ session: session(), tokens: [token()], userId: ME })).toBe('ready')
    expect(describeToken({ token: token(), session: session() })).not.toBeNull()
  })
})

describe('historical and unavailable Tokens (test 15)', () => {
  it('a verified session with no Token gets no fabricated one', () => {
    expect(revealState({ session: session(), tokens: [], userId: ME })).toBe('unavailable')
    expect(describeToken({ token: null, session: session() })).toBeNull()
  })

  it('describes only what the row actually holds', () => {
    const d = describeToken({
      token: token({ verified_at: '2026-08-30T12:00:00.000Z' }),
      session: session({ session_mode: 'quick_skill_drill', skill_focus: 'synthesis' }),
      partnerName: 'Maya', partnerUnlocked: true,
    })
    expect(d).toMatchObject({
      id: 't1', sessionMode: 'quick_skill_drill', category: 'case',
      skillFocus: 'synthesis', partner: 'Maya',
    })
    // an unrecorded session leaves nulls rather than invented values
    const bare = describeToken({ token: token(), session: null })
    expect(bare.sessionMode).toBeNull()
    expect(bare.category).toBeNull()
  })
})

describe('Passport stays server-derived (tests 16, 17)', () => {
  const confirmations = [
    { session_id: 's1', user_id: ME, outcome: 'completed', completed_own_round: true, completed_partner_round: true },
  ]

  it('a reciprocal session counts once, with one round in each role', () => {
    const p = computePassport({ userId: ME, sessions: [session()], confirmations, tokens: [token()] })
    expect(p.verified).toBe(1)
    expect(p.tokenCount).toBe(1)
    expect(p.candidateRounds).toBe(1)
    expect(p.interviewerRounds).toBe(1)
    expect(p.partners).toBe(1)
  })

  it('lists only Tokens whose session the Passport already counts', () => {
    const rows = passportTokens({
      tokens: [token(), token({ id: 't9', session_id: 's-unknown' })],
      sessionById: { s1: session() },
      eligibleSessionIds: new Set(['s1']),
    })
    expect(rows.map((r) => r.token.id)).toEqual(['t1'])
    expect(rows[0].session.id).toBe('s1')
  })

  it('sorts newest first', () => {
    const rows = passportTokens({
      tokens: [
        token({ id: 'old', session_id: 'a', verified_at: '2026-01-01T00:00:00.000Z' }),
        token({ id: 'new', session_id: 'b', verified_at: '2026-08-01T00:00:00.000Z' }),
      ],
      eligibleSessionIds: new Set(['a', 'b']),
    })
    expect(rows.map((r) => r.token.id)).toEqual(['new', 'old'])
  })
})

describe('relationship progress comes from the server view (test 18)', () => {
  const edge = (over = {}) => ({
    community_id: 'c1',
    user_lo: ME < THEM ? ME : THEM, user_hi: ME < THEM ? THEM : ME,
    verified_exchange_count: 1,
    first_verified_at: '2026-07-01T00:00:00.000Z',
    last_verified_at: '2026-08-30T00:00:00.000Z',
    is_repeat_pair: false, ...over,
  })

  it('uses practice_relationship_edges, never a local count', () => {
    const r = relationshipProgress({ edges: [edge({ verified_exchange_count: 2 })], userId: ME, partnerId: THEM })
    expect(r.count).toBe(2)
    expect(r.fact).toBe('You have completed 2 verified practices together.')
    expect(r.lastVerifiedAt).toBe('2026-08-30T00:00:00.000Z')
  })

  it('describes the connection without implying closeness or skill', () => {
    const at = (n) => relationshipProgress({ edges: [edge({ verified_exchange_count: n })], userId: ME, partnerId: THEM })
    expect(at(1).levelLabel).toBe('New practice connection')
    expect(at(2).levelLabel).toBe('Practised together')
    expect(at(3).levelLabel).toBe('Regular practice partners')
    expect(at(40).levelLabel).toBe('Regular practice partners')
    // no score, no percentage, no adjective about the person
    for (const n of [1, 2, 5]) {
      expect(JSON.stringify(at(n))).not.toMatch(/score|rank|percent|better|top/i)
    }
  })

  it('returns nothing when the pair has no verified exchange', () => {
    expect(relationshipProgress({ edges: [], userId: ME, partnerId: THEM })).toBeNull()
    expect(relationshipProgress({ edges: [edge({ verified_exchange_count: 0 })], userId: ME, partnerId: THEM }))
      .toBeNull()
    expect(relationshipProgress({ edges: [edge()], userId: ME, partnerId: null })).toBeNull()
  })

  it('matches the pair whichever way round the caller is', () => {
    const e = [edge({ verified_exchange_count: 3 })]
    expect(relationshipProgress({ edges: e, userId: ME, partnerId: THEM }).count).toBe(3)
    expect(relationshipProgress({ edges: e, userId: THEM, partnerId: ME }).count).toBe(3)
  })

  it('keeps communities apart', () => {
    const e = [edge({ community_id: 'c2', verified_exchange_count: 5 })]
    expect(relationshipProgress({ edges: e, userId: ME, partnerId: THEM, communityId: 'c1' })).toBeNull()
    expect(relationshipProgress({ edges: e, userId: ME, partnerId: THEM, communityId: 'c2' }).count).toBe(5)
  })
})

describe('privacy of the Token surface (tests 19-23)', () => {
  it('a non-participant has nothing to reveal', () => {
    expect(revealState({ session: session(), tokens: [token()], userId: OTHER })).toBe('none')
    expect(revealState({ session: session(), tokens: [token()], userId: null })).toBe('none')
  })

  it('never carries private feedback, meeting links or confirmation answers', () => {
    const d = describeToken({
      token: {
        ...token(),
        // even if a row somehow carried these, the description drops them
        note: 'private note', suggestion_code: 'tailor_structure',
      },
      session: {
        ...session(),
        meeting_url: 'https://zoom.us/j/1', location_detail: 'https://zoom.us/j/1',
        cancellation_reason: 'partnership_ended',
      },
      partnerName: 'Maya', partnerUnlocked: true,
    })
    const blob = JSON.stringify(d)
    for (const s of ['zoom.us', 'private note', 'tailor_structure', 'partnership_ended']) {
      expect(blob).not.toContain(s)
    }
    expect(Object.keys(d).sort())
      .toEqual(['category', 'id', 'partner', 'partnerUnlocked', 'sessionMode', 'skillFocus', 'verifiedAt'])
  })

  it('a locked identity stays anonymous inside a shared Token', () => {
    const d = describeToken({ token: token(), session: session(), partnerName: 'Maya', partnerUnlocked: false })
    expect(d.partner).toBeNull()
    expect(d.partnerUnlocked).toBe(false)
    expect(JSON.stringify(d)).not.toContain('Maya')
  })

  it('a blocked partner drops out of the Passport, so its Token is not listed', () => {
    const p = computePassport({
      userId: ME, sessions: [session()], confirmations: [], tokens: [token()],
      blockedUserIds: new Set([THEM]),
    })
    expect(p.verified).toBe(0)
    expect(p.tokenCount).toBe(0)
    expect(passportTokens({ tokens: [token()], eligibleSessionIds: new Set() }).length).toBeGreaterThan(0)
    // ...but scoped to the Passport's eligible set, it disappears
    expect(passportTokens({ tokens: [token()], eligibleSessionIds: new Set(['s-other']) }).length).toBe(0)
  })

  it('keeps a cross-community session out of the count', () => {
    const p = computePassport({
      userId: ME, communityId: 'c1', sessions: [session({ community_id: 'c2' })],
      confirmations: [], tokens: [token({ community_id: 'c2' })],
    })
    expect(p.verified).toBe(0)
    expect(p.tokenCount).toBe(0)
  })
})
