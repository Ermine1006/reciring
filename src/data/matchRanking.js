// ── Match ranking utility ──────────────────────────────────────────
//
// Scores each request from the VIEWER's perspective:
//   "How relevant is this request to ME, and how trustworthy is the poster?"
//
// Score breakdown (0–100):
//   Relevance:        0–50  (viewer strengths vs request needs/tags + viewer industry vs request topic)
//   Poster trust:     0–30  (poster's completion rate — surface reliable people first)
//   Poster activity:  0–15  (poster's contribution points — light signal of engagement)
//   Urgency fit:      0–5   (boost for time-sensitive requests)
//
// Viewer reliability/activity are constant across all cards so they
// don't affect relative ordering — they're intentionally excluded.

import { normalizeIndustry } from './requestOptions'

// ── Default viewer profile (fallback when no auth) ───────────────
// In production the real profile is passed from AuthContext.
// Uses canonical labels from requestOptions.js.
export const DEFAULT_VIEWER_PROFILE = {
  strengths:  ['Consulting', 'Referral', 'Coffee Chat', 'Resume Review', 'Intro'],
  industries: ['Consulting', 'Investment Banking'],
}

// ── Helpers ───────────────────────────────────────────────────────

function fuzzyMatch(a, b) {
  // Normalize both sides so 'IB' matches 'Investment Banking', etc.
  const an = normalizeIndustry(a).toLowerCase()
  const bn = normalizeIndustry(b).toLowerCase()
  return an.includes(bn) || bn.includes(an)
}

// ── Scoring ───────────────────────────────────────────────────────

function relevanceScore(request, viewer) {
  // 1) Tag overlap: do the request's tags match what the viewer can help with?
  //    e.g. request tags ['Consulting', 'Coffee Chat'] vs viewer strengths ['Consulting', 'Referral', 'Coffee Chat']
  const tags = request.tags || []
  const tagHits = tags.filter(t => viewer.strengths.some(s => fuzzyMatch(t, s))).length
  const tagScore = tags.length > 0 ? (tagHits / tags.length) * 30 : 10 // 0–30

  // 2) Industry overlap: does the request's topic/category relate to the viewer's industry background?
  //    We check both the request tags AND the request category against the viewer's industries.
  //    This answers: "Is this request in a domain I know?"
  const topicSignals = [...tags, request.category || ''].filter(Boolean)
  const indHits = viewer.industries.filter(ind =>
    topicSignals.some(sig => fuzzyMatch(sig, ind))
  ).length
  const indScore = viewer.industries.length > 0 ? (indHits / viewer.industries.length) * 20 : 5 // 0–20

  return Math.round(tagScore + indScore)
}

function posterTrustScore(request) {
  const p = request.poster
  if (!p || !p.scheduled || p.scheduled === 0) return 15 // neutral — don't penalize new users
  const rate = p.completed / p.scheduled
  return Math.round(rate * 30) // 0–30
}

function posterActivityScore(request) {
  const points = request.poster?.points || 0
  // Cap at 300 pts = full 15 points. Prevents popularity from dominating.
  return Math.round(Math.min(points / 300, 1) * 15)
}

function urgencyBonus(request) {
  if (request.urgency === 'urgent') return 5
  if (request.urgency === 'soon')   return 3
  return 0
}

export function getMatchScore(request, viewer = DEFAULT_VIEWER_PROFILE) {
  const relevance = relevanceScore(request, viewer)
  const trust     = posterTrustScore(request)
  const activity  = posterActivityScore(request)
  const urgency   = urgencyBonus(request)
  return { total: relevance + trust + activity + urgency, relevance, trust, activity, urgency }
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

  // Poster trust
  const p = request.poster
  if (p?.scheduled && p.scheduled >= 3) {
    const rate = Math.round((p.completed / p.scheduled) * 100)
    if (rate > 90) parts.push(`highly reliable (${rate}%)`)
    else if (rate > 80) parts.push(`reliable peer (${rate}%)`)
  }

  // Poster activity (only if we need a second reason)
  if (p?.points >= 200 && parts.length < 2) {
    parts.push('active contributor')
  }

  // Urgency (only if we need a second reason)
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
