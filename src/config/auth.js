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

// High-level access decision, used by the post-OAuth gate + any
// defensive re-checks. Runs the four eligibility checks in order and
// returns the first one that authorizes. Only "all four failed"
// rejects.
//
// Returns { ok: boolean, accessType?: string, reason?: string }.
// accessType is one of the values allowed by the profiles.access_type
// CHECK constraint; the caller writes it verbatim on profile insert.
//
// Order of checks:
//   1. Institutional email (UofT / Rotman) → allow.
//   2. Verified linked personal email — the user linked this address
//      to an existing verified account, most likely the post-graduation
//      alumni path. Allow.
//   3. Invite table — either pre-issued for this email or a code the
//      user typed and stashed in sessionStorage before OAuth. Allow +
//      redeem.
//   4. Premium / admin status on the linked profile → allow.
//   5. Anything else → deny.
//
// Every lookup is INJECTED so this module doesn't import supabase —
// callers (AuthContext) plug in access-lib + invites-lib functions.
// Keeps the config module free of side-effects and easy to unit-test.
export async function canUserAccessMutu(email, {
  userId,
  checkLinkedVerifiedEmail,
  checkAccessCode,
  redeemAccessCode,
  checkPremiumAccess,
  stashedCode,
} = {}) {
  const normalized = String(email || '').toLowerCase().trim()
  if (!normalized) return { ok: false, reason: 'no_email' }

  // 1. Institutional → allow. Fastest path, no DB round trip.
  if (isInstitutionalEmail(normalized)) {
    return { ok: true, accessType: 'institutional_email' }
  }

  // 2. Linked verified email → alumni-after-graduation, or any prior
  //    approved user who linked a personal address / Google identity.
  if (typeof checkLinkedVerifiedEmail === 'function') {
    const link = await checkLinkedVerifiedEmail(normalized)
    if (link) return { ok: true, accessType: 'linked_google' }
  }

  // 3. Access code — either an invite or a referral. Only redeem if
  //    the client has captured the newly-authenticated userId; the
  //    RPC requires it for the redemption audit row.
  if (stashedCode
      && userId
      && typeof checkAccessCode === 'function'
      && typeof redeemAccessCode === 'function') {
    const check = await checkAccessCode(stashedCode)
    if (check.code) {
      const r = await redeemAccessCode({ code: stashedCode, email: normalized, userId })
      if (r.ok) {
        return {
          ok:              true,
          accessType:      r.codeType === 'referral' ? 'referral_code'
                         : r.codeType === 'premium'  ? 'premium'
                         : 'invite_code',
          referredByUserId: r.codeType === 'referral' ? r.createdByUserId : null,
          joinedWithCode:  stashedCode,
        }
      }
      // Redemption raced or referrer went inactive — surface the RPC
      // reason so the UI shows something specific.
      return { ok: false, reason: r.reason }
    }
    // Fall through — a bad code doesn't kill the request; premium
    // and other pathways still get a shot below.
  }

  // 4. Premium / admin-granted access on an already-linked account.
  if (typeof checkPremiumAccess === 'function') {
    const premium = await checkPremiumAccess(normalized)
    if (premium) return { ok: true, accessType: 'premium' }
  }

  // 5. No pathway authorized. Gmail gets a specific message asking
  //    for an invite/referral; anything else is a domain-block hint.
  if (isGmailEmail(normalized)) {
    return { ok: false, reason: 'gmail_requires_invite_or_referral' }
  }
  return { ok: false, reason: 'unsupported_email' }
}

// Back-compat alias so existing imports of `canUserAccessApp` keep
// working. New code should use `canUserAccessMutu`.
export const canUserAccessApp = canUserAccessMutu

// ── Internals ───────────────────────────────────────────────────────

function extractDomain(email) {
  const trimmed = String(email || '').trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at < 0 || at === trimmed.length - 1) return null
  return trimmed.slice(at + 1)
}
