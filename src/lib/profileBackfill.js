import { HELP_TYPES, INDUSTRIES } from '../data/requestOptions'

// ── Auto-backfill matching tags from what a user posts ───────────────────
// When someone posts a request, the structured choices they already made are
// exactly the signals the matcher needs but users rarely fill in by hand:
//   • the help types they're asking for   → skills_to_learn (they want this)
//   • the industries they tagged           → industry_interests
// We ADD these to the profile (never remove), respect the field caps, and skip
// anything already selected — so a user's own choices are never overwritten.
//
// Returns { added: string[] } — the labels newly added, for a subtle notice.
export async function backfillMatchingTags({ profile, updateProfile, helpTags = [], learnTags = [], industryTags = [] }) {
  const inList = (arr, allowed) => (arr || []).filter(a => allowed.includes(a))

  const merge = (current, additions, cap) => {
    const out = [...(current || [])]
    const gained = []
    for (const a of additions) {
      if (!out.includes(a) && out.length < cap) { out.push(a); gained.push(a) }
    }
    return { out, gained }
  }

  const help  = merge(profile?.can_help_with,      inList(helpTags, HELP_TYPES),     5)
  const learn = merge(profile?.skills_to_learn,    inList(learnTags, HELP_TYPES),    5)
  const inds  = merge(profile?.industry_interests, inList(industryTags, INDUSTRIES), 3)

  const patch = {}
  if (help.gained.length)  patch.can_help_with      = help.out
  if (learn.gained.length) patch.skills_to_learn    = learn.out
  if (inds.gained.length)  patch.industry_interests = inds.out

  const added = [...help.gained, ...learn.gained, ...inds.gained]
  if (added.length === 0) return { added: [] }

  if (updateProfile) {
    const { error } = await updateProfile(patch)
    if (error) return { added: [], error }
  }
  return { added }
}
