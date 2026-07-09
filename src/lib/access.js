// Post-auth access-check helpers used by the gate in AuthContext.
// Consumed by src/config/auth.js::canUserAccessMutu — that function is
// pure decision logic and injects these lookups so it stays free of
// the Supabase client (avoids client import cycles).
//
// The gate calls each helper in order until one authorizes. Any
// helper returning false does NOT reject the user; it just means the
// next check gets a turn. Only the final "all false" state rejects.

import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Is this email a verified linked email belonging to an existing Mutu
 * member? Returns { userId, emailType } if the email is on file AND
 * verified, otherwise null.
 *
 * Handles the alumni-after-graduation path: an institutional user
 * links their Gmail via Settings, and later signs in through Google
 * OAuth. This lookup recognizes the Gmail as belonging to the same
 * verified account.
 */
export async function checkLinkedVerifiedEmail(email) {
  if (!isSupabaseConfigured) return null
  const cleaned = String(email || '').trim().toLowerCase()
  if (!cleaned) return null

  const { data, error } = await supabase
    .from('user_emails')
    .select('user_id, email_type, is_verified')
    .filter('email', 'ilike', cleaned)
    .maybeSingle()

  if (error || !data)   return null
  if (!data.is_verified) return null
  return { userId: data.user_id, emailType: data.email_type }
}

/**
 * Does this email belong to a Mutu member with active premium access?
 * True if the linked profile has member_type in ('premium','admin') OR
 * premium_until > now(). Falls through to false if the email isn't
 * linked at all.
 */
export async function checkPremiumAccess(email) {
  if (!isSupabaseConfigured) return false
  const cleaned = String(email || '').trim().toLowerCase()
  if (!cleaned) return false

  // Two-step lookup because user_emails FKs to auth.users not profiles.
  const link = await checkLinkedVerifiedEmail(cleaned)
  if (!link) return false

  const { data, error } = await supabase
    .from('profiles')
    .select('member_type, premium_until, access_status')
    .eq('id', link.userId)
    .maybeSingle()

  if (error || !data) return false
  if (data.access_status === 'blocked' || data.access_status === 'expired') return false

  if (data.member_type === 'premium' || data.member_type === 'admin') return true
  if (data.premium_until && new Date(data.premium_until) > new Date()) return true
  return false
}
