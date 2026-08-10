// ─────────────────────────────────────────────────────────────────────────
// LinkedIn OIDC claim normalization.
//
// Turns a Supabase linkedin_oidc identity's `identity_data` (the OIDC claims
// actually returned with the user's authorization) into a small, safe shape.
// Only these commonly-available claims are read; anything absent stays empty.
// We NEVER fabricate a headline or claim work history/education/skills.
// ─────────────────────────────────────────────────────────────────────────

// The claims we know how to handle (openid profile email):
//   sub, name, given_name, family_name, picture, locale, email, email_verified
// `headline` is read defensively — LinkedIn's OIDC userinfo does not reliably
// include it, so treat its presence as a bonus, its absence as normal.
export function normalizeLinkedInClaims(identityData = {}) {
  const d = identityData || {}
  const first = str(d.given_name)
  const last = str(d.family_name)
  const out = {
    subject: str(d.sub) || null,
    firstName: first,
    lastName: last,
    name: str(d.name) || [first, last].filter(Boolean).join(' '),
    picture: str(d.picture),
    email: str(d.email),
    emailVerified: Boolean(d.email_verified),
    headline: str(d.headline),                       // usually empty
    locale: typeof d.locale === 'string' ? d.locale : str(d.locale?.language),
  }
  // Which human-meaningful fields actually came back (drives the review UI +
  // the linkedin_imported_fields audit list).
  out.availableFields = ['name', 'firstName', 'lastName', 'picture', 'email', 'headline']
    .filter(k => out[k])
  return out
}

// Pull the linkedin_oidc identity out of a getUserIdentities() result.
export function findLinkedInIdentity(identities = []) {
  return (identities || []).find(i => i?.provider === 'linkedin_oidc') || null
}

function str(v) { return typeof v === 'string' ? v.trim() : '' }
