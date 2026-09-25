import { describe, it, expect } from 'vitest'
import { buildPostsContext } from '../askMutuPosts'

const NOW = new Date('2026-09-24T12:00:00Z')

const mine = {
  id: 'p1', created_by: 'me', needs: 'Intro to a healthcare PM',
  offers: 'Happy to review decks', tags: ['Advice', 'Healthcare'],
  createdAtRaw: '2026-09-20T10:00:00Z', isAnonymous: true,
}
const theirs = { id: 'p2', created_by: 'someone-else', needs: 'Dance classes', createdAtRaw: '2026-09-21T10:00:00Z' }

describe('Give and Ask context for the assistant', () => {
  it('carries only the member’s own posts', () => {
    const ctx = buildPostsContext({ posts: [mine, theirs], userId: 'me', now: NOW })
    expect(ctx).toHaveLength(1)
    expect(ctx[0].asked_for).toBe('Intro to a healthcare PM')
    expect(ctx[0].offers_back).toBe('Happy to review decks')
  })

  it('separates a quiet post from one that worked', () => {
    const [quiet] = buildPostsContext({ posts: [mine], userId: 'me', matchedPostIds: [], now: NOW })
    expect(quiet).toMatchObject({ is_live: true, has_match: false })

    const [answered] = buildPostsContext({ posts: [mine], userId: 'me', matchedPostIds: ['p1'], now: NOW })
    expect(answered.has_match).toBe(true)
  })

  it('marks an expired post as no longer live', () => {
    const expired = { ...mine, expiresAt: '2026-09-22T10:00:00Z' }
    expect(buildPostsContext({ posts: [expired], userId: 'me', now: NOW })[0].is_live).toBe(false)
  })

  it('records whether they posted under their name', () => {
    const named = { ...mine, isAnonymous: false }
    expect(buildPostsContext({ posts: [named], userId: 'me', now: NOW })[0].posted_anonymously).toBe(false)
  })

  it('returns nothing rather than an empty shape when they never posted', () => {
    expect(buildPostsContext({ posts: [theirs], userId: 'me', now: NOW })).toBeNull()
    expect(buildPostsContext({ posts: [], userId: 'me', now: NOW })).toBeNull()
  })

  it('never leaks posts when the viewer is unknown', () => {
    expect(buildPostsContext({ posts: [mine, theirs], userId: null, now: NOW })).toBeNull()
  })

  it('puts the newest post first and caps the payload', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...mine, id: `p${i}`, createdAtRaw: `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    }))
    const ctx = buildPostsContext({ posts: many, userId: 'me', now: NOW })
    expect(ctx).toHaveLength(12)
    expect(ctx[0].posted_on).toBe('2026-09-20')
  })
})
