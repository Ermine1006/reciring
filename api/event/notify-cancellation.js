// Vercel serverless function — POST /api/event/notify-cancellation
//
// Host-triggered fan-out email when they cancel an event. Sends the
// event_cancellation template (mode='host') to every remaining
// attendee, one per second-ish to stay under Resend's 5/sec rate
// limit (matches broadcast.js).
//
// Authorization model:
//   The caller must be the current host of the event. We verify by
//   loading the event via service key and comparing host_user_id
//   against the JWT user. Admin bypass is intentionally NOT provided
//   here — this endpoint is scoped to organizer-triggered emails.
//
// Body:
//   { eventId: string }
//
// Returns: { sent, failed, unsubscribed, errors }
//
// Env: same as /api/broadcast (RESEND_API_KEY, VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APP_URL).

import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { eventCancellationTemplate } from '../templates/event-cancellation.js'
import { makeUnsubscribeToken } from '../lib/unsubscribe-token.js'

const FROM = 'Reciring Team <hello@reciring.com>'
const SEND_INTERVAL_MS = 250 // ~4/sec, under Resend's 5/sec free-tier cap

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method not allowed' })

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const RESEND_KEY   = process.env.RESEND_API_KEY
  const APP_URL      = process.env.APP_URL || 'https://reciring.com'

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !RESEND_KEY) {
    return res.status(500).json({ error: 'server not configured' })
  }

  // 1. Verify caller JWT
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'missing token' })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'invalid token' })

  // 2. Validate body
  const { eventId } = req.body || {}
  if (!eventId) return res.status(400).json({ error: 'eventId is required' })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // 3. Load event; verify caller is host
  const { data: event, error: eventErr } = await admin
    .from('events')
    .select('id, title, description, start_at, location, host_user_id, host_display_name, cancellation_reason')
    .eq('id', eventId)
    .maybeSingle()
  if (eventErr) return res.status(500).json({ error: 'failed to load event', detail: eventErr.message })
  if (!event)   return res.status(404).json({ error: 'event not found' })
  if (event.host_user_id !== user.id) {
    return res.status(403).json({ error: 'only the event host can send cancellation emails' })
  }

  // 4. Resolve attendee list → emails
  const { data: attendeeRows } = await admin
    .from('event_attendees')
    .select('user_id')
    .eq('event_id', eventId)

  const attendeeIds = (attendeeRows || []).map(r => r.user_id).filter(id => id !== user.id)
  if (attendeeIds.length === 0) {
    return res.status(200).json({ sent: 0, failed: 0, unsubscribed: 0, errors: [] })
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name, email, email_subscribed')
    .in('id', attendeeIds)

  const targets = (profiles || []).filter(p => p.email)

  // 5. Iterate + send, one per SEND_INTERVAL_MS. Transactional template,
  //    so email_subscribed=false does NOT skip — attendees deserve to
  //    know their event was cancelled regardless of marketing prefs.
  const resend = new Resend(RESEND_KEY)
  const eventUrl = `${APP_URL.replace(/\/$/, '')}/?event=${event.id}`

  let sent = 0, failed = 0, unsubscribed = 0
  const errors = []
  let isFirst = true

  for (const target of targets) {
    if (!isFirst) await sleep(SEND_INTERVAL_MS)
    isFirst = false

    const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(target.id, SERVICE_KEY))}`

    const { subject, html } = eventCancellationTemplate({
      displayName:  (target.name || '').trim().split(/\s+/)[0] || 'there',
      mode:         'host',
      eventTitle:   event.title,
      eventStartAt: event.start_at,
      eventLocation: event.location,
      hostName:     event.host_display_name,
      cancellationReason: event.cancellation_reason,
      eventUrl,
      appUrl:       APP_URL,
      unsubscribeUrl,
    })

    let resendId = null, sendError = null
    try {
      const { data, error } = await resend.emails.send({ from: FROM, to: [target.email], subject, html })
      if (error) sendError = error
      else       resendId = data?.id || null
    } catch (err) {
      sendError = { message: err?.message || String(err) }
    }

    const status = sendError ? 'failed' : 'sent'
    if (sendError) { failed++; errors.push({ recipient: target.email, error: sendError.message || String(sendError) }) }
    else           { sent++ }

    await admin.from('email_logs').insert({
      user_id:   target.id,
      recipient: target.email,
      template:  'event_cancellation',
      subject,
      status,
      error:     sendError ? (sendError.message || JSON.stringify(sendError)) : null,
      resend_id: resendId,
    })
  }

  return res.status(200).json({ sent, failed, unsubscribed, errors: errors.slice(0, 20) })
}
