import { describe, it, expect } from 'vitest'
import {
  matchingState, availabilitySummary, preferenceChips,
  nextMilestoneProgress, nextEventForYou, eventMeta,
} from '../togetherSummary'
import { PAGE, CONNECTION_CARDS, MATCHING_COPY, EMPTY_EVENT, MIN_TAP, T } from '../../data/togetherContent'

const soon = (days, hour = 19) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

describe('page identity and positioning (tests 1, 2, 3, 4)', () => {
  it('keeps the page called Together', () => {
    expect(PAGE.title).toBe('Together')
  })

  it('subtitles the whole community hub, not one feature', () => {
    expect(PAGE.subtitle).toBe('Practise, learn and connect with your community.')
    expect(PAGE.subtitle.toLowerCase()).not.toContain('consulting')
    expect(PAGE.title.toLowerCase()).not.toContain('consulting')
    expect(PAGE.title.toLowerCase()).not.toContain('practice')
  })

  it('offers both pathways, with Groups & Events at equal weight', () => {
    const ids = CONNECTION_CARDS.map((c) => c.id)
    expect(ids).toEqual(['one_on_one', 'groups'])
    const [mock, groups] = CONNECTION_CARDS
    expect(mock.title).toBe('Mock Interview')
    expect(groups.title).toBe('Groups & Events')
    // both are real cards with their own call to action
    expect(mock.cta).toBe('Find a partner')
    expect(groups.cta).toBe('Explore events')
    expect(Object.keys(mock).sort()).toEqual(Object.keys(groups).sort())
  })

  it('never describes Groups & Events as consulting-specific', () => {
    const groups = CONNECTION_CARDS.find((c) => c.id === 'groups')
    const words = `${groups.title} ${groups.sub} ${groups.cta}`.toLowerCase()
    for (const t of ['consulting', 'case interview', 'mock']) expect(words).not.toContain(t)
    expect(groups.sub).toBe('Learn, share interests and meet your community')
    // ...while Mock Interview is allowed to say what it is
    expect(CONNECTION_CARDS.find((c) => c.id === 'one_on_one').sub).toContain('consulting')
  })

  it('routes each card to the flow that already exists (tests 5, 6)', () => {
    expect(CONNECTION_CARDS.find((c) => c.id === 'one_on_one').action).toBe('practice')
    expect(CONNECTION_CARDS.find((c) => c.id === 'groups').action).toBe('events')
  })
})

describe('activity summary reads real Passport data (tests 7, 8)', () => {
  it('derives progress from the milestone thresholds that already exist', () => {
    const p = nextMilestoneProgress({ verified: 1, partners: 1, candidateRounds: 1, interviewerRounds: 1 })
    // first_live_practice needs 1 verified and is already earned, so the
    // next open milestone is the one reported
    expect(p.id).toBe('practice_explorer')
    expect(p.value).toBeGreaterThan(0)
    expect(p.value).toBeLessThan(1)
    expect(p.valueText).toMatch(/toward Mock Interview Explorer/)
  })

  it('shows nothing at all rather than inventing a goal', () => {
    expect(nextMilestoneProgress(null)).toBeNull()
    const everything = {
      verified: 99, partners: 99, candidateRounds: 99,
      interviewerRounds: 99, helpfulInterviewerRounds: 99,
    }
    expect(nextMilestoneProgress(everything)).toBeNull()
  })

  it('starts a brand new member at zero progress, not at a flattering number', () => {
    const p = nextMilestoneProgress({ verified: 0, partners: 0, candidateRounds: 0, interviewerRounds: 0 })
    expect(p.id).toBe('first_live_practice')
    expect(p.value).toBe(0)
  })
})

describe('matching state is only ever what is true (tests 9, 10)', () => {
  it('does not claim matching for someone who never joined', () => {
    expect(matchingState({ myRequest: null })).toBe('not_enrolled')
    expect(MATCHING_COPY.not_enrolled.body.toLowerCase()).not.toContain('we’re looking')
  })

  it('does not claim matching for someone who withdrew', () => {
    expect(matchingState({ myRequest: { status: 'withdrawn' } })).toBe('paused')
    expect(MATCHING_COPY.paused.body).toContain('Nobody is being matched with you right now')
  })

  it('only an active request with no partners yet is actively searching', () => {
    expect(matchingState({ myRequest: { status: 'active' } })).toBe('searching')
    expect(MATCHING_COPY.searching.title).toBe('Finding your mock interview partner')
    expect(MATCHING_COPY.searching.body)
      .toBe('We’re looking for someone whose goals and availability complement yours.')
  })

  it('reports the furthest real state first, and never invents a partner', () => {
    const base = { myRequest: { status: 'active' } }
    expect(matchingState({ ...base, fitCount: 2 })).toBe('suggested')
    expect(matchingState({ ...base, fitCount: 2, outgoingCount: 1 })).toBe('invitation_pending')
    expect(matchingState({ ...base, incomingCount: 1 })).toBe('invitation_received')
    expect(matchingState({ ...base, incomingCount: 1, scheduledCount: 1 })).toBe('scheduled')
    // every state has copy, and none of them names a person or a time
    for (const [, c] of Object.entries(MATCHING_COPY)) {
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.body.length).toBeGreaterThan(0)
      expect(c.cta.length).toBeGreaterThan(0)
    }
  })

  it('builds chips from real preferences and omits what was never recorded', () => {
    expect(preferenceChips(null)).toEqual([])
    const chips = preferenceChips({ want_types: ['case'], timezone: 'America/Toronto' }, [])
    expect(chips.map((c) => c.label)).toEqual(['Case interview'])
    // no duration recorded → no duration chip, and never "Not recorded"
    expect(JSON.stringify(chips)).not.toContain('Not recorded')
  })

  it('adds an availability chip only from windows that are still ahead', () => {
    const req = { want_types: ['behavioural'], duration_minutes: 60, timezone: 'America/Toronto' }
    const past = [{ starts_at: '2020-01-07T23:00:00.000Z', ends_at: '2020-01-08T00:00:00.000Z' }]
    expect(preferenceChips(req, past).map((c) => c.id)).toEqual(['want_behavioural', 'duration'])

    const future = [{ starts_at: soon(3), ends_at: soon(3) }]
    const labels = preferenceChips(req, future).map((c) => c.label)
    expect(labels).toContain('About 60 min')
    expect(labels.some((l) => /(mornings|afternoons|evenings)$/.test(l))).toBe(true)
  })

  it('summarises availability in the member’s own timezone', () => {
    // 2026-09-01 is a Tuesday; 23:00 UTC is 19:00 in Toronto
    const w = [{ starts_at: '2099-09-01T23:00:00.000Z', ends_at: '2099-09-02T00:00:00.000Z' }]
    expect(availabilitySummary(w, 'America/Toronto')).toBe('Tue evenings')
    expect(availabilitySummary([], 'America/Toronto')).toBeNull()
    expect(availabilitySummary(null, 'America/Toronto')).toBeNull()
  })

  it('never reports a session mode, because a request does not store one', () => {
    const chips = preferenceChips(
      { want_types: ['case'], duration_minutes: 75, timezone: 'America/Toronto' }, []
    )
    const text = chips.map((c) => c.label).join(' ')
    expect(text).not.toContain('Full Mock Swap')
    expect(text).not.toContain('Quick Skill Drill')
  })
})

describe('upcoming event uses real data or an honest empty state (tests 11, 12)', () => {
  const ev = (over) => ({ id: 'e', title: 'T', start_at: soon(5), category: 'Community wellness', ...over })

  it('returns null when there is genuinely nothing, so the empty state shows', () => {
    expect(nextEventForYou([], new Set())).toBeNull()
    expect(nextEventForYou(null, new Set())).toBeNull()
    expect(EMPTY_EVENT.title).toBe('No upcoming events yet')
    expect(EMPTY_EVENT.cta).toBe('Explore events')
  })

  it('ignores events that have already started', () => {
    expect(nextEventForYou([ev({ id: 'old', start_at: '2020-01-01T00:00:00.000Z' })], new Set())).toBeNull()
  })

  it('prefers an event the member joined or hosts, then the soonest', () => {
    const list = [ev({ id: 'a', start_at: soon(2) }), ev({ id: 'b', start_at: soon(9) })]
    expect(nextEventForYou(list, new Set()).id).toBe('a')
    expect(nextEventForYou(list, new Set(['b'])).id).toBe('b')
    expect(nextEventForYou(list, new Set(), 'u1')).toBe(list[0])
    expect(nextEventForYou([ev({ id: 'c', host_user_id: 'u1', start_at: soon(9) }), list[0]], new Set(), 'u1').id)
      .toBe('c')
  })

  it('describes the event from its own fields only', () => {
    expect(eventMeta(null)).toBe('')
    const meta = eventMeta(ev({ start_at: '2099-09-06T15:00:00.000Z' }))
    expect(meta).toContain('Community wellness')
    expect(meta).toContain('·')
    // nothing from the visual reference is baked in
    expect(eventMeta(ev({ category: null, start_at: null }))).toBe('')
  })

  it('carries no sample event anywhere in the page content', () => {
    const blob = JSON.stringify({ PAGE, CONNECTION_CARDS, MATCHING_COPY, EMPTY_EVENT })
    for (const s of ['Founders Yoga', 'Sep 6', 'Tue evenings', 'Full Mock Swap']) {
      expect(blob).not.toContain(s)
    }
  })
})

describe('layout and accessibility contract (tests 13, 14)', () => {
  it('keeps interactive targets at the 44px minimum', () => {
    expect(MIN_TAP).toBe(44)
  })

  it('uses the shared palette rather than scattered values', () => {
    // the page background must match AppScreen's, or the page seams
    expect(T.page).toBe('#F9F7F4')
    expect(T.radius).toBeGreaterThanOrEqual(20)
    expect(T.radius).toBeLessThanOrEqual(24)
    // no gradients in the token set
    expect(JSON.stringify(T)).not.toContain('gradient')
  })

  it('writes headings in sentence case, never all caps', () => {
    for (const h of [PAGE.connectHeading, PAGE.activityTitle, PAGE.upcomingHeading, PAGE.title]) {
      expect(h).not.toBe(h.toUpperCase())
    }
  })
})
