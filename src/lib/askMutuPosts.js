// ── The Give & Ask slice of Ask Mutu's grounding ──────────────────
//
// Ask Mutu knew who the member had met and what they had practised, but
// not what they had actually ASKED the community for. So it could not
// answer "is anyone helping with my ask?" or "should I repost?", and it
// would suggest posting something the member had already posted.
//
// Only the member's OWN posts go in. Other people's posts are a browsing
// surface, not the member's record, and pulling them in would turn a
// private assistant into a search engine over the community.

/** A post is the member's own when they created it. */
function mine(post, userId) {
  return Boolean(userId) && post?.created_by === userId
}

function isoDay(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * The member's own Give & Ask posts, newest first.
 *
 * `matchedPostIds` marks the posts somebody already connected on, which
 * is the difference between "nobody has answered yet" and "this worked,
 * go and message them". Without it the assistant cannot tell a quiet
 * post from a successful one.
 */
export function buildPostsContext({ posts = [], userId = null, matchedPostIds = [], now = new Date() } = {}) {
  const matched = new Set(matchedPostIds || [])
  const own = (posts || [])
    .filter((p) => mine(p, userId))
    .sort((a, b) => String(b.createdAtRaw || '').localeCompare(String(a.createdAtRaw || '')))
    .slice(0, 12)

  if (own.length === 0) return null

  return own.map((p) => {
    const expired = p.expiresAt ? new Date(p.expiresAt).getTime() < now.getTime() : false
    return {
      asked_for:   p.needs || null,
      offers_back: p.offers || null,
      tags:        p.tags || [],
      posted_on:   isoDay(p.createdAtRaw),
      // Two separate facts. A post can be live and unanswered, which is
      // the case most worth telling the member about.
      is_live:     !expired,
      has_match:   matched.has(p.id),
      // Their own choice when posting, so the assistant can explain why
      // a post shows no name rather than treating it as a fault.
      posted_anonymously: p.isAnonymous !== false,
    }
  })
}
