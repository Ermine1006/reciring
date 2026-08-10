// ─────────────────────────────────────────────────────────────────────────
// Mutu profile taxonomy — the single canonical source of truth for the
// redesigned profile (professional + personal matching).
//
// Design notes
//   • Every tag has a stable, kebab-case `id` (stored in the DB) and a
//     human `label` (shown in the UI). Never store labels — store ids.
//   • `aliases` power idempotent migration from the legacy free-ish values
//     (see LEGACY_* maps at the bottom) and fuzzy text matching.
//   • Expertise-offered and help-wanted share ONE topic taxonomy (TOPICS) so
//     matching can be directional: my offered topic ↔ your wanted topic.
//   • Interaction formats (coffee chat, referral, …) live in HELPING_PREFS —
//     deliberately separate from expertise, per the redesign spec.
//
// This file has no imports and no side effects so it can be consumed by the
// web app, the Supabase Edge Function matcher, and migration scripts alike.
// ─────────────────────────────────────────────────────────────────────────

// Small helper: build a { id → tag } lookup and a label/alias → id resolver.
function index(list) {
  const byId = new Map()
  const byKey = new Map() // normalized label/alias → id
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  for (const t of list) {
    byId.set(t.id, t)
    byKey.set(norm(t.label), t.id)
    byKey.set(norm(t.id.replace(/-/g, ' ')), t.id)
    for (const a of t.aliases || []) byKey.set(norm(a), t.id)
  }
  return { byId, resolve: (v) => byKey.get(norm(v)) || null }
}

// ── Professional: shared topic taxonomy (expertise offered + help wanted) ──
export const TOPICS = [
  // Fundraising & finance
  { id: 'startup-fundraising',  label: 'Startup fundraising',  category: 'Fundraising & finance', aliases: ['fundraising', 'raising a round'] },
  { id: 'financial-modelling',  label: 'Financial modelling',  category: 'Fundraising & finance', aliases: ['financial modeling', 'modelling'] },
  { id: 'breaking-into-vc',     label: 'Breaking into VC',     category: 'Fundraising & finance', aliases: ['vc recruiting', 'getting into venture'] },
  { id: 'pitch-feedback',       label: 'Pitch feedback',       category: 'Fundraising & finance', aliases: ['pitch deck', 'deck review'] },
  // Product & design
  { id: 'product-strategy',     label: 'Product strategy',     category: 'Product & design', aliases: ['product management', 'pm'] },
  { id: 'ai-product-strategy',  label: 'AI product strategy',  category: 'Product & design', aliases: ['ai product', 'ai strategy'] },
  { id: 'user-research',        label: 'User research',        category: 'Product & design', aliases: ['user interviews', 'ux research', 'user discovery'] },
  { id: 'university-saas',      label: 'University SaaS',       category: 'Product & design', aliases: ['edu saas', 'campus saas'] },
  // Growth & marketing
  { id: 'product-led-growth',   label: 'Product-led growth',   category: 'Growth & marketing', aliases: ['plg', 'b2b product-led growth'] },
  { id: 'growth-marketing',     label: 'Growth marketing',     category: 'Growth & marketing', aliases: ['growth', 'performance marketing'] },
  { id: 'community-building',    label: 'Community building',   category: 'Growth & marketing', aliases: ['community'] },
  { id: 'founder-storytelling', label: 'Founder storytelling', category: 'Growth & marketing', aliases: ['storytelling', 'narrative'] },
  // Sales & operations
  { id: 'b2b-sales',            label: 'B2B sales',            category: 'Sales & operations', aliases: ['enterprise sales', 'sales'] },
  { id: 'startup-operations',   label: 'Startup operations',   category: 'Sales & operations', aliases: ['ops', 'operations'] },
  { id: 'go-to-market',         label: 'Go-to-market',         category: 'Sales & operations', aliases: ['gtm'] },
  // Career
  { id: 'recruiting',           label: 'Recruiting',           category: 'Career', aliases: ['hiring', 'talent'] },
  { id: 'interview-prep',       label: 'Interview preparation', category: 'Career', aliases: ['interview prep', 'case prep'] },
  { id: 'canadian-job-search',  label: 'Canadian job search',  category: 'Career', aliases: ['job search in canada', 'newcomer job search'] },
  { id: 'career-pivots',        label: 'Career pivots',        category: 'Career', aliases: ['career change', 'switching industries'] },
]

// ── Industries (shared by industries_known + industries_exploring) ──
export const INDUSTRIES = [
  { id: 'venture-capital',    label: 'Venture Capital',      aliases: ['vc'] },
  { id: 'private-equity',     label: 'Private Equity',       aliases: ['pe'] },
  { id: 'ai-technology',      label: 'AI & Technology',      aliases: ['tech', 'technology', 'ai', 'software'] },
  { id: 'fintech',            label: 'Fintech',              aliases: [] },
  { id: 'investment-banking', label: 'Investment Banking',   aliases: ['ib', 'banking', 'finance'] },
  { id: 'consulting',         label: 'Consulting',           aliases: ['strategy consulting'] },
  { id: 'education',          label: 'Education',            aliases: ['edtech'] },
  { id: 'healthcare',         label: 'Healthcare',           aliases: ['health', 'biotech', 'life sciences'] },
  { id: 'marketing',          label: 'Marketing',            aliases: [] },
  { id: 'operations',         label: 'Operations',           aliases: [] },
  { id: 'retail-cpg',         label: 'Retail & CPG',         aliases: ['cpg', 'consumer goods', 'retail'] },
  { id: 'real-estate',        label: 'Real Estate',          aliases: ['proptech'] },
  { id: 'energy-climate',     label: 'Energy & Climate',     aliases: ['cleantech', 'climate', 'energy'] },
  { id: 'media-entertainment', label: 'Media & Entertainment', aliases: ['media', 'entertainment'] },
  { id: 'social-impact',      label: 'Social Impact',        aliases: ['nonprofit', 'impact'] },
]

// ── Personal interests (grouped) ──
export const INTEREST_GROUPS = [
  { category: 'Active',          items: [
    { id: 'running', label: 'Running' }, { id: 'yoga', label: 'Yoga' },
    { id: 'hiking', label: 'Hiking' }, { id: 'climbing', label: 'Climbing' },
    { id: 'volleyball', label: 'Volleyball' }, { id: 'cycling', label: 'Cycling' },
  ]},
  { category: 'Creative',        items: [
    { id: 'photography', label: 'Photography' }, { id: 'music', label: 'Music' },
    { id: 'stand-up-comedy', label: 'Stand-up comedy', aliases: ['comedy'] }, { id: 'writing', label: 'Writing' },
  ]},
  { category: 'Culture',         items: [
    { id: 'anime', label: 'Anime' }, { id: 'gaming', label: 'Gaming' },
    { id: 'film', label: 'Film' }, { id: 'books', label: 'Books', aliases: ['reading'] },
    { id: 'japanese-culture', label: 'Japanese culture' },
  ]},
  { category: 'Food & social',   items: [
    { id: 'coffee', label: 'Coffee' }, { id: 'cooking', label: 'Cooking' },
    { id: 'restaurants', label: 'Trying new restaurants', aliases: ['restaurants', 'foodie'] }, { id: 'wine', label: 'Wine' },
  ]},
  { category: 'Lifestyle',       items: [
    { id: 'travel', label: 'Travel' }, { id: 'pets', label: 'Pets' },
    { id: 'wellness', label: 'Wellness' }, { id: 'volunteering', label: 'Volunteering' },
  ]},
  { category: 'Ideas',           items: [
    { id: 'ai', label: 'AI' }, { id: 'psychology', label: 'Psychology' },
    { id: 'philosophy', label: 'Philosophy' }, { id: 'startups', label: 'Startups' },
  ]},
]
// Flat list of every interest tag.
export const INTERESTS = INTEREST_GROUPS.flatMap(g => g.items.map(i => ({ ...i, category: g.category })))

// ── Activities ("things I'd be up for") ──
export const ACTIVITIES = [
  { id: 'grab-coffee',      label: 'Grab coffee' },
  { id: 'try-a-restaurant', label: 'Try a restaurant' },
  { id: 'attend-an-event',  label: 'Attend an event' },
  { id: 'play-a-sport',     label: 'Play a sport' },
  { id: 'join-a-class',     label: 'Join a class' },
  { id: 'study-together',   label: 'Study together' },
  { id: 'build-something',  label: 'Build something' },
  { id: 'explore-toronto',  label: 'Explore Toronto' },
]

// ── Helping / connection preferences (interaction formats — NOT expertise) ──
export const HELPING_PREFS = [
  { id: 'quick-advice',      label: 'Quick advice',             aliases: ['advice'] },
  { id: 'coffee-chat',       label: 'Coffee chat',              aliases: ['coffee'] },
  { id: 'make-an-intro',     label: 'Make an introduction',     aliases: ['intro', 'introduction'] },
  { id: 'review-a-resume',   label: 'Review a résumé',          aliases: ['resume review', 'résumé review', 'resume'] },
  { id: 'review-a-pitch',    label: 'Review a pitch',           aliases: ['pitch review'] },
  { id: 'mock-interview',    label: 'Mock interview',           aliases: [] },
  { id: 'study-together',    label: 'Study together',           aliases: ['study group'] },
  { id: 'collaborate',       label: 'Collaborate on a project', aliases: ['collaboration', 'collaborate'] },
  { id: 'mentorship',        label: 'Mentorship',               aliases: ['mentor'] },
  { id: 'referral',          label: 'Referral — only when I know the person well', aliases: ['referral'] },
]

// ── Structured selects ──
export const PROGRAMS = [
  { id: 'ft-mba',  label: 'Full-Time MBA' },
  { id: 'mm-mba',  label: 'Morning MBA' },
  { id: 'e-mba',   label: 'Executive MBA' },
  { id: 'mma',     label: 'MMA' },
  { id: 'mfin',    label: 'MFin' },
  { id: 'other',   label: 'Other' },
]
export const CAREER_STAGES = [
  { id: 'pre-mba',      label: 'Pre-MBA' },
  { id: 'student',      label: 'Current student' },
  { id: 'recent-grad',  label: 'Recent grad (0–3 yrs experience)' },
  { id: 'experienced',  label: 'Experienced professional (3+ yrs)' },
]
// Graduation years — a rolling window is built in the UI; kept here for reference.
export const GRAD_YEAR_MIN = 2020

// ── Lookups ──
export const topicIndex    = index(TOPICS)
export const industryIndex = index(INDUSTRIES)
export const interestIndex = index(INTERESTS)
export const activityIndex = index(ACTIVITIES)
export const helpingIndex  = index(HELPING_PREFS)

export const labelForTopic    = (id) => topicIndex.byId.get(id)?.label || id
export const labelForIndustry = (id) => industryIndex.byId.get(id)?.label || id
export const labelForInterest = (id) => interestIndex.byId.get(id)?.label || id
export const labelForActivity = (id) => activityIndex.byId.get(id)?.label || id
export const labelForHelping  = (id) => helpingIndex.byId.get(id)?.label || id

// ── Legacy migration maps ─────────────────────────────────────────────────
// The old profile used ONE list (HELP_TYPES) for both "can help with" and
// "skills to learn": Referral, Coffee Chat, Resume Review, Mock Interview,
// Intro, Study Group, Advice. Every one of those is an interaction FORMAT, so
// they migrate into helping_preferences — not into expertise. That is why the
// new expertise/help-wanted fields legitimately start empty for legacy users
// (they never captured real topics), and we prompt them to add topics via the
// one-time "Review your updated profile" state.
export const LEGACY_HELPTYPE_TO_HELPING = {
  'Referral': 'referral',
  'Coffee Chat': 'coffee-chat',
  'Resume Review': 'review-a-resume',
  'Mock Interview': 'mock-interview',
  'Intro': 'make-an-intro',
  'Study Group': 'study-together',
  'Advice': 'quick-advice',
}
// Legacy industry labels → canonical industry id (uses alias resolver).
export const resolveLegacyIndustry = (label) => industryIndex.resolve(label)
// Legacy networking_intent ids are kept on the row as-is (not remapped here).

// Sanitize a user-submitted custom tag before queueing it for review.
export function sanitizeCustomTag(raw) {
  return String(raw || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}
