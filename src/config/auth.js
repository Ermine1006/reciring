// ── Auth configuration ────────────────────────────────────────────
// Change this single value to restrict sign-ups to a different school.
// Set to null to allow any email domain.

export const ALLOWED_EMAIL_DOMAIN = 'mail.utoronto.ca'

// Additional domains allowed alongside the primary one.
export const EXTRA_ALLOWED_DOMAINS = ['rotman.utoronto.ca', 'utoronto.ca']

export function isAllowedEmail(email) {
  if (!ALLOWED_EMAIL_DOMAIN) return true
  const domain = email.split('@')[1]?.toLowerCase()
  if (domain === ALLOWED_EMAIL_DOMAIN.toLowerCase()) return true
  if (EXTRA_ALLOWED_DOMAINS.some(d => domain === d.toLowerCase())) return true
  return false
}
