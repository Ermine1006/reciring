// Visibility constants + display helpers for the Public / Private
// profile setting. Used by Discover surfaces (RequestCard,
// RequestDetailModal). Matching + chat surfaces are not affected
// in the current slice — they keep the existing identity-reveal flow.

export const VISIBILITY_PUBLIC  = 'public'
export const VISIBILITY_PRIVATE = 'private'

export const VISIBILITY_OPTIONS = [
  {
    id:    VISIBILITY_PUBLIC,
    label: 'Public profile',
    badge: '🌟',
    description: 'Recommended for alumni, EMBA, and users who want maximum networking opportunities.',
  },
  {
    id:    VISIBILITY_PRIVATE,
    label: 'Private profile',
    badge: '🔒',
    description: 'Hide your identity while still sharing your interests and goals.',
  },
]

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'Member'
}

function joinNonEmpty(parts, sep = ' · ') {
  return parts.map(p => (p == null ? '' : String(p).trim())).filter(Boolean).join(sep)
}

/**
 * Compute display info for a post's creator, given the post object
 * (which has an embedded `creator` profile slice from posts.js).
 *
 * Returns:
 *   {
 *     isPublic:  boolean — was the user's setting public?
 *     primary:   string  — main label line ("Sarah" or "FT-MBA")
 *     secondary: string  — secondary meta ("MBA '26 · Healthcare" or "Consulting")
 *     useAvatar: boolean — if true, render preset avatar; else AnonymousAvatar
 *     avatarUrl: string | null — for useAvatar=true callers
 *   }
 *
 * Falls back to a descriptive "Rotman peer" label when the creator
 * profile isn't joinable (e.g. the posts→profiles FK isn't set and
 * the embed fallback kicked in).
 */
export function posterDisplay(post) {
  const c = post?.creator || {}

  // Per-post override. Users pick anonymous vs real-name each time
  // they submit a request (see SubmitRequest). This flag takes
  // precedence over their profile-level visibility setting so a
  // Public-profile user can still post anonymously about sensitive
  // topics, and a Private-profile user can attach their real name
  // to a specific ask.
  //   post.isAnonymous === false → real-name (needs c.name to work)
  //   post.isAnonymous === true  → anonymous, regardless of profile
  //   undefined/null             → fall back to profile visibility
  const perPostRealName  = post?.isAnonymous === false
  const perPostAnonymous = post?.isAnonymous === true
  const profilePublic    = c.visibility === VISIBILITY_PUBLIC

  const showRealName =
    Boolean(c.name)
    && (perPostRealName || (!perPostAnonymous && profilePublic))

  if (showRealName) {
    return {
      isPublic:  true,
      primary:   firstName(c.name),
      secondary: joinNonEmpty([c.program, c.headline, c.industry_interests?.[0]]),
      useAvatar: Boolean(c.avatar_url),
      avatarUrl: c.avatar_url || null,
    }
  }

  // Private (default) — descriptive label, no name.
  // Primary line favours program (most universally meaningful);
  // secondary stacks role / industry / career stage.
  const primary = c.program
    || c.career_stage
    || c.industry_interests?.[0]
    || 'Rotman peer'

  const secondary = joinNonEmpty([
    c.headline,
    c.industry_interests?.[0] !== primary ? c.industry_interests?.[0] : null,
    c.career_stage !== primary ? c.career_stage : null,
  ])

  return {
    isPublic:  false,
    primary,
    secondary: secondary || null,
    useAvatar: false,
    avatarUrl: null,
  }
}
