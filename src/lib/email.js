import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Generic send wrapper. Calls the Vercel /api/send-email function
 * with the current user's Supabase JWT in the Authorization header.
 *
 * The server enforces "send-to-self only" for non-admin users, so
 * `to` must equal the signed-in user's email today.
 *
 * Returns { data, error }. `data` shape on success: { id, status: 'sent' }.
 */
export async function sendEmail({ template, to, data = {} }) {
  if (!isSupabaseConfigured) {
    return { data: null, error: new Error('Supabase not configured') }
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: new Error('Not signed in') }

  let resp
  try {
    resp = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        Authorization:   `Bearer ${session.access_token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ template, to, data }),
    })
  } catch (err) {
    return { data: null, error: new Error(err?.message || 'network error') }
  }

  let result = {}
  try { result = await resp.json() } catch {}

  if (!resp.ok) {
    return { data: null, error: new Error(result.error || `send failed (${resp.status})`) }
  }
  return { data: result, error: null }
}

/**
 * Convenience: trigger the welcome email for the currently signed-in
 * user. Fire-and-forget at the call site — onboarding should not block
 * on email delivery.
 */
export async function sendWelcomeEmail({ toEmail, displayName }) {
  return sendEmail({
    template: 'welcome',
    to:       toEmail,
    data:     { displayName },
  })
}
