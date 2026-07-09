// Access-code validation + redemption helpers. Replaces the earlier
// invites-only helper. One entry point covers both admin-issued
// invites AND member-issued referrals — the code's `code_type`
// column decides which pathway to record on the resulting profile.
//
// Consumed by:
//   • LoginScreen — pre-validate a typed code inline (fast reject).
//   • AuthContext — post-signin gate; performs the atomic redemption
//                   via the redeem_access_code RPC.
//
// The RLS + RPC design in migration-access-codes.sql means writes
// only ever go through the RPC. Direct client writes to access_codes
// or access_code_redemptions are refused.

import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Look up a code by its exact value (case-insensitive) and classify.
 * No writes happen here — the caller validates + then calls
 * `redeemAccessCode` when they actually want to consume a use.
 *
 * Returns:
 *   { code: row, reason: null }              — usable, ready to redeem
 *   { code: null, reason: 'code_not_found'   — not in the table
 *                       | 'code_revoked'
 *                       | 'code_expired'
 *                       | 'code_already_used' }
 */
export async function checkAccessCode(rawCode) {
  if (!isSupabaseConfigured) return { code: null, reason: 'code_not_found' }
  const cleaned = String(rawCode || '').trim()
  if (!cleaned) return { code: null, reason: 'code_not_found' }

  const { data, error } = await supabase
    .from('access_codes')
    .select('id, code, code_type, status, max_uses, used_count, expires_at, created_by_user_id')
    .ilike('code', cleaned)
    .maybeSingle()

  if (error) {
    console.warn('[Mutu] checkAccessCode select error:', error.message, error)
    return { code: null, reason: 'code_not_found' }
  }
  if (!data) return { code: null, reason: 'code_not_found' }

  if (data.status === 'revoked') return { code: null, reason: 'code_revoked' }
  if (data.status === 'used')    return { code: null, reason: 'code_already_used' }
  if (data.status === 'expired') return { code: null, reason: 'code_expired' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { code: null, reason: 'code_expired' }
  }
  if (data.used_count >= data.max_uses) {
    return { code: null, reason: 'code_already_used' }
  }
  return { code: data, reason: null }
}

/**
 * Atomically redeem a code via the redeem_access_code RPC. The RPC
 * re-validates (client checks can race), enforces referral
 * integrity (creator must still be active + verified), bumps
 * used_count, and writes the redemption audit row.
 *
 * Returns:
 *   { ok: true, codeType, createdByUserId }
 *   { ok: false, reason: string } where reason is one of the codes
 *   listed in checkAccessCode plus 'code_referrer_inactive'.
 */
export async function redeemAccessCode({ code, email, userId }) {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' }
  const cleaned = String(code || '').trim()
  if (!cleaned || !email || !userId) return { ok: false, reason: 'code_not_found' }

  const { data, error } = await supabase.rpc('redeem_access_code', {
    p_code:    cleaned,
    p_email:   String(email).trim().toLowerCase(),
    p_user_id: userId,
  })
  if (error) {
    // Surface the raw Postgres error so operators can distinguish
    // "code expired" from "function does not exist" (migration not
    // applied) from "permission denied" (GRANT missing).
    console.warn('[Mutu] redeem_access_code RPC error:', error.message, error)
    return { ok: false, reason: extractReason(error.message) }
  }
  if (!data || data.length === 0) return { ok: false, reason: 'code_not_found' }
  const row = data[0]
  return {
    ok: true,
    codeType:         row.code_type,          // 'invite' | 'referral' | 'premium'
    createdByUserId:  row.created_by_user_id, // referrer, for referral code type
    accessCodeId:     row.access_code_id,
  }
}

/**
 * UI label for each rejection reason. Kept close to the reasons so
 * new codes get a message in one place.
 */
export function accessCodeReasonLabel(reason) {
  switch (reason) {
    case 'code_not_found':         return "We couldn't find that code. Check for typos and try again."
    case 'code_revoked':           return 'This code has been revoked.'
    case 'code_already_used':      return 'This code has already been used.'
    case 'code_expired':           return 'This code has expired.'
    case 'code_referrer_inactive': return 'The member who shared this code is no longer active — ask them for a new one.'
    default:
      // Include the raw reason token so first-week diagnostics don't
      // require opening DevTools. Safe to inline — the token is a
      // controlled snake_case string, never user input.
      return `We couldn't validate that code (${reason || 'unknown'}). Try again or ping support.`
  }
}

// ── Internals ─────────────────────────────────────────────────

function extractReason(message) {
  const match = /code_[a-z_]+/i.exec(String(message || ''))
  return match ? match[0].toLowerCase() : 'code_not_found'
}
