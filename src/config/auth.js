// ── Auth configuration ────────────────────────────────────────────
// Change this single value to restrict sign-ups to a different school.
// Set to null to allow any email domain.

export const ALLOWED_EMAIL_DOMAIN = 'mail.utoronto.ca'

export function isAllowedEmail(email) {
  if (!ALLOWED_EMAIL_DOMAIN) return true
  const domain = email.split('@')[1]?.toLowerCase()
  return domain === ALLOWED_EMAIL_DOMAIN.toLowerCase()
}
