// ── Shared Token: reveal eligibility and relationship progress ────
// The database creates the Token. This module only decides whether a
// real one may be shown, and describes it. Nothing here mints,
// verifies, or counts anything the server has not already decided.
//
// Every function is pure so the rules can be proven in tests without
// a DOM or a database.

/** The reveal contract version. Bumped only if the flow changes. */
export const REVEAL_VERSION = 1

const VERIFIED = 'verified'
const DISPUTED = 'disputed'

/**
 * The Token that belongs to a session, or null.
 *
 * `session_id` is UNIQUE on practice_exchange_tokens, so at most one
 * can ever match. A Discover token (source 'discover') carries no
 * session and can never be returned here.
 */
export function tokenForSession(tokens = [], sessionId) {
  if (!sessionId) return null
  return (tokens || []).find(
    (t) => t && t.session_id === sessionId && (t.source || 'practice') === 'practice'
  ) || null
}

/**
 * What the interface may show for one session.
 *
 *   'none'          nothing happened that the server has verified
 *   'pending'       one side confirmed; the server has not verified
 *   'disputed'      the two confirmations disagreed; no Token exists
 *   'unavailable'   server says verified, but no Token can be read
 *   'ready'         server says verified AND a real Token was read
 *
 * Only 'ready' may reveal a Token, and only with the Token the server
 * actually returned. Finishing a guide, a timer running out, opening
 * a meeting link, or a single confirmation can never reach it,
 * because none of them set session.status to 'verified'.
 */
export function revealState({ session, tokens = [], userId } = {}) {
  if (!session || !userId) return 'none'
  const participant = [session.participant_a_user_id, session.participant_b_user_id].includes(userId)
  if (!participant) return 'none'
  if (session.status === DISPUTED) return 'disputed'
  if (session.status === 'completed_pending_confirmation') return 'pending'
  if (session.status !== VERIFIED) return 'none'
  return tokenForSession(tokens, session.id) ? 'ready' : 'unavailable'
}

/** The local acknowledgement key: per user, per Token, per version. */
export function revealKey(userId, tokenId) {
  if (!userId || !tokenId) return null
  return `mutu_token_reveal:${REVEAL_VERSION}:${userId}:${tokenId}`
}

/**
 * Whether this user has already seen this Token's reveal.
 *
 * Purely a UI convenience: it decides whether the animation plays,
 * and nothing else. It is per user and per device, so the two
 * participants never share or influence each other's state, and it
 * can never stand in for verification.
 */
export function hasAcknowledged(userId, tokenId, storage) {
  const key = revealKey(userId, tokenId)
  if (!key) return false
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
    return Boolean(store && store.getItem(key))
  } catch { return false }
}

export function acknowledgeReveal(userId, tokenId, how = 'viewed', storage, now) {
  const key = revealKey(userId, tokenId)
  if (!key) return false
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
    if (!store) return false
    store.setItem(key, JSON.stringify({ how, at: (now || new Date()).toISOString() }))
    return true
  } catch { return false }
}

/**
 * Everything the Token detail may show, drawn only from the Token row
 * and its session. Deliberately never touches confirmations, private
 * feedback, meeting links or cancellation reasons.
 */
export function describeToken({ token, session, partnerName, partnerUnlocked = false } = {}) {
  if (!token) return null
  return {
    id: token.id,
    verifiedAt: token.verified_at || null,
    sessionMode: session?.session_mode || null,
    category: session?.interview_category || null,
    skillFocus: session?.skill_focus || null,
    // identity follows the existing unlock rules; a locked partner
    // stays anonymous even inside a Token they genuinely share
    partner: partnerUnlocked ? (partnerName || null) : null,
    partnerUnlocked,
  }
}

const LEVELS = [
  { min: 3, id: 'regular', label: 'Regular practice partners' },
  { min: 2, id: 'practised', label: 'Practised together' },
  { min: 1, id: 'new', label: 'New practice connection' },
]

/**
 * Pairwise progress, taken from practice_relationship_edges — a
 * server-side view that counts real Tokens and self-scopes to the
 * caller. Nothing is derived from local reveal state, and no
 * closeness or skill is implied: the count is exactly the number of
 * verified exchanges the two people completed.
 */
export function relationshipProgress({ edges = [], userId, partnerId, communityId = null } = {}) {
  if (!userId || !partnerId) return null
  const lo = userId < partnerId ? userId : partnerId
  const hi = userId < partnerId ? partnerId : userId
  const edge = (edges || []).find((e) => e
    && e.user_lo === lo && e.user_hi === hi
    && (!communityId || e.community_id === communityId))
  if (!edge) return null
  const count = edge.verified_exchange_count || 0
  if (count < 1) return null
  const level = LEVELS.find((l) => count >= l.min) || LEVELS[LEVELS.length - 1]
  return {
    count,
    level: level.id,
    levelLabel: level.label,
    lastVerifiedAt: edge.last_verified_at || null,
    firstVerifiedAt: edge.first_verified_at || null,
    // the plain fact, always available even when a label would not be
    fact: `You have completed ${count} verified practice${count === 1 ? '' : 's'} together.`,
  }
}

/**
 * Tokens for the Passport list: practice Tokens whose session the
 * Passport already counts, newest first. Sharing the eligible-session
 * set with computePassport is what keeps the two from disagreeing.
 */
export function passportTokens({ tokens = [], sessionById = {}, eligibleSessionIds } = {}) {
  const eligible = eligibleSessionIds instanceof Set
    ? eligibleSessionIds
    : new Set(eligibleSessionIds || [])
  return (tokens || [])
    .filter((t) => t && t.session_id && (t.source || 'practice') === 'practice')
    .filter((t) => eligible.size === 0 || eligible.has(t.session_id))
    .map((t) => ({ token: t, session: sessionById[t.session_id] || null }))
    .sort((a, b) => String(b.token.verified_at || '').localeCompare(String(a.token.verified_at || '')))
}
