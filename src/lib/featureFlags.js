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

// Reciprocal Practice (Rotman consulting pilot) — a plain rollout
// switch, deliberately NOT an allowlist: eligibility lives in the DB
// (active Mutu access + Rotman community membership; see
// practice_is_community_eligible in migration-practice-reciprocal.sql).
// This flag only decides whether the UI is shown. Ship dark with
// `false`; the localStorage override ('mutu_practice' = 'on'|'off')
// lets us test per-device without a redeploy; flip to `true` to launch.
const PRACTICE_ROLLOUT = false

export function isPracticeEnabled() {
  try {
    if (typeof localStorage !== 'undefined') {
      const o = localStorage.getItem('mutu_practice')
      if (o === 'on') return true
      if (o === 'off') return false
    }
  } catch { /* ignore */ }
  return PRACTICE_ROLLOUT
}

// Home community-network visualization (relationship capital on Home).
// Replaces ONLY the green "My Networking" card with the animated
// CommunityNetworkGraph. Ships dark with `false`; the localStorage
// override ('mutu_home_graph' = 'on'|'off') lets us preview per-device
// without a redeploy; flip to `true` to launch.
const HOME_GRAPH_ROLLOUT = false

export function isHomeGraphEnabled() {
  try {
    if (typeof localStorage !== 'undefined') {
      const o = localStorage.getItem('mutu_home_graph')
      if (o === 'on') return true
      if (o === 'off') return false
    }
  } catch { /* ignore */ }
  return HOME_GRAPH_ROLLOUT
}

// Luma events integration — a build-time flag (VITE_ENABLE_LUMA_INTEGRATION).
// Also needs LUMA_API_KEY in Supabase secrets + the Edge Functions deployed
// before it does anything; the UI stays hidden until the flag is 'true'.
export function isLumaEnabled() {
  try {
    return String(import.meta.env?.VITE_ENABLE_LUMA_INTEGRATION || '').toLowerCase() === 'true'
  } catch { return false }
}
