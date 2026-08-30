// ── Reputation from verified behaviour only (pure, testable) ─────
// No generic score. Every number here derives from observable,
// verified data the viewer is allowed to read — currently the
// CURRENT USER's own tokens/sessions/edges (RLS self-scoped).
// Another member's reputation on an anonymous card needs server-side
// aggregates (deferred backend requirement) — never fake it.
//
// All inputs are already community-scoped rows; pass a communityId to
// scope further. Rotman numbers never mix with a future community.

// Minimum confirmed sessions before a follow-through % may be shown —
// a 100% based on one session is misleading, so it stays hidden.
export const FOLLOW_THROUGH_MIN_SAMPLE = 5

// Transparent badge criteria (verified data only, no popularity).
export const BADGES = [
  { id: 'first_exchange',  label: 'First Session',         target: 1, metric: 'verifiedCount',
    desc: 'Complete 1 verified session' },
  { id: 'reliable',        label: 'Reliable Partner',      target: 5, metric: 'verifiedCount',
    needsFollowThrough: 0.8,
    desc: 'Complete 5 sessions with strong follow-through' },
  { id: 'contributor',     label: 'Community Contributor', target: 5, metric: 'uniquePartners',
    desc: 'Help 5 unique people' },
  { id: 'collaborator',    label: 'Trusted Collaborator',  target: 3, metric: 'repeatPartners',
    desc: 'Practise again with 3 partners' },
]

/**
 * Compute the current user's reputation for ONE community.
 *
 * tokens:   practice_exchange_tokens rows (mine, RLS-scoped)
 * sessions: practice_sessions rows (mine)
 * myUserId, communityId
 *
 * Follow-through = verified sessions ÷ sessions that reached a
 * confirmed scheduled time (confirmed_at set). Cancellations after
 * confirming count against it; invitations/browsing never count.
 */
export function computeReputation({ tokens = [], sessions = [], myUserId, communityId = null }) {
  const inComm = (r) => !communityId || r.community_id === communityId
  const myTokens = tokens.filter(inComm)
  const mySessions = sessions.filter(inComm)

  const verifiedCount = myTokens.length

  const partnerCounts = {}
  for (const t of myTokens) {
    const peer = t.user_lo === myUserId ? t.user_hi : t.user_lo
    partnerCounts[peer] = (partnerCounts[peer] || 0) + 1
  }
  const uniquePartners = Object.keys(partnerCounts).length
  const repeatPartners = Object.values(partnerCounts).filter((n) => n > 1).length

  // Sessions that reached a mutually confirmed time.
  const confirmed = mySessions.filter((s) => s.confirmed_at)
  const completedOfConfirmed = confirmed.filter((s) => s.status === 'verified')
  const followThroughSample = confirmed.filter((s) =>
    ['verified', 'cancelled', 'no_show', 'disputed', 'completed_pending_confirmation'].includes(s.status)
  ).length
  const followThrough = followThroughSample >= FOLLOW_THROUGH_MIN_SAMPLE
    ? completedOfConfirmed.length / followThroughSample
    : null                                            // insufficient sample → show nothing

  const stats = { verifiedCount, uniquePartners, repeatPartners, followThrough }

  const badges = BADGES.map((b) => {
    const value = stats[b.metric] || 0
    const ftOk = b.needsFollowThrough == null
      || (followThrough != null && followThrough >= b.needsFollowThrough)
    return {
      ...b,
      value,
      earned: value >= b.target && ftOk,
      progress: Math.min(1, value / b.target),
    }
  })

  return {
    ...stats,
    followThroughSample,
    badges,
    label: reputationLabel(stats),
    nextBadge: badges.find((b) => !b.earned) || null,
  }
}

/** Human label from verified behaviour — never from popularity. */
export function reputationLabel({ verifiedCount, uniquePartners, followThrough }) {
  if (verifiedCount === 0) return 'New to Together'
  if (verifiedCount >= 5 && (followThrough == null || followThrough >= 0.8)) {
    return 'Reliable contributor'
  }
  if (uniquePartners >= 3) return 'Community contributor'
  return 'Contributor'
}

/** "92%" or null when the sample is too small to be honest. */
export function formatFollowThrough(followThrough) {
  if (followThrough == null) return null
  return `${Math.round(followThrough * 100)}%`
}
