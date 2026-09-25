import { describe, it, expect } from 'vitest'
import { buildBuddyContext, buildStoriesContext, buildCircleContext } from '../askMutuExtras'

describe('Buddy Program context', () => {
  const programs = [{ id: 'p', name: 'Rotman Buddies', role: 'mentee', enabled: true }]

  it('keeps a suggested pairing nameless until both accepted', () => {
    const ctx = buildBuddyContext({
      programs,
      state: {
        post: { role: 'mentee', need: 'Recruiting advice', offer: 'Coffee and notes', active: true },
        pairings: [{ status: 'suggested', peer: { role: 'mentor', name: 'Upper-year mentor', need: null, offer: 'Case prep' } }],
      },
    })
    expect(ctx.pairings[0].buddy_name).toBeNull()
    expect(ctx.pairings[0].buddy_role).toBe('mentor')
    expect(ctx.my_post.want_help_with).toBe('Recruiting advice')
  })

  it('names the buddy once accepted, and never carries contact details', () => {
    const ctx = buildBuddyContext({
      programs,
      state: { pairings: [{ status: 'accepted', both_met: false, peer: { role: 'mentor', name: 'Priya Sharma', contact: 'priya@example.com' } }] },
    })
    expect(ctx.pairings[0].buddy_name).toBe('Priya Sharma')
    expect(ctx.pairings[0].both_have_met).toBe(false)
    expect(JSON.stringify(ctx)).not.toContain('example.com')
  })

  it('says nothing at all for a member who never joined', () => {
    expect(buildBuddyContext({ programs: [], state: null })).toBeNull()
  })
})

describe('Story Garden context', () => {
  const mine = { author_id: 'me', title: 'Switching into consulting', topic: 'Career', status: 'published', updated_at: '2026-09-20T09:00:00Z' }

  it('carries titles and topics but never the writing itself', () => {
    const ctx = buildStoriesContext({ stories: [{ ...mine, body: 'a very private paragraph' }], userId: 'me' })
    expect(ctx[0]).toEqual({ title: 'Switching into consulting', topic: 'Career', status: 'published', last_worked_on: '2026-09-20' })
    expect(JSON.stringify(ctx)).not.toContain('private paragraph')
  })

  it('never includes anyone else’s stories', () => {
    expect(buildStoriesContext({ stories: [{ ...mine, author_id: 'someone' }], userId: 'me' })).toBeNull()
  })
})

describe('Relationship strength context', () => {
  const edges = [
    { user_lo: 'me', user_hi: 'a', verified_count: 3, token_count: 3, last_verified_at: '2026-09-18T00:00:00Z' },
    { user_lo: 'b', user_hi: 'me', verified_count: 5, token_count: 5, last_verified_at: '2026-09-19T00:00:00Z' },
    { user_lo: 'me', user_hi: 'c', verified_count: 0, token_count: 0 },
  ]
  const namesById = { a: 'Maya Khan', b: 'Noah Adeyemi', c: 'Nobody Yet' }

  it('ranks by what both people confirmed, in either direction', () => {
    const ctx = buildCircleContext({ edges, namesById, userId: 'me' })
    expect(ctx.map((r) => r.name)).toEqual(['Noah Adeyemi', 'Maya Khan'])
    expect(ctx[0].practices_together).toBe(5)
    expect(ctx[0].last_together).toBe('2026-09-19')
  })

  it('leaves out relationships with nothing verified', () => {
    const ctx = buildCircleContext({ edges, namesById, userId: 'me' })
    expect(ctx.find((r) => r.name === 'Nobody Yet')).toBeUndefined()
  })

  it('never builds a circle without knowing who is asking', () => {
    expect(buildCircleContext({ edges, namesById, userId: null })).toBeNull()
  })
})
