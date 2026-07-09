// ── Auth configuration ────────────────────────────────────────────
//
// One config file, one source of truth for who can sign into Mutu.
//
// Rules:
//   1. Institutional email (UofT / Rotman family) → direct signup + login.
//   2. Gmail / Google account → signup + login require a valid invitation
//      (invite pre-issued to their email, or an invite code they enter).
//   3. Anything else → blocked (may be relaxed later; keeping the
//      allowlist strict for now to avoid onboarding random accounts).
//
// To onboard a new institutional domain (e.g. a partner school), add it
// to INSTITUTIONAL_DOMAINS and redeploy — no other file changes needed.

export const INSTITUTIONAL_DOMAINS = [
  'utoronto.ca',
  'mail.utoronto.ca',
  'rotman.utoronto.ca',
  'alum.utoronto.ca',
]

// Gmail sign-in is invite-only, so we detect Gmail addresses separately.
// Google Workspace accounts on institutional domains (e.g. Rotman's
// managed Google tenant) already match INSTITUTIONAL_DOMAINS; this
// constant only catches personal @gmail addresses and Google-hosted
// non-institutional domains routed through Google OAuth.
export const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com']

// ── Public helpers ──────────────────────────────────────────────────

// Institutional email = automatic access. Case-insensitive; trims
// whitespace defensively.
export function isInstitutionalEmail(email) {
  const domain = extractDomain(email)
  return domain != null && INSTITUTIONAL_DOMAINS.includes(domain)
}

// True for personal Gmail-family addresses. These get in only with a
// valid invite (see src/lib/invites.js).
export function isGmailEmail(email) {
  const domain = extractDomain(email)
  return domain != null && GMAIL_DOMAINS.includes(domain)
}

// Legacy alias used by call sites written before Gmail-invite support.
// Returns true for institutional OR Gmail (the OLD gate) so those call
// sites don't spuriously block Gmail users at the pre-Supabase stage
// — the invite gate now runs after Supabase auth succeeds and is what
// actually enforces the Gmail-invite-only rule.
export function isAllowedEmail(email) {
  return isInstitutionalEmail(email) || isGmailEmail(email)
}

// ── Internals ───────────────────────────────────────────────────────

function extractDomain(email) {
  const trimmed = String(email || '').trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at < 0 || at === trimmed.length - 1) return null
  return trimmed.slice(at + 1)
}
