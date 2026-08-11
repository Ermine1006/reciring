// Lightweight feature-flag gate for the Profile redesign rollout.
//
// The new 4-step Profile (capture + display + match) is shown ONLY to accounts
// on this allowlist, so we can test the full save→display→match loop on real
// data before turning it on for everyone. Everyone else keeps the untouched
// legacy Profile. A localStorage override (`mutu_profile_v3` = 'on'|'off') lets
// us flip it per-device while testing without a redeploy.

// Master rollout switch for the Profile V3 redesign. Turned OFF so the whole
// app runs on the LEGACY (v2) profile — this keeps the profile fields the
// matching engines read (can_help_with / skills_to_learn / industry_interests)
// consistent with what onboarding writes. V3 writes a different column family
// (expertise_offered / help_wanted / industries_known…) that no matching engine
// reads, so a V3 user would be invisible to matching. Flip back to `true` to
// resume the V3 rollout once the engines read the v3 columns (Phase 2).
// The localStorage override ('mutu_profile_v3' = 'on') still wins, so V3 can be
// previewed per-device without a redeploy.
const PROFILE_V3_ROLLOUT = false

const PROFILE_V3_EMAILS = [
  'erminelyu@gmail.com',
  'hello@muturing.com',
  'xiaoling.lyu@mail.utoronto.ca',
  'xiaoling.lyu@rotman.utoronto.ca',
]

function flag(user, key, allowlist) {
  try {
    if (typeof localStorage !== 'undefined') {
      const o = localStorage.getItem(key)
      if (o === 'on') return true
      if (o === 'off') return false
    }
  } catch { /* ignore */ }
  const email = (user?.email || '').trim().toLowerCase()
  return allowlist.includes(email)
}

export function isProfileV3Enabled(user) {
  // Rollout is off: legacy profile for everyone. A per-device localStorage
  // override ('on') still forces V3 for previewing; the allowlist no longer
  // auto-enables it while PROFILE_V3_ROLLOUT is false.
  if (!PROFILE_V3_ROLLOUT) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('mutu_profile_v3') === 'on') return true
    } catch { /* ignore */ }
    return false
  }
  return flag(user, 'mutu_profile_v3', PROFILE_V3_EMAILS)
}

// LinkedIn-assisted profile — same allowlist, its own override key. Gated
// separately because it ALSO needs the linkedin_oidc provider configured in
// Supabase Auth before the connect button can actually complete.
export function isLinkedInEnabled(user) {
  return flag(user, 'mutu_linkedin', PROFILE_V3_EMAILS)
}
