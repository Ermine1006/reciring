import { describe, it, expect } from 'vitest'
import { getMatchScore, getMatchReasons, getCareerFocusExplanation, filterRequests } from '../matchRanking'

// Career-Focus behaviour of the matcher (canonical taxonomy).

describe('broad-overlap credit (test point 6)', () => {
  const vcViewer = { strengths: [], learn: [], industries: ['VC'] }
  const peRequest = { tags: ['Private Equity'], category: 'Referral', poster: null }

  it('a VC viewer gets Finance credit against a Private Equity request', () => {
    const withOverlap = getMatchScore(peRequest, vcViewer)
    const without = getMatchScore(peRequest, { strengths: [], learn: [], industries: ['Consulting'] })
    expect(withOverlap.relevance).toBeGreaterThan(without.relevance)
  })

  it('reason chip names the shared broad area, never "no overlap"', () => {
    const reasons = getMatchReasons(peRequest, vcViewer).join(' · ')
    expect(reasons).toContain('You are both interested in Finance')
    expect(reasons.toLowerCase()).not.toContain('no professional')
  })
})

describe('getCareerFocusExplanation (test point 5 output shape)', () => {
  it('uses the spec sentence for same-broad different-specialization pairs', () => {
    expect(getCareerFocusExplanation(['VC'], ['Private Equity'])).toBe(
      'You are both interested in Finance. You focus on Venture Capital, while they have Private Equity experience.'
    )
  })
  it('accepts legacy synonyms and returns canonical wording', () => {
    expect(getCareerFocusExplanation(['ib'], ['Finance'])).toBe('You are both interested in Finance.')
    expect(getCareerFocusExplanation(['Tech'], ['Consulting'])).toBeNull()
  })
})

describe('Discover filters on normalized legacy profiles (test point 7)', () => {
  const requests = [
    { id: 1, tags: ['Investment Banking'], category: 'Referral', time: '30 min' },
    { id: 2, tags: ['Tech'], category: 'Advice', time: '30 min' },
    { id: 3, tags: ['Marketing'], category: 'Advice', time: '30 min' },
  ]
  it('the broad Finance filter matches a legacy IB-tagged post', () => {
    const out = filterRequests(requests, { industries: ['Finance'], helpTypes: [], times: [] })
    expect(out.map((r) => r.id)).toEqual([1])
  })
  it('the broad Technology filter matches a legacy Tech tag', () => {
    const out = filterRequests(requests, { industries: ['Technology'], helpTypes: [], times: [] })
    expect(out.map((r) => r.id)).toEqual([2])
  })
})
