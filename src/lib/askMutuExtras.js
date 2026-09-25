// ── The rest of Mutu, as grounding for Ask Mutu ───────────────────
//
// Three features shipped after the assistant was built, so it could not
// answer anything about them: the Buddy Program, Story Garden, and how
// strong a relationship actually is. Each builder turns rows the app
// already loads into the smallest honest shape.
//
// The rule throughout: only the member's own record. Other people's
// stories, other pairs' buddies and other members' edges are browsing
// surfaces, not this member's private context.

/** Nothing to say is null, never an empty shell the model might narrate. */
const orNull = (arr) => (arr && arr.length ? arr : null)

function isoDay(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * The Buddy Program: whether they joined, and who they were paired with.
 *
 * Contact details are deliberately dropped even when the server sends
 * them. An email address is the one thing an assistant answer should
 * never be able to spill, and the member can already see it in the app.
 */
export function buildBuddyContext({ programs = [], state = null } = {}) {
  const joined = (programs || []).filter((p) => p && (p.role || p.coordinator))
  if (joined.length === 0 && !state?.post) return null

  const post = state?.post || null
  const pairings = (state?.pairings || []).map((x) => ({
    status: x.status || null,
    // "suggested" means the match exists but nobody has said yes yet,
    // which is the state most worth a nudge.
    you_accepted: Boolean(x.you_accepted),
    you_have_met: Boolean(x.you_met),
    both_have_met: Boolean(x.both_met),
    buddy_role: x.peer?.role || null,
    // Named only once both accepted; before that the server sends a
    // role label, and the assistant must not invent a name.
    buddy_name: x.status === 'accepted' ? (x.peer?.name || null) : null,
    they_want_help_with: x.peer?.need || null,
    they_can_help_with: x.peer?.offer || null,
    shared_topics: x.common_topics || [],
    suggested_start: x.suggested_start || null,
  }))

  return {
    programs: joined.map((p) => ({
      name: p.name || null,
      my_role: p.role || (p.coordinator ? 'coordinator' : null),
    })),
    my_post: post ? {
      role: post.role || null,
      want_help_with: post.need || null,
      can_help_with: post.offer || null,
      is_active: post.active !== false,
    } : null,
    pairings: orNull(pairings),
  }
}

/**
 * Story Garden: the member's OWN writing only.
 *
 * Titles and topics, never the body. A story is someone working
 * something out in their own words, and the assistant has no business
 * repeating it back, let alone quoting it into an answer.
 */
export function buildStoriesContext({ stories = [], userId = null } = {}) {
  const own = (stories || []).filter((s) => s && (!userId || s.author_id === userId))
  if (own.length === 0) return null
  return own.slice(0, 10).map((s) => ({
    title: s.title || null,
    topic: s.topic || null,
    status: s.status || null,
    last_worked_on: isoDay(s.updated_at || s.published_at),
  }))
}

/**
 * How strong each relationship actually is, from verified activity.
 *
 * "connections" already tells the assistant who the member knows. This
 * says which of those they have actually done things with, so "who do I
 * know best" stops being a guess. Every number here was confirmed by
 * both people; nothing is inferred from messages or time spent.
 */
export function buildCircleContext({ edges = [], namesById = {}, userId = null } = {}) {
  if (!userId) return null
  const nameOf = (id) => {
    const n = namesById[id]
    return (typeof n === 'string' ? n : n?.name) || null
  }

  const rows = (edges || [])
    .map((e) => {
      const peerId = e.user_lo === userId ? e.user_hi : e.user_lo === undefined ? null : e.user_lo
      const other = e.user_lo === userId ? e.user_hi : e.user_hi === userId ? e.user_lo : peerId
      const name = nameOf(other)
      const verified = Number(e.verified_count ?? e.verified ?? 0)
      if (!name || !Number.isFinite(verified) || verified <= 0) return null
      return {
        name,
        practices_together: verified,
        shared_tokens: Number(e.token_count ?? 0) || 0,
        last_together: isoDay(e.last_verified_at),
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.practices_together - a.practices_together)
    .slice(0, 10)

  return orNull(rows)
}
