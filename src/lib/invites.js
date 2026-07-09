// Invite validation + redemption helpers. Consumed by:
//   • LoginScreen — pre-validate invite code inline before hitting Supabase
//   • AuthContext — post-signin gate for Gmail users
//
// All queries respect the RLS policy defined in migration-invites.sql:
//   • SELECT is open (lookup-only, no enumeration)
//   • UPDATE happens via the redeem_invite() SECURITY DEFINER RPC —
//     the client can't mutate invite rows directly.

import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Look up an active invite by the recipient's email. Used for
 * pre-issued invites where an admin scheduled a specific address in
 * advance so the user doesn't have to type a code.
 *
 * Returns { invite: row | null, reason: string | null }.
 * reason is populated when we found a row but it's not usable
 * (expired / used / revoked) — the caller shows it to the user.
 */
export async function checkInviteByEmail(email) {
  if (!isSupabaseConfigured) return { invite: null, reason: null }
  const cleaned = String(email || '').trim().toLowerCase()
  if (!cleaned) return { invite: null, reason: null }

  const { data, error } = await supabase
    .from('invites')
    .select('id, email, invite_code, status, max_uses, used_count, expires_at')
    .filter('email', 'ilike', cleaned)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return { invite: null, reason: null }
  return classifyInvite(data)
}

/**
 * Validate an invite code the user typed. Optionally scoped to a
 * specific email (if the invite row has an email set, the caller's
 * address must match).
 *
 * Returns the same shape as checkInviteByEmail.
 */
export async function checkInviteByCode(email, code) {
  if (!isSupabaseConfigured) return { invite: null, reason: null }
  const cleanedCode = String(code || '').trim()
  if (!cleanedCode) return { invite: null, reason: null }

  const { data, error } = await supabase
    .from('invites')
    .select('id, email, invite_code, status, max_uses, used_count, expires_at')
    .ilike('invite_code', cleanedCode)
    .maybeSingle()

  if (error || !data) {
    return { invite: null, reason: 'invite_not_found' }
  }
  const { invite, reason } = classifyInvite(data)
  if (!invite) return { invite: null, reason }

  // If the invite is email-bound, the entered email has to match.
  const cleanedEmail = String(email || '').trim().toLowerCase()
  if (invite.email && cleanedEmail && invite.email.toLowerCase() !== cleanedEmail) {
    return { invite: null, reason: 'invite_email_mismatch' }
  }
  return { invite, reason: null }
}

/**
 * Redeem an invite atomically via the redeem_invite() RPC. One of
 * `code` or `email` must resolve to an invite; if both are provided,
 * the code takes precedence (matches the SQL behaviour).
 *
 * Returns { ok: true } or { ok: false, reason: string }. `reason`
 * is one of the exceptions thrown by the RPC:
 *   invite_not_found · invite_revoked · invite_already_used
 *   invite_expired   · invite_email_mismatch
 */
export async function redeemInvite({ email, code }) {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' }
  const { data, error } = await supabase.rpc('redeem_invite', {
    p_code:  code ? String(code).trim() : null,
    p_email: email ? String(email).trim() : null,
  })
  if (error) {
    // Postgres exceptions come back as { message: 'invite_...' }
    return { ok: false, reason: extractReason(error.message) }
  }
  if (!data || data.length === 0) {
    return { ok: false, reason: 'invite_not_found' }
  }
  return { ok: true, invite: data[0] }
}

/**
 * Human-readable label for the reason codes above. UI uses this to
 * show a message the user can act on.
 */
export function inviteReasonLabel(reason) {
  switch (reason) {
    case 'invite_not_found':      return "We couldn't find that invite. Check the code and try again."
    case 'invite_revoked':        return 'This invite has been revoked.'
    case 'invite_already_used':   return 'This invite has already been used.'
    case 'invite_expired':        return 'This invite has expired.'
    case 'invite_email_mismatch': return 'This invite is issued to a different email address.'
    default:                      return "We couldn't validate your invite. Please try again."
  }
}

// ── Internals ───────────────────────────────────────────────────────

function classifyInvite(row) {
  if (row.status === 'revoked')            return { invite: null, reason: 'invite_revoked' }
  if (row.status === 'used')               return { invite: null, reason: 'invite_already_used' }
  if (row.status === 'expired')            return { invite: null, reason: 'invite_expired' }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { invite: null, reason: 'invite_expired' }
  }
  if (row.used_count >= row.max_uses)      return { invite: null, reason: 'invite_already_used' }
  return { invite: row, reason: null }
}

function extractReason(message) {
  // The RPC uses `raise exception '<snake_case>'`, and Supabase surfaces
  // it as "invite_expired" or "Failed to run … invite_expired". Grab the
  // trailing snake_case token so the caller can map it to a label.
  const match = /invite_[a-z_]+/i.exec(String(message || ''))
  return match ? match[0].toLowerCase() : 'invite_not_found'
}
