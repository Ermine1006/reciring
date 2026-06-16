// Client-side mirror of api/lib/admin.js — used ONLY to hide / show
// admin UI affordances (menu items, pages). The real authorization gate
// is server-side in /api/broadcast and /api/send-email; do not rely on
// this list for security.
//
// Keep in sync with api/lib/admin.js. When the list grows or moves to
// a DB-backed role, replace this file with a derived lookup.

export const ADMIN_EMAILS = [
  'erminelyu@gmail.com',
]

export function isAdmin(email) {
  if (!email) return false
  return ADMIN_EMAILS.includes(String(email).toLowerCase().trim())
}
