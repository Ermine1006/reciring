// ── Career Focus: THE canonical taxonomy ────────────────────────────
// One shared source of truth for every surface that talks about a
// member's professional focus: onboarding, profile edit/display,
// Discover chips + filters, matching + explanations, AI context,
// Suggested for you, the Community Map clusters and demo data.
//
// Machine keys are stable snake_case identifiers; display labels are
// presentation only. Storage (profiles.industry_interests, an existing
// text[] column) holds machine keys going forward — broad keys and
// specialization keys share the array, and normalizeCareerFocus()
// separates them on read. Legacy label values ("Investment Banking",
// "Tech", profile-v3 ids…) normalize losslessly on read, so no data
// migration is required and nothing a user selected is ever dropped.

export const MAX_CAREER_FOCUS = 3

// Broad top-level categories (functions, sectors and career paths —
// hence "Career Focus", not "Industry Focus").
export const CAREER_FOCUS = [
  { key: 'finance',                      label: 'Finance' },
  { key: 'consulting',                   label: 'Consulting' },
  { key: 'technology',                   label: 'Technology' },
  { key: 'marketing_sales',              label: 'Marketing & Sales' },
  { key: 'operations_supply_chain',      label: 'Operations & Supply Chain' },
  { key: 'strategy_general_management',  label: 'Strategy & General Management' },
  { key: 'entrepreneurship',             label: 'Entrepreneurship' },
  { key: 'healthcare_life_sciences',     label: 'Healthcare & Life Sciences' },
  { key: 'real_estate',                  label: 'Real Estate' },
  { key: 'sustainability_social_impact', label: 'Sustainability & Social Impact' },
  { key: 'public_nonprofit',             label: 'Public Sector & Nonprofit' },
  { key: 'other',                        label: 'Other' },
]

// Specializations are SECONDARY data under a broad category. They
// never count toward the three-broad-selection limit and never appear
// as top-level clusters anywhere.
export const CAREER_SPECIALIZATIONS = {
  finance: [
    { key: 'investment_banking', label: 'Investment Banking' },
    { key: 'private_equity',     label: 'Private Equity' },
    { key: 'venture_capital',    label: 'Venture Capital' },
    { key: 'asset_management',   label: 'Asset Management' },
    { key: 'corporate_finance',  label: 'Corporate Finance' },
    { key: 'fintech',            label: 'FinTech' },
  ],
}

const FOCUS_BY_KEY = new Map(CAREER_FOCUS.map((o) => [o.key, o]))
const SPEC_BY_KEY = new Map(
  Object.entries(CAREER_SPECIALIZATIONS).flatMap(([parent, list]) =>
    list.map((s) => [s.key, { ...s, parent }]))
)

// Legacy synonyms → canonical target. A target is either a broad key
// or { focus, spec } when the legacy value was really a specialization
// (Investment Banking / PE / VC live under Finance, not beside it).
// Keys here are matched case-insensitively after trimming.
const LEGACY = {
  // finance family
  'investment banking':  { focus: 'finance', spec: 'investment_banking' },
  'investment-banking':  { focus: 'finance', spec: 'investment_banking' },
  'ib':                  { focus: 'finance', spec: 'investment_banking' },
  'banking':             { focus: 'finance', spec: 'investment_banking' },
  'private equity':      { focus: 'finance', spec: 'private_equity' },
  'private-equity':      { focus: 'finance', spec: 'private_equity' },
  'pe':                  { focus: 'finance', spec: 'private_equity' },
  'vc':                  { focus: 'finance', spec: 'venture_capital' },
  'venture capital':     { focus: 'finance', spec: 'venture_capital' },
  'venture-capital':     { focus: 'finance', spec: 'venture_capital' },
  'asset management':    { focus: 'finance', spec: 'asset_management' },
  'corporate finance':   { focus: 'finance', spec: 'corporate_finance' },
  'fintech':             { focus: 'finance', spec: 'fintech' },
  // broad synonyms
  'tech': 'technology',
  'ai & technology': 'technology',
  'ai-technology': 'technology',
  'ai technology': 'technology',
  'ai': 'technology',
  'software': 'technology',
  'marketing': 'marketing_sales',
  'sales': 'marketing_sales',
  'marketing & sales': 'marketing_sales',
  'operations': 'operations_supply_chain',
  'supply chain': 'operations_supply_chain',
  'operations & supply chain': 'operations_supply_chain',
  'strategy': 'strategy_general_management',
  'general management': 'strategy_general_management',
  'strategy & general management': 'strategy_general_management',
  'startup': 'entrepreneurship',
  'start-up': 'entrepreneurship',
  'start up': 'entrepreneurship',
  'founder': 'entrepreneurship',
  'healthcare': 'healthcare_life_sciences',
  'health': 'healthcare_life_sciences',
  'biotech': 'healthcare_life_sciences',
  'life sciences': 'healthcare_life_sciences',
  'healthcare & life sciences': 'healthcare_life_sciences',
  'real estate': 'real_estate',
  'real-estate': 'real_estate',
  'proptech': 'real_estate',
  'sustainability': 'sustainability_social_impact',
  'social impact': 'sustainability_social_impact',
  'social-impact': 'sustainability_social_impact',
  'energy & climate': 'sustainability_social_impact',
  'energy-climate': 'sustainability_social_impact',
  'cleantech': 'sustainability_social_impact',
  'climate': 'sustainability_social_impact',
  'public sector': 'public_nonprofit',
  'nonprofit': 'public_nonprofit',
  'public sector & nonprofit': 'public_nonprofit',
  // legacy v3 ids / misc with no broad home of their own
  'education': 'other',
  'edtech': 'other',
  'retail & cpg': 'other',
  'retail-cpg': 'other',
  'cpg': 'other',
  'consumer goods': 'other',
  'media & entertainment': 'other',
  'media-entertainment': 'other',
}

const LABEL_TO_KEY = new Map(CAREER_FOCUS.map((o) => [o.label.toLowerCase(), o.key]))
const SPEC_LABEL_TO_KEY = new Map(
  [...SPEC_BY_KEY.values()].map((s) => [s.label.toLowerCase(), s.key])
)

/** Resolve ONE raw value → { focus } or { focus, spec } or null. */
function resolveOne(raw) {
  const v = String(raw || '').trim()
  if (!v) return null
  const lower = v.toLowerCase()
  if (FOCUS_BY_KEY.has(lower)) return { focus: lower }
  if (SPEC_BY_KEY.has(lower)) return { focus: SPEC_BY_KEY.get(lower).parent, spec: lower }
  if (LABEL_TO_KEY.has(lower)) return { focus: LABEL_TO_KEY.get(lower) }
  if (SPEC_LABEL_TO_KEY.has(lower)) {
    const spec = SPEC_LABEL_TO_KEY.get(lower)
    return { focus: SPEC_BY_KEY.get(spec).parent, spec }
  }
  const legacy = LEGACY[lower]
  if (typeof legacy === 'string') return { focus: legacy }
  if (legacy) return { focus: legacy.focus, spec: legacy.spec }
  return { focus: 'other' }                       // unknown free text: never dropped
}

/**
 * Normalize ANY mix of canonical keys, display labels and legacy
 * values into the canonical shape:
 *   { focus: [broadKey…] (≤ MAX, deduped, selection order kept),
 *     specializations: { finance: [specKey…] } }
 * Example: ['Tech','Private Equity','VC'] →
 *   focus ['technology','finance'],
 *   specializations { finance: ['private_equity','venture_capital'] }
 */
export function normalizeCareerFocus(values = []) {
  const focus = []
  const specs = {}
  for (const raw of Array.isArray(values) ? values : [values]) {
    const r = resolveOne(raw)
    if (!r) continue
    if (!focus.includes(r.focus)) focus.push(r.focus)
    if (r.spec) {
      if (!specs[r.focus]) specs[r.focus] = []
      if (!specs[r.focus].includes(r.spec)) specs[r.focus].push(r.spec)
    }
  }
  return { focus: focus.slice(0, MAX_CAREER_FOCUS), specializations: specs }
}

/** Broad display labels for any raw values (deduped, canonical). */
export function broadLabelsOf(values = []) {
  return normalizeCareerFocus(values).focus.map((k) => getCareerFocusLabel(k))
}

export function getCareerFocusLabel(key) {
  return FOCUS_BY_KEY.get(String(key || '').toLowerCase())?.label || String(key || '')
}

export function getCareerSpecializationLabel(key) {
  return SPEC_BY_KEY.get(String(key || '').toLowerCase())?.label || String(key || '')
}

export function getCareerFocusOptions() {
  return CAREER_FOCUS.map((o) => ({ ...o }))
}

export function getCareerSpecializationOptions(focusKey) {
  return (CAREER_SPECIALIZATIONS[focusKey] || []).map((o) => ({ ...o }))
}

export function isSpecializationKey(key) {
  return SPEC_BY_KEY.has(String(key || '').toLowerCase())
}

/**
 * Flatten the canonical shape back to ONE array of machine keys for
 * the existing profiles.industry_interests column (broad keys first,
 * specialization keys after — normalizeCareerFocus round-trips it).
 */
export function toCareerFocusStorage({ focus = [], specializations = {} } = {}) {
  const specKeys = Object.values(specializations).flat()
  return [...focus, ...specKeys]
}
