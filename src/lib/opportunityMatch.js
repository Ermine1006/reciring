// Rule-based opportunity matcher for the Event Recap.
//
// "Why this connection may matter" surfaces a one-line rationale
// derived from the encountered user's Mutu activity + the viewer's
// own profile signals. No ML here — a small ranked-rule engine that
// looks at:
//
//   • Their active posts' need_text / offer_text (from src/lib/posts)
//   • Their profile: can_help_with, skills_to_learn, industry_interests
//   • Viewer's profile: same fields, symmetrically
//
// Each rule returns a { reason, score } tuple; the caller picks the
// highest-scored non-empty rationale. A "no obvious match" case is
// fine — we return null and the UI hides the section.

// ── Helpers ──────────────────────────────────────────────────

// Case-insensitive intersection of two string arrays.
function overlap(a = [], b = []) {
  const setB = new Set((b || []).map(x => String(x || '').toLowerCase()))
  return (a || []).filter(x => setB.has(String(x || '').toLowerCase()))
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'They'
}

// ── Rules ─────────────────────────────────────────────────────

const RULES = [
  // 1. STRONG: their active need matches something I can help with.
  //    "Sarah is looking for a technical co-founder, and you offered
  //     startup recruiting support."
  ({ them, themPosts, meProfile }) => {
    const theirNeeds = (themPosts || []).map(p => (p.need_text || '').trim()).filter(Boolean)
    if (theirNeeds.length === 0) return null
    const iCanHelp = (meProfile?.can_help_with || [])
    if (iCanHelp.length === 0) return { reason: `${firstName(them.name)} is looking for: ${theirNeeds[0].slice(0, 80)}${theirNeeds[0].length > 80 ? '…' : ''}`, score: 5 }
    // Look for a can_help_with keyword mentioned in a need_text.
    const matched = iCanHelp.find(kw =>
      theirNeeds.some(n => new RegExp(`\\b${escapeReg(kw)}\\b`, 'i').test(n))
    )
    if (matched) {
      return {
        reason: `${firstName(them.name)} is looking for ${matched.toLowerCase()}, and you can help with it.`,
        score: 12,
      }
    }
    return { reason: `${firstName(them.name)} is looking for: ${theirNeeds[0].slice(0, 80)}${theirNeeds[0].length > 80 ? '…' : ''}`, score: 4 }
  },

  // 2. STRONG (reverse): I want to learn X and they can help with X.
  ({ them, themProfile, meProfile }) => {
    const theyHelpWith = themProfile?.can_help_with || []
    const iWantToLearn = meProfile?.skills_to_learn || []
    const shared = overlap(iWantToLearn, theyHelpWith)
    if (shared.length === 0) return null
    return {
      reason: `${firstName(them.name)} can help with ${shared[0].toLowerCase()} — something you want to learn.`,
      score: 10,
    }
  },

  // 3. MEDIUM: their active offer matches something I want to learn.
  ({ them, themPosts, meProfile }) => {
    const theirOffers = (themPosts || []).map(p => (p.offer_text || '').trim()).filter(Boolean)
    if (theirOffers.length === 0) return null
    const iWantToLearn = meProfile?.skills_to_learn || []
    if (iWantToLearn.length === 0) return null
    const matched = iWantToLearn.find(kw =>
      theirOffers.some(o => new RegExp(`\\b${escapeReg(kw)}\\b`, 'i').test(o))
    )
    if (matched) {
      return {
        reason: `${firstName(them.name)} offers ${matched.toLowerCase()} — something you want to learn.`,
        score: 8,
      }
    }
    return null
  },

  // 4. MEDIUM: shared industry interests → warm context for follow-up.
  ({ them, themProfile, meProfile }) => {
    const shared = overlap(
      themProfile?.industry_interests || [],
      meProfile?.industry_interests || []
    )
    if (shared.length === 0) return null
    return {
      reason: `You both work in ${shared[0]}.`,
      score: 3,
    }
  },

  // 5. WEAK: they have any active post — surface it as generic recall.
  ({ them, themPosts }) => {
    if (!themPosts || themPosts.length === 0) return null
    const p = themPosts[0]
    return {
      reason: `${firstName(them.name)} recently posted about ${(p.need_text || p.offer_text || '').slice(0, 60)}…`,
      score: 1,
    }
  },
]

function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/**
 * Given the encountered user's profile + their active posts + my
 * profile, return the single highest-scored rationale — or null if
 * no rule fires.
 */
export function whyThisConnectionMayMatter({ them, themProfile, themPosts, meProfile }) {
  if (!them) return null
  const ctx = { them, themProfile: themProfile || them, themPosts: themPosts || [], meProfile: meProfile || {} }
  let best = null
  for (const rule of RULES) {
    const hit = rule(ctx)
    if (hit && (!best || hit.score > best.score)) best = hit
  }
  return best ? best.reason : null
}

/**
 * Rank a list of encountered-user summaries by "connection value".
 * Higher = the recap should nudge the user to follow up first.
 * Used by EventRecapPage to sort the "potential collaborators"
 * subsection above the general people-met list.
 */
export function rankByConnectionValue(list, meProfile) {
  return [...list].sort((a, b) => {
    const scoreA = valueScore(a, meProfile)
    const scoreB = valueScore(b, meProfile)
    return scoreB - scoreA
  })
}

function valueScore(entry, meProfile) {
  let s = 0
  for (const rule of RULES) {
    const hit = rule({
      them: entry.them,
      themProfile: entry.themProfile || entry.them,
      themPosts: entry.themPosts || [],
      meProfile: meProfile || {},
    })
    if (hit && hit.score > s) s = hit.score
  }
  return s
}
