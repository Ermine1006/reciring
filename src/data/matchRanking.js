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

// ── Default viewer profile (fallback when no auth) ───────────────
export const DEFAULT_VIEWER_PROFILE = {
  strengths:  ['Consulting', 'Referral', 'Coffee Chat', 'Resume Review', 'Intro'],
  industries: ['Consulting', 'Investment Banking'],
}

// ── Helpers ───────────────────────────────────────────────────────

function fuzzyMatch(a, b) {
  const an = normalizeIndustry(a).toLowerCase()
  const bn = normalizeIndustry(b).toLowerCase()
  return an.includes(bn) || bn.includes(an)
}

// ── Scoring components ───────────────────────────────────────────

function relevanceScore(request, viewer) {
  // 1) Tag overlap (0–24): request tags vs viewer's strengths
  const tags = request.tags || []
  const tagHits = tags.filter(t => viewer.strengths.some(s => fuzzyMatch(t, s))).length
  const tagScore = tags.length > 0 ? (tagHits / tags.length) * 24 : 8

  // 2) Industry overlap (0–16): request topics vs viewer's industries
  const topicSignals = [...tags, request.category || ''].filter(Boolean)
  const indHits = viewer.industries.filter(ind =>
    topicSignals.some(sig => fuzzyMatch(sig, ind))
  ).length
  const indScore = viewer.industries.length > 0 ? (indHits / viewer.industries.length) * 16 : 4

  return Math.round(tagScore + indScore)
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

  // Relevance: which of the viewer's strengths match the request?
  const tags = request.tags || []
  const matchedTags = tags.filter(t => viewer.strengths.some(s => fuzzyMatch(t, s)))
  if (matchedTags.length > 0) {
    const tagStr = matchedTags.slice(0, 2).join(' + ').toLowerCase()
    parts.push(`Strong fit: ${tagStr}`)
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

export function rankRequests(requests, viewer = DEFAULT_VIEWER_PROFILE) {
  return [...requests]
    .map(r => ({ ...r, _score: getMatchScore(r, viewer), _reason: getMatchReason(r, viewer) }))
    .sort((a, b) => b._score.total - a._score.total)
}
