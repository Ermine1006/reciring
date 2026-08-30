// ── Shared options for Post Request form + Discover filters ───────
// Career Focus comes from THE canonical taxonomy (src/data/careerFocus
// .js) — never define category lists here. The exports below keep the
// historical names so existing imports stay valid, but they are thin
// views over the canonical module.

import { getCareerFocusOptions, broadLabelsOf } from './careerFocus'

export const TIME_OPTIONS = ['15 min', '30 min', '1 hr', '2+ hr']

export const HELP_TYPES = [
  'Referral',
  'Coffee Chat',
  'Resume Review',
  'Mock Interview',
  'Intro',
  'Study Group',
  'Advice',
]

// Broad Career Focus display labels (chips on the composer and the
// Discover filter sheet). Specializations never appear here.
export const INDUSTRIES = getCareerFocusOptions().map((o) => o.label)

/**
 * Normalize ANY legacy value (labels, 'IB', 'PE', 'VC', v3 ids…) to
 * its broad Career Focus display label. Specialization inputs resolve
 * to their parent ('Investment Banking' → 'Finance').
 */
export function normalizeIndustry(value) {
  return broadLabelsOf([value])[0] || String(value || '')
}
