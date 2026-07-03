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

/**
 * Event-related email helpers. All three post to /api/send-email with
 * an action-based body; the server loads the event, resolves the
 * caller (or attendees for the host action), and renders the template.
 * Callers pass just the eventId — no need to marshal event details.
 *
 * Fire-and-forget at the call site: email failures shouldn't block
 * the DB action that already succeeded.
 */
export async function sendEventRegistrationEmail({ eventId }) {
  return postEventAction('event_join_confirmation', eventId)
}

export async function sendEventUnregisterEmail({ eventId }) {
  return postEventAction('event_leave_confirmation', eventId)
}

/**
 * Host-initiated cancellation fan-out. Server verifies the caller is
 * the event host and mails every remaining attendee.
 */
export async function notifyEventCancellation(eventId) {
  return postEventAction('event_cancel_notification', eventId)
}

async function postEventAction(action, eventId) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  if (!eventId)              return { data: null, error: new Error('missing eventId') }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: new Error('Not signed in') }

  let resp
  try {
    resp = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, eventId }),
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
 * Toggle the current user's email subscription. Writes both the
 * profiles flag (fast-read state) and an audit row in
 * email_subscriptions in a single shot. RLS guarantees the user can
 * only modify their own subscription.
 *
 * `subscribed`: true to opt in, false to opt out.
 * Returns { error }.
 */
export async function setMyEmailSubscription(subscribed) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { error: new Error('Not signed in') }

  const userId = session.user.id
  const flag   = Boolean(subscribed)

  // 1. Update the fast-read flag on profiles.
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ email_subscribed: flag })
    .eq('id', userId)

  if (updateErr) return { error: new Error(updateErr.message || 'Failed to update subscription') }

  // 2. Append to audit log. RLS only allows self-insert with
  // source='user_settings_toggle', so the type below is required.
  const { error: logErr } = await supabase
    .from('email_subscriptions')
    .insert({
      user_id:  userId,
      status:   flag ? 'subscribed' : 'unsubscribed',
      source:   'user_settings_toggle',
      acted_by: userId,
    })

  // Non-fatal: the flag is already updated. Audit log failure is logged
  // but doesn't break the UX.
  if (logErr) console.warn('[ReciRing] subscription audit log failed:', logErr.message)

  return { error: null }
}
