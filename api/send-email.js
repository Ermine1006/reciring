// Vercel serverless function — POST /api/send-email
//
// Consolidated email endpoint. Two request shapes:
//
// 1. Legacy `{ template, to, data }` — single recipient. Anyone can
//    send to themselves; admins can send to anyone. Used by the
//    welcome email trigger and admin ops.
//
// 2. Action-based `{ action, eventId }` — routes event flows through
//    ONE endpoint so the Vercel Hobby serverless-function limit
//    doesn't need +1 file per email type. Supported actions:
//      • event_join_confirmation   → registration email to self
//      • event_leave_confirmation  → self-cancellation email to self
//      • event_cancel_notification → host fans out cancellation to
//        all attendees (verified server-side against host_user_id)
//
// Guards (same across both shapes):
//   - 'welcome' template is deduped at-most-once per user
//   - Non-transactional templates respect profiles.email_subscribed
//   - Transactional templates always send (user-initiated / signup)
//
// Required env vars: RESEND_API_KEY, VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APP_URL.

import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { welcomeTemplate } from './_templates/welcome.js'
import { eventRegistrationTemplate } from './_templates/event-registration.js'
import { eventCancellationTemplate } from './_templates/event-cancellation.js'
import { isAdmin } from './_lib/admin.js'
import { makeUnsubscribeToken } from './_lib/unsubscribe-token.js'
import { EMAIL_FROM, APP_URL as APP_URL_FALLBACK } from '../src/lib/branding.js'

const FROM = EMAIL_FROM
// ~4/sec, comfortably under Resend's free-tier 5/sec cap. Only used
// for the host cancellation fan-out — single-recipient sends don't
// need to throttle.
const SEND_INTERVAL_MS = 250

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const TEMPLATES = {
  welcome:            { build: welcomeTemplate,           transactional: true, dedupe: true  },
  // Users may join/leave/rejoin the same event; dedupe: false so every
  // action confirms. Transactional so unsubscribed users still get
  // confirmation of their own action.
  event_registration: { build: eventRegistrationTemplate, transactional: true, dedupe: false },
  event_cancellation: { build: eventCancellationTemplate, transactional: true, dedupe: false },
}

const EVENT_ACTIONS = new Set([
  'event_join_confirmation',
  'event_leave_confirmation',
  'event_cancel_notification',
])

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
  const APP_URL      = process.env.APP_URL || APP_URL_FALLBACK

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !RESEND_KEY) {
    return res.status(500).json({
      error: 'server not configured',
      detail: 'check RESEND_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY',
    })
  }

  // Verify caller JWT
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'missing token' })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'invalid token' })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const body  = req.body || {}

  // ── Route: action-based event flows ─────────────────────────
  if (body.action && EVENT_ACTIONS.has(body.action)) {
    return handleEventAction({
      action: body.action,
      eventId: body.eventId,
      user, admin, APP_URL, RESEND_KEY,
      res,
    })
  }

  // ── Route: legacy template-based single send ───────────────
  return handleTemplateSend({
    body,
    user, admin, APP_URL, RESEND_KEY,
    res,
  })
}

// ─────────────────────────────────────────────────────────────
// Event action dispatch
// ─────────────────────────────────────────────────────────────

async function handleEventAction({ action, eventId, user, admin, APP_URL, RESEND_KEY, res }) {
  if (!eventId) return res.status(400).json({ error: 'eventId is required for event actions' })

  // Load event once — used by every action for template data and by
  // the cancel-notification action for host verification.
  const { data: event, error: eventErr } = await admin
    .from('events')
    .select('id, title, description, start_at, location, host_user_id, host_display_name, cancellation_reason')
    .eq('id', eventId)
    .maybeSingle()
  if (eventErr) return res.status(500).json({ error: 'failed to load event', detail: eventErr.message })
  if (!event)   return res.status(404).json({ error: 'event not found' })

  const eventUrl = `${APP_URL.replace(/\/$/, '')}/?event=${event.id}`
  const resend   = new Resend(RESEND_KEY)

  // ── Self-notification actions (join, leave) ──────────────
  if (action === 'event_join_confirmation' || action === 'event_leave_confirmation') {
    // Resolve caller's profile for greeting + email
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('id, name, email')
      .eq('id', user.id)
      .maybeSingle()

    const toEmail = callerProfile?.email || user.email
    if (!toEmail) return res.status(400).json({ error: 'caller has no email on file' })

    const displayName = firstName(callerProfile?.name) || firstName(toEmail.split('@')[0]) || 'there'
    const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(user.id, process.env.SUPABASE_SERVICE_ROLE_KEY))}`

    const templateData =
      action === 'event_join_confirmation'
        ? {
            displayName,
            eventTitle:       event.title,
            eventStartAt:     event.start_at,
            eventLocation:    event.location,
            hostName:         event.host_display_name,
            eventDescription: event.description,
            eventUrl,
            appUrl:           APP_URL,
            unsubscribeUrl,
          }
        : {
            displayName,
            mode:          'self',
            eventTitle:    event.title,
            eventStartAt:  event.start_at,
            eventLocation: event.location,
            hostName:      event.host_display_name,
            eventUrl,
            appUrl:        APP_URL,
            unsubscribeUrl,
          }

    const builder = action === 'event_join_confirmation' ? eventRegistrationTemplate : eventCancellationTemplate
    const templateName = action === 'event_join_confirmation' ? 'event_registration' : 'event_cancellation'
    const { subject, html } = builder(templateData)

    const { resendId, sendError } = await sendOne(resend, toEmail, subject, html)
    await admin.from('email_logs').insert({
      user_id:   user.id,
      recipient: toEmail,
      template:  templateName,
      subject,
      status:    sendError ? 'failed' : 'sent',
      error:     sendError ? (sendError.message || JSON.stringify(sendError)) : null,
      resend_id: resendId,
    })

    if (sendError) return res.status(502).json({ error: sendError.message || 'send failed' })
    return res.status(200).json({ id: resendId, status: 'sent', action })
  }

  // ── Host fan-out: event_cancel_notification ──────────────
  if (event.host_user_id !== user.id) {
    return res.status(403).json({ error: 'only the event host can send cancellation notifications' })
  }

  const { data: attendeeRows } = await admin
    .from('event_attendees')
    .select('user_id')
    .eq('event_id', event.id)

  const attendeeIds = (attendeeRows || []).map(r => r.user_id).filter(id => id !== user.id)
  if (attendeeIds.length === 0) {
    return res.status(200).json({ sent: 0, failed: 0, errors: [], action })
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name, email, email_subscribed')
    .in('id', attendeeIds)

  const targets = (profiles || []).filter(p => p.email)

  let sent = 0, failed = 0
  const errors = []
  let isFirst = true

  for (const target of targets) {
    if (!isFirst) await sleep(SEND_INTERVAL_MS)
    isFirst = false

    const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(target.id, process.env.SUPABASE_SERVICE_ROLE_KEY))}`

    const { subject, html } = eventCancellationTemplate({
      displayName:        firstName(target.name) || firstName(target.email.split('@')[0]) || 'there',
      mode:               'host',
      eventTitle:         event.title,
      eventStartAt:       event.start_at,
      eventLocation:      event.location,
      hostName:           event.host_display_name,
      cancellationReason: event.cancellation_reason,
      eventUrl,
      appUrl:             APP_URL,
      unsubscribeUrl,
    })

    const { resendId, sendError } = await sendOne(resend, target.email, subject, html)
    if (sendError) { failed++; errors.push({ recipient: target.email, error: sendError.message || String(sendError) }) }
    else           { sent++ }

    await admin.from('email_logs').insert({
      user_id:   target.id,
      recipient: target.email,
      template:  'event_cancellation',
      subject,
      status:    sendError ? 'failed' : 'sent',
      error:     sendError ? (sendError.message || JSON.stringify(sendError)) : null,
      resend_id: resendId,
    })
  }

  return res.status(200).json({ sent, failed, errors: errors.slice(0, 20), action })
}

// ─────────────────────────────────────────────────────────────
// Legacy template-based single send (welcome + admin ops)
// ─────────────────────────────────────────────────────────────

async function handleTemplateSend({ body, user, admin, APP_URL, RESEND_KEY, res }) {
  const { template, to, data: extraData = {} } = body
  if (!template || !to)       return res.status(400).json({ error: 'template and to are required' })
  if (!TEMPLATES[template])   return res.status(400).json({ error: `unknown template: ${template}` })
  if (typeof to !== 'string') return res.status(400).json({ error: 'to must be a string (use /api/broadcast for multi-recipient)' })

  const cfg = TEMPLATES[template]
  const callerIsAdmin = isAdmin(user.email)
  const sendingToSelf = to.toLowerCase().trim() === (user.email || '').toLowerCase().trim()

  if (!sendingToSelf && !callerIsAdmin) {
    return res.status(403).json({ error: 'you can only send to your own email (admin required for other recipients)' })
  }

  const { data: recipientProfile } = await admin
    .from('profiles')
    .select('id, email, email_subscribed')
    .ilike('email', to.trim())
    .maybeSingle()

  const recipientUserId = recipientProfile?.id || (sendingToSelf ? user.id : null)

  if (!cfg.transactional && recipientProfile?.email_subscribed === false) {
    await admin.from('email_logs').insert({
      user_id:   recipientUserId,
      recipient: to,
      template,
      subject:   null,
      status:    'failed',
      error:     'recipient unsubscribed',
      resend_id: null,
    })
    return res.status(200).json({ skipped: true, reason: 'recipient_unsubscribed' })
  }

  if (cfg.dedupe && recipientUserId) {
    const { data: existing } = await admin
      .from('email_logs')
      .select('id')
      .eq('user_id', recipientUserId)
      .eq('template', template)
      .eq('status', 'sent')
      .limit(1)
    if (existing && existing.length > 0) {
      return res.status(200).json({ skipped: true, reason: 'already_sent', existing_log_id: existing[0].id })
    }
  }

  const unsubscribeUrl = recipientUserId
    ? `${APP_URL.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(recipientUserId, process.env.SUPABASE_SERVICE_ROLE_KEY))}`
    : null

  const { subject, html } = cfg.build({
    displayName: extraData.displayName || recipientProfile?.email?.split('@')[0] || 'there',
    userEmail:   to,
    appUrl:      APP_URL,
    unsubscribeUrl,
    ...extraData,
  })

  if (!subject || !html) {
    return res.status(500).json({ error: 'template builder returned empty output' })
  }

  const resend = new Resend(RESEND_KEY)
  const { resendId, sendError } = await sendOne(resend, to, subject, html)

  await admin.from('email_logs').insert({
    user_id:   recipientUserId,
    recipient: to,
    template,
    subject,
    status:    sendError ? 'failed' : 'sent',
    error:     sendError ? (sendError.message || JSON.stringify(sendError)) : null,
    resend_id: resendId,
  })

  if (sendError) {
    return res.status(502).json({ error: sendError.message || 'send failed', detail: sendError })
  }
  return res.status(200).json({ id: resendId, status: 'sent' })
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function sendOne(resend, toEmail, subject, html) {
  let resendId = null, sendError = null
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to: [toEmail], subject, html })
    if (error) sendError = error
    else       resendId = data?.id || null
  } catch (err) {
    sendError = { message: err?.message || String(err) }
  }
  return { resendId, sendError }
}

function firstName(s) {
  return String(s || '').trim().split(/\s+/)[0] || ''
}
