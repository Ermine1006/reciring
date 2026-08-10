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

export function isProfileV3Enabled(user) {
  try {
    if (typeof localStorage !== 'undefined') {
      const o = localStorage.getItem('mutu_profile_v3')
      if (o === 'on') return true
      if (o === 'off') return false
    }
  } catch { /* ignore */ }
  const email = (user?.email || '').trim().toLowerCase()
  return PROFILE_V3_EMAILS.includes(email)
}
