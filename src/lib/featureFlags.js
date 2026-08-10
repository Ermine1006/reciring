// Lightweight feature-flag gate for the Profile redesign rollout.
//
// The new 4-step Profile (capture + display + match) is shown ONLY to accounts
// on this allowlist, so we can test the full save→display→match loop on real
// data before turning it on for everyone. Everyone else keeps the untouched
// legacy Profile. A localStorage override (`mutu_profile_v3` = 'on'|'off') lets
// us flip it per-device while testing without a redeploy.

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
  return flag(user, 'mutu_profile_v3', PROFILE_V3_EMAILS)
}

// LinkedIn-assisted profile — same allowlist, its own override key. Gated
// separately because it ALSO needs the linkedin_oidc provider configured in
// Supabase Auth before the connect button can actually complete.
export function isLinkedInEnabled(user) {
  return flag(user, 'mutu_linkedin', PROFILE_V3_EMAILS)
}
