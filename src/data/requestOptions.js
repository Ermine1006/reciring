// ── Shared taxonomy for Post Request form + Discover filters ──────
// Single source of truth. Import from here everywhere.

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

export const INDUSTRIES = [
  'Consulting',
  'Investment Banking',
  'Tech',
  'Private Equity',
  'VC',
  'Marketing',
  'Operations',
  'Other',
]

// Short aliases used in older mock data and tags.
// Maps abbreviated form → canonical label from INDUSTRIES above.
export const INDUSTRY_ALIASES = {
  'IB':      'Investment Banking',
  'PE':      'Private Equity',
  'Finance': 'Investment Banking',
}

// Normalize a value to its canonical industry label (or return as-is).
export function normalizeIndustry(value) {
  return INDUSTRY_ALIASES[value] || value
}
