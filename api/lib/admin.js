// Admin email allowlist — used by /api/send-email and /api/broadcast
// to permit cross-user / multi-recipient sends.
//
// The list is intentionally code-managed (not DB-driven) so admin status
// cannot be granted via SQL injection or a compromised database role.
// Edit this file and redeploy to grant or revoke access.

export const ADMIN_EMAILS = [
  'erminelyu@gmail.com',
]

export function isAdmin(email) {
  if (!email) return false
  return ADMIN_EMAILS.includes(String(email).toLowerCase().trim())
}
