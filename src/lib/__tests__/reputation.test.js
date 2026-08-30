import { describe, it, expect } from 'vitest'
import { computeReputation, formatFollowThrough, FOLLOW_THROUGH_MIN_SAMPLE } from '../reputation'

const ME = 'me'
const COMM = 'rotman'
const tok = (peer, comm = COMM) => ({
  user_lo: ME < peer ? ME : peer, user_hi: ME < peer ? peer : ME, community_id: comm,
})
const sess = (status, confirmed = true, comm = COMM) => ({
  status, confirmed_at: confirmed ? '2026-08-26T00:00:00Z' : null, community_id: comm,
})

describe('computeReputation', () => {
  it('empty history → New to Together, no percentages', () => {
    const r = computeReputation({ tokens: [], sessions: [], myUserId: ME, communityId: COMM })
    expect(r.label).toBe('New to Together')
    expect(r.verifiedCount).toBe(0)
    expect(r.followThrough).toBeNull()
    expect(formatFollowThrough(r.followThrough)).toBeNull()
    expect(r.badges.every((b) => !b.earned)).toBe(true)
  })

  it('one verified exchange never shows a misleading 100%', () => {
    const r = computeReputation({
      tokens: [tok('a')], sessions: [sess('verified')], myUserId: ME, communityId: COMM,
    })
    expect(r.verifiedCount).toBe(1)
    expect(r.followThrough).toBeNull()      // sample of 1 < minimum
    expect(r.badges.find((b) => b.id === 'first_exchange').earned).toBe(true)
  })

  it('counts unique and repeat partners from shared tokens', () => {
    const tokens = [tok('a'), tok('a'), tok('b'), tok('c'), tok('c'), tok('c')]
    const r = computeReputation({ tokens, sessions: [], myUserId: ME, communityId: COMM })
    expect(r.verifiedCount).toBe(6)
    expect(r.uniquePartners).toBe(3)
    expect(r.repeatPartners).toBe(2)        // a (×2) and c (×3)
  })

  it('follow-through only with a real sample; cancellations after confirming count against it', () => {
    const sessions = [
      ...Array.from({ length: 5 }, () => sess('verified')),
      sess('cancelled'),                    // confirmed then cancelled → counts against
      sess('proposed', false),              // never confirmed → excluded entirely
    ]
    const r = computeReputation({ tokens: [], sessions, myUserId: ME, communityId: COMM })
    expect(r.followThroughSample).toBe(6)
    expect(r.followThrough).toBeCloseTo(5 / 6)
    expect(formatFollowThrough(r.followThrough)).toBe('83%')
  })

  it('Reliable contributor needs 5 verified + strong follow-through', () => {
    const tokens = Array.from({ length: 5 }, (_, i) => tok(`p${i}`))
    const sessions = Array.from({ length: FOLLOW_THROUGH_MIN_SAMPLE }, () => sess('verified'))
    const r = computeReputation({ tokens, sessions, myUserId: ME, communityId: COMM })
    expect(r.label).toBe('Reliable contributor')
    expect(r.badges.find((b) => b.id === 'reliable').earned).toBe(true)
    expect(r.badges.find((b) => b.id === 'contributor').earned).toBe(true)   // 5 unique people
  })

  it('reputation is community-scoped — other communities never leak in', () => {
    const tokens = [tok('a'), tok('b', 'other-school')]
    const sessions = [sess('verified'), sess('verified', true, 'other-school')]
    const r = computeReputation({ tokens, sessions, myUserId: ME, communityId: COMM })
    expect(r.verifiedCount).toBe(1)
    expect(r.uniquePartners).toBe(1)
    expect(r.followThroughSample).toBe(1)
  })

  it('badge progress is transparent toward the next target', () => {
    const tokens = [tok('a'), tok('b'), tok('c')]
    const r = computeReputation({ tokens, sessions: [], myUserId: ME, communityId: COMM })
    const next = r.nextBadge
    expect(next).toBeTruthy()
    expect(next.progress).toBeGreaterThan(0)
    expect(next.progress).toBeLessThan(1)
    expect(next.desc).toBeTruthy()          // criteria always stated
  })
})
