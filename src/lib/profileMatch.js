// ─────────────────────────────────────────────────────────────────────────
// Peer-to-peer profile matching for the redesign.
//
// Produces EXPLAINABLE evidence, not a self-graded compatibility percentage.
// Professional fit is the primary eligibility/ranking signal; personal spark
// breaks ties and makes the intro easier. The numeric `score` is INTERNAL only
// (ranking) and must never be shown to users.
//
// Pure functions over the v3 profile shape (arrays of canonical ids):
//   { name, initials, professionalHeadline, program, location,
//     expertiseOffered[], helpWanted[], industriesKnown[], industriesExploring[],
//     personalInterests[], activities[], helpingPreferences[] }
// ─────────────────────────────────────────────────────────────────────────
import { labelForTopic, labelForInterest, labelForActivity, labelForIndustry } from '../data/profileTaxonomy'

const arr = (x) => Array.isArray(x) ? x : []
const inter = (a, b) => { const s = new Set(arr(b)); return arr(a).filter(v => s.has(v)) }
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'they'
const label = (id, fn) => id.startsWith('custom:') ? id.slice(7) : fn(id)

// Emoji for a few common interests/activities so spark rows read warmly.
const EMOJI = {
  volleyball: '🏐', yoga: '🧘', running: '🏃', hiking: '🥾', climbing: '🧗', cycling: '🚴',
  'stand-up-comedy': '🎤', music: '🎵', photography: '📷', writing: '✍️',
  anime: '🌸', gaming: '🎮', film: '🎬', books: '📚', 'japanese-culture': '🎌',
  coffee: '☕', cooking: '🍳', restaurants: '🍜', wine: '🍷',
  travel: '✈️', pets: '🐾', wellness: '🌿', volunteering: '🤝',
  ai: '🤖', psychology: '🧠', philosophy: '💭', startups: '🚀',
}
const emojiFor = (id) => EMOJI[id] || '•'

// ── Score a viewer↔candidate pair (internal ranking only) ──────────────────
export function scorePair(viewer, candidate) {
  const youHelpThem = inter(viewer.expertiseOffered, candidate.helpWanted)   // my expertise meets their goal
  const theyHelpYou = inter(candidate.expertiseOffered, viewer.helpWanted)   // their expertise meets my goal
  const reciprocal = youHelpThem.length > 0 && theyHelpYou.length > 0

  const bridges = dedupe([
    ...inter(viewer.industriesKnown, candidate.industriesExploring),
    ...inter(candidate.industriesKnown, viewer.industriesExploring),
  ])
  const sharedInterests = inter(viewer.personalInterests, candidate.personalInterests)
  const sharedActivities = inter(viewer.activities, candidate.activities)
  const bothOpenToCoffee =
    (arr(viewer.helpingPreferences).includes('coffee-chat') && arr(candidate.helpingPreferences).includes('coffee-chat')) ||
    (arr(viewer.activities).includes('grab-coffee') && arr(candidate.activities).includes('grab-coffee'))
  const interactionCompatible = bothOpenToCoffee ||
    inter(viewer.helpingPreferences, candidate.helpingPreferences).length > 0

  // Internal score — the exact weighting from the spec. Never rendered.
  const directional = youHelpThem.length + theyHelpYou.length
  const score =
    Math.min(directional * 4, 8) +
    (reciprocal ? 3 : 0) +
    Math.min(bridges.length * 2, 4) +
    Math.min(sharedInterests.length * 1, 3) +
    Math.min(sharedActivities.length * 1, 2) +
    (interactionCompatible ? 1 : 0)

  return {
    score, reciprocal,
    youHelpThem, theyHelpYou, bridges,
    sharedInterests, sharedActivities, bothOpenToCoffee,
    hasProfessional: directional > 0 || bridges.length > 0,
    hasSpark: sharedInterests.length > 0 || sharedActivities.length > 0 || bothOpenToCoffee,
  }
}

// ── Build the user-facing explanation (labels resolved, nothing invented) ──
export function buildExplanation(viewer, candidate) {
  const s = scorePair(viewer, candidate)
  const otherName = firstName(candidate.name)
  const youName = firstName(viewer.name)

  const professional = (s.youHelpThem.length || s.theyHelpYou.length) ? {
    youHelpThem: s.youHelpThem.map(id => label(id, labelForTopic)),
    theyHelpYou: s.theyHelpYou.map(id => label(id, labelForTopic)),
  } : null

  const spark = []
  for (const id of s.sharedInterests) {
    spark.push({ emoji: emojiFor(id), title: `You both like ${label(id, labelForInterest).toLowerCase()}` })
  }
  for (const id of s.sharedActivities) {
    if (id === 'grab-coffee') continue // covered by the coffee row below
    spark.push({ emoji: emojiFor(id) === '•' ? '🤝' : emojiFor(id), title: `You're both up for ${label(id, labelForActivity).toLowerCase()}` })
  }
  if (s.bothOpenToCoffee) {
    spark.push({ emoji: '☕', title: "You're both open to coffee", note: 'A low-pressure way to start the conversation.' })
  }

  // Headline — grounded in what actually exists.
  let headline
  if (s.reciprocal && s.hasSpark) headline = 'A useful connection — with an easy conversation starter.'
  else if (s.reciprocal)          headline = 'A genuinely two-way connection worth making.'
  else if (professional)          headline = 'A useful connection worth making.'
  else if (s.hasSpark)            headline = 'You would probably enjoy talking.'
  else                            headline = 'A fellow Rotman peer to meet.'

  const opener = buildOpener({ viewer, candidate, s, otherName })

  return {
    viewer: { name: youName, initials: initials(viewer) },
    other:  { name: otherName, initials: initials(candidate) },
    headline,
    professional,
    spark,
    opener,
    _score: s.score, // internal, for ranking; do not render
  }
}

// A grounded opener built only from visible data (never fabricated claims).
// Mirrors the approved demo: reference THEIR expertise, offer to trade MINE.
function buildOpener({ s, otherName }) {
  const iOffer = s.youHelpThem[0]     // a topic I can help them with
  const theirs = s.theyHelpYou[0]     // a topic they can help me with
  const coffee = s.bothOpenToCoffee ? ' — maybe over coffee?' : '?'
  if (theirs && iOffer) {
    return `${otherName}, I saw you're deep in ${label(theirs, labelForTopic).toLowerCase()}. I'd love to trade what I know about ${label(iOffer, labelForTopic).toLowerCase()} for your perspective${coffee}`
  }
  if (iOffer) {
    return `${otherName}, happy to share anything on ${label(iOffer, labelForTopic).toLowerCase()} if it's useful${coffee}`
  }
  if (theirs) {
    return `${otherName}, I'd really value your take on ${label(theirs, labelForTopic).toLowerCase()}${coffee}`
  }
  if (s.sharedInterests.length) {
    return `${otherName}, noticed we both like ${label(s.sharedInterests[0], labelForInterest).toLowerCase()} — would be great to connect${coffee}`
  }
  return `${otherName}, would be great to connect${coffee}`
}

// ── helpers ──
function dedupe(a) { return [...new Set(a)] }
function initials(p) {
  if (p.initials) return p.initials
  return String(p.name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
