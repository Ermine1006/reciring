// ── Match ranking utility ──────────────────────────────────────────
//
// Scores each request from the VIEWER's perspective.
//
// Redesigned formula (0–100) to reward reciprocity and prevent gaming:
//
//   Relevance:     0–40  (viewer strengths vs request tags + industry overlap)
//   Reciprocity:   0–30  (balance between giving and receiving help)
//   Freshness:     0–20  (newer posts surface higher — prevents stale feed)
//   Urgency:       0–10  (boost for time-sensitive requests)
//
// Why this replaces the old formula:
//   - Old "poster trust" (completion rate) punished busy users and was easy to game
//   - Old "poster activity" (raw points) created winner-takes-all feedback loops
//   - Reciprocity rewards balanced users — pure takers get deprioritized
//   - Freshness prevents early adopters from permanently dominating the feed

import { normalizeIndustry } from './requestOptions'

// ── Default viewer profile (fallback when signed out / empty) ────
// `strengths` = help I can give (can_help_with), `learn` = help I want
// (skills_to_learn), `industries` = industry_interests. Kept light so a
// signed-out viewer gets a neutral, non-biased feed.
export const DEFAULT_VIEWER_PROFILE = {
  strengths:  ['Coffee Chat', 'Intro'],
  learn:      [],
  industries: [],
}

// ── Helpers ───────────────────────────────────────────────────────

function fuzzyMatch(a, b) {
  const an = normalizeIndustry(a).toLowerCase()
  const bn = normalizeIndustry(b).toLowerCase()
  return an.includes(bn) || bn.includes(an)
}

// ── Scoring components ───────────────────────────────────────────

function relevanceScore(request, viewer) {
  // Relevance is BIDIRECTIONAL — a good match is one where either side can help
  // the other, which is the whole point of a reciprocity network:
  //   forward  — I can help with what they need   (my offers  vs their tags)
  //   reverse  — they can help me / I want to learn it (my goals vs their offer)
  //   industry — we share an industry focus
  const tags = request.tags || []
  const topicSignals = [...tags, request.category || ''].filter(Boolean)
  const strengths  = viewer.strengths  || []
  const learn      = viewer.learn      || []
  const industries = viewer.industries || []

  // Forward (0–16): my strengths vs their tags/needs.
  const fwdHits = tags.filter(t => strengths.some(s => fuzzyMatch(t, s))).length
  const fwdScore = tags.length > 0 && strengths.length > 0 ? (fwdHits / tags.length) * 16 : 0

  // Reverse (0–14): my learning goals vs what they OFFER (free-text offer +
  // topical tags). Surfaces people who can help me, not just people I can help.
  const offerText = String(request.offers || request.offer_text || '').toLowerCase()
  const revHits = learn.filter(l =>
    (offerText && offerText.includes(String(l).toLowerCase())) ||
    topicSignals.some(sig => fuzzyMatch(sig, l))
  ).length
  const revScore = learn.length > 0 ? (revHits / learn.length) * 14 : 0

  // Industry overlap (0–10).
  const indHits = industries.filter(ind => topicSignals.some(sig => fuzzyMatch(sig, ind))).length
  const indScore = industries.length > 0 ? (indHits / industries.length) * 10 : 0

  // Neutral floor so a non-overlapping post isn't zeroed out for thin profiles.
  const raw = fwdScore + revScore + indScore
  return Math.round(raw > 0 ? raw : 8)
}

function reciprocityScore(request) {
  // Measures how balanced the poster is between giving and receiving.
  //
  // given    = meetings completed as helper (helped others)
  // received = matches where they were the requester (received help)
  //
  // We approximate from available stats:
  //   poster.completed = total meetings completed (both roles)
  //   poster.scheduled = total meetings scheduled (both roles)
  //   poster.points    = total contribution points (weighted toward helping)
  //
  // Reciprocity ratio: min(given, received) / max(given, received)
  //   - 1.0 = perfect balance → 30 pts
  //   - 0.0 = pure taker or pure giver → 0 pts
  //   - New user (no data) → 15 pts (neutral)
  const p = request.poster
  if (!p) return 15

  const given    = p.completed || 0   // times they followed through
  const received = p.scheduled || 0   // times they scheduled (asked for help)

  // New user: no data → neutral
  if (given === 0 && received === 0) return 15

  // Edge case: only given, never received (pure giver) — still good, slight penalty
  if (received === 0) return Math.min(given * 3, 25)

  // Edge case: only received, never given (pure taker) — low score
  if (given === 0) return Math.max(5 - received, 0)

  const ratio = Math.min(given, received) / Math.max(given, received)
  return Math.round(ratio * 30)
}

function freshnessScore(request) {
  // Newer posts get a boost. Posts older than 7 days get 0.
  // This prevents the feed from being dominated by stale posts
  // from early adopters who accumulated high scores.
  const createdStr = request.createdAtRaw || request.created_at
  if (!createdStr) return 10 // no timestamp → neutral

  const ageMs = Date.now() - new Date(createdStr).getTime()
  const ageHours = ageMs / (1000 * 60 * 60)

  if (ageHours < 1)   return 20   // just posted
  if (ageHours < 6)   return 17
  if (ageHours < 24)  return 14
  if (ageHours < 48)  return 10
  if (ageHours < 72)  return 7
  if (ageHours < 168) return 4    // up to 7 days
  return 0                        // older than a week
}

function urgencyBonus(request) {
  if (request.urgency === 'urgent') return 10
  if (request.urgency === 'soon')   return 5
  return 0
}

// ── Main scoring function ────────────────────────────────────────

export function getMatchScore(request, viewer = DEFAULT_VIEWER_PROFILE) {
  const relevance   = relevanceScore(request, viewer)
  const reciprocity = reciprocityScore(request)
  const freshness   = freshnessScore(request)
  const urgency     = urgencyBonus(request)
  return {
    total: relevance + reciprocity + freshness + urgency,
    relevance,
    reciprocity,
    freshness,
    urgency,
  }
}

// ── Match reason (human-readable) ─────────────────────────────────

export function getMatchReason(request, viewer = DEFAULT_VIEWER_PROFILE) {
  const parts = []

  // Relevance — name the direction: can I help them, or can they help me?
  const tags = request.tags || []
  const strengths = viewer.strengths || []
  const learn = viewer.learn || []
  const matchedTags = tags.filter(t => strengths.some(s => fuzzyMatch(t, s)))
  if (matchedTags.length > 0) {
    parts.push(`You can help: ${matchedTags.slice(0, 2).join(' + ').toLowerCase()}`)
  } else {
    const offerText = String(request.offers || request.offer_text || '').toLowerCase()
    const topicSignals = [...tags, request.category || ''].filter(Boolean)
    const matchedLearn = learn.filter(l =>
      (offerText && offerText.includes(String(l).toLowerCase())) ||
      topicSignals.some(sig => fuzzyMatch(sig, l))
    )
    if (matchedLearn.length > 0) {
      parts.push(`Matches what you want to learn: ${matchedLearn.slice(0, 2).join(' + ').toLowerCase()}`)
    }
  }

  // Reciprocity signal
  const p = request.poster
  if (p) {
    const given = p.completed || 0
    const received = p.scheduled || 0
    if (given >= 3 && received >= 2) {
      const ratio = Math.round((Math.min(given, received) / Math.max(given, received)) * 100)
      if (ratio >= 80) parts.push('active reciprocator')
      else if (ratio >= 50) parts.push('balanced contributor')
    } else if (given >= 3 && parts.length < 2) {
      parts.push('proven helper')
    }
  }

  // Freshness
  const createdStr = request.createdAtRaw || request.created_at
  if (createdStr) {
    const ageHours = (Date.now() - new Date(createdStr).getTime()) / (1000 * 60 * 60)
    if (ageHours < 2 && parts.length < 2) parts.push('just posted')
  }

  // Urgency
  if (request.urgency === 'urgent' && parts.length < 2) {
    parts.push('urgent request')
  }

  if (parts.length === 0) return 'Rotman peer'

  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  return parts.length > 1 ? `${first} · ${parts.slice(1).join(' · ')}` : first
}

// ── Filter requests by active filters ─────────────────────────────

export function filterRequests(requests, filters) {
  const { industries = [], helpTypes = [], times = [] } = filters || {}
  if (industries.length === 0 && helpTypes.length === 0 && times.length === 0) return requests

  return requests.filter(r => {
    const tags = r.tags || []
    const signals = [...tags, r.category || ''].filter(Boolean)

    const industryMatch = industries.length === 0 || industries.some(ind =>
      signals.some(s => fuzzyMatch(s, ind))
    )
    const helpMatch = helpTypes.length === 0 || helpTypes.some(ht =>
      tags.some(t => fuzzyMatch(t, ht))
    )
    const timeMatch = times.length === 0 || times.includes(r.time)
    return industryMatch && helpMatch && timeMatch
  })
}

// ── Rank a list of requests ───────────────────────────────────────
//
// Sort is two-key:
//   1. tier ascending (lower tier = higher priority)
//   2. raw match score descending (within the same tier)
//
// Tiers:
//   1  unseen           — never interacted with (highest priority)
//   2  viewed           — user opened the detail modal
//   3  swiped_left      — user explicitly skipped
//   4  unmatched        — match was previously created then unmatched
//
// Tier 4 supersedes the previous unmatch-penalty hack. If a post is
// both unmatched AND swiped_left, it lands in tier 4 (unmatched takes
// precedence — the user explicitly broke the connection).
//
// `interactionMap`: Map<postId, 'viewed' | 'swiped_left'>. Default empty.
// `unmatchedSet`:   Set<postId>. Default empty.

function computeTier(postId, interactionMap, unmatchedSet) {
  if (unmatchedSet.has(postId)) return 4
  const interaction = interactionMap.get(postId)
  if (interaction === 'swiped_left') return 3
  if (interaction === 'viewed')      return 2
  return 1
}

const TIER_REASON_PREFIX = {
  2: null,                    // viewed — no prefix, neutral signal
  3: 'Previously skipped',
  4: 'Previously unmatched',
}

export function rankRequests(
  requests,
  viewer = DEFAULT_VIEWER_PROFILE,
  unmatchedSet = new Set(),
  interactionMap = new Map(),
) {
  return [...requests]
    .map(r => {
      const rawScore = getMatchScore(r, viewer)
      const tier = computeTier(r.id, interactionMap, unmatchedSet)
      const baseReason = getMatchReason(r, viewer)
      const prefix = TIER_REASON_PREFIX[tier]
      const reason = prefix ? `${prefix} · ${baseReason}` : baseReason
      return {
        ...r,
        _score: { ...rawScore, tier },
        _reason: reason,
        _tier: tier,
      }
    })
    .sort((a, b) => {
      if (a._tier !== b._tier) return a._tier - b._tier
      return b._score.total - a._score.total
    })
}
