import { describe, it, expect } from 'vitest'
import {
  CAREER_FOCUS, MAX_CAREER_FOCUS,
  normalizeCareerFocus, broadLabelsOf, toCareerFocusStorage,
  getCareerFocusLabel, getCareerSpecializationLabel,
  getCareerFocusOptions, getCareerSpecializationOptions, isSpecializationKey,
} from '../careerFocus'

describe('canonical taxonomy shape', () => {
  it('uses stable snake_case machine keys separate from labels', () => {
    for (const o of CAREER_FOCUS) {
      expect(o.key).toMatch(/^[a-z][a-z_]*$/)
      expect(o.label.length).toBeGreaterThan(0)
    }
    expect(getCareerFocusOptions().map((o) => o.key)).toContain('finance')
    expect(getCareerFocusLabel('marketing_sales')).toBe('Marketing & Sales')
    expect(getCareerSpecializationLabel('venture_capital')).toBe('Venture Capital')
  })
  it('IB / PE / VC are Finance specializations, never top-level', () => {
    expect(CAREER_FOCUS.map((o) => o.label)).not.toContain('Investment Banking')
    expect(isSpecializationKey('private_equity')).toBe(true)
    expect(getCareerSpecializationOptions('finance').map((s) => s.key))
      .toEqual(['investment_banking', 'private_equity', 'venture_capital',
                'asset_management', 'corporate_finance', 'fintech'])
  })
})

describe('legacy normalization (test points 1, 2, 4, 12)', () => {
  it('normalizes every legacy value from the spec table', () => {
    expect(normalizeCareerFocus(['Investment Banking']))
      .toEqual({ focus: ['finance'], specializations: { finance: ['investment_banking'] } })
    expect(normalizeCareerFocus(['Private Equity']).specializations.finance).toEqual(['private_equity'])
    expect(normalizeCareerFocus(['VC']).specializations.finance).toEqual(['venture_capital'])
    expect(normalizeCareerFocus(['Venture Capital']).specializations.finance).toEqual(['venture_capital'])
    expect(normalizeCareerFocus(['Tech']).focus).toEqual(['technology'])
    expect(normalizeCareerFocus(['Marketing']).focus).toEqual(['marketing_sales'])
    expect(normalizeCareerFocus(['Operations']).focus).toEqual(['operations_supply_chain'])
  })

  it('spec example: Tech + PE + VC → Technology + Finance with two specializations', () => {
    const r = normalizeCareerFocus(['Tech', 'Private Equity', 'VC'])
    expect(r.focus).toEqual(['technology', 'finance'])           // TWO broad, not three
    expect(r.specializations.finance).toEqual(['private_equity', 'venture_capital'])
  })

  it('never silently removes a selection: unknown free text folds into Other', () => {
    const r = normalizeCareerFocus(['Quantum Basket Weaving'])
    expect(r.focus).toEqual(['other'])
  })

  it('accepts canonical keys, canonical labels and v3 ids alike', () => {
    expect(normalizeCareerFocus(['finance']).focus).toEqual(['finance'])
    expect(normalizeCareerFocus(['Finance']).focus).toEqual(['finance'])
    expect(normalizeCareerFocus(['ai-technology']).focus).toEqual(['technology'])
    expect(normalizeCareerFocus(['fintech']))
      .toEqual({ focus: ['finance'], specializations: { finance: ['fintech'] } })
  })
})

describe('limits (test points 3, 4)', () => {
  it('broad selections never exceed three', () => {
    const r = normalizeCareerFocus(['Consulting', 'Tech', 'Marketing', 'Operations', 'Healthcare'])
    expect(r.focus).toHaveLength(MAX_CAREER_FOCUS)
  })
  it('specializations never count toward the broad limit', () => {
    const r = normalizeCareerFocus([
      'Consulting', 'Technology', 'Entrepreneurship',            // three broad
      'Investment Banking', 'Private Equity', 'Venture Capital', // finance specs → +1 broad
    ])
    // finance would be the 4th broad — capped — but the user's intent
    // is preserved for the first three and no spec eats a broad slot.
    expect(r.focus).toEqual(['consulting', 'technology', 'entrepreneurship'])
    const r2 = normalizeCareerFocus(['Finance', 'Consulting', 'Investment Banking', 'Private Equity'])
    expect(r2.focus).toEqual(['finance', 'consulting'])          // 2 broad
    expect(r2.specializations.finance).toEqual(['investment_banking', 'private_equity'])
  })
})

describe('storage round-trip', () => {
  it('flattens to machine keys and reads back identically', () => {
    const shape = normalizeCareerFocus(['Tech', 'Private Equity', 'VC'])
    const stored = toCareerFocusStorage(shape)
    expect(stored).toEqual(['technology', 'finance', 'private_equity', 'venture_capital'])
    expect(normalizeCareerFocus(stored)).toEqual(shape)
  })
  it('broadLabelsOf renders display labels from any mix', () => {
    expect(broadLabelsOf(['IB', 'tech', 'Marketing'])).toEqual(
      ['Finance', 'Technology', 'Marketing & Sales'])
  })
})
