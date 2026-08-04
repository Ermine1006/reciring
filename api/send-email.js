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
import { eventReviewTemplate } from './_templates/event-review.js'
import { matchNotificationTemplate } from './_templates/match-notification.js'
import { isAdmin, REVIEW_NOTIFY_EMAILS } from './_lib/admin.js'
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
  'event_review_notification',
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

  // ── Route: new-match notification (notifies the OTHER participant) ──
  if (body.action === 'match_notification') {
    return handleMatchNotification({
      matchId: body.matchId,
      user, admin, APP_URL, RESEND_KEY, res,
    })
  }

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
    .select('id, title, description, start_at, location, host_user_id, host_display_name, cancellation_reason, moderation_status')
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

  // ── Admin review notification ────────────────────────────
  // Fired by the host right after creating a first event that landed in
  // review. Only the host may trigger it (anti-spam), and only while the
  // event is actually pending. Recipient is the admin allowlist.
  if (action === 'event_review_notification') {
    if (event.host_user_id !== user.id) {
      return res.status(403).json({ error: 'only the host can request review of their own event' })
    }
    if (event.moderation_status !== 'pending') {
      return res.status(200).json({ skipped: true, reason: 'not_pending', action })
    }

    // Host email, for the reviewer's context.
    const { data: hostProfile } = await admin
      .from('profiles')
      .select('email')
      .eq('id', event.host_user_id)
      .maybeSingle()

    const reviewUrl = APP_URL
    const { subject, html } = eventReviewTemplate({
      eventTitle:       event.title,
      eventStartAt:     event.start_at,
      eventLocation:    event.location,
      hostName:         event.host_display_name,
      hostEmail:        hostProfile?.email || user.email || '',
      eventDescription: event.description,
      reviewUrl,
      appUrl:           APP_URL,
    })

    let sent = 0, failed = 0
    const errors = []
    let isFirst = true
    for (const notifyEmail of REVIEW_NOTIFY_EMAILS) {
      if (!isFirst) await sleep(SEND_INTERVAL_MS)
      isFirst = false
      const { resendId, sendError } = await sendOne(resend, notifyEmail, subject, html)
      if (sendError) { failed++; errors.push({ recipient: notifyEmail, error: sendError.message || String(sendError) }) }
      else           { sent++ }
      await admin.from('email_logs').insert({
        user_id:   event.host_user_id,
        recipient: notifyEmail,
        template:  'event_review',
        subject,
        status:    sendError ? 'failed' : 'sent',
        error:     sendError ? (sendError.message || JSON.stringify(sendError)) : null,
        resend_id: resendId,
      })
    }
    return res.status(sent > 0 ? 200 : 502).json({ sent, failed, errors, action })
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
// New-match notification — emails the participant who did NOT
// trigger the match. Identity-safe: never names the other person.
// ─────────────────────────────────────────────────────────────

async function handleMatchNotification({ matchId, user, admin, APP_URL, RESEND_KEY, res }) {
  if (!matchId) return res.status(400).json({ error: 'matchId is required' })

  const { data: match, error: matchErr } = await admin
    .from('matches')
    .select('id, requester_user_id, helper_user_id, post_id, marketplace_post_id, event_id, status')
    .eq('id', matchId)
    .maybeSingle()
  if (matchErr) return res.status(500).json({ error: 'failed to load match', detail: matchErr.message })
  if (!match)   return res.status(404).json({ error: 'match not found' })

  // Caller must be a participant — prevents using this to email arbitrary users.
  if (user.id !== match.requester_user_id && user.id !== match.helper_user_id) {
    return res.status(403).json({ error: 'not a participant of this match' })
  }
  if (match.status && match.status !== 'active') {
    return res.status(200).json({ skipped: true, reason: 'not_active' })
  }

  const recipientId = user.id === match.requester_user_id ? match.helper_user_id : match.requester_user_id
  if (!recipientId || recipientId === user.id) {
    return res.status(200).json({ skipped: true, reason: 'no_recipient' })
  }

  const { data: recipient } = await admin
    .from('profiles')
    .select('id, name, email, email_subscribed')
    .eq('id', recipientId)
    .maybeSingle()

  const toEmail = recipient?.email
  if (!toEmail) return res.status(200).json({ skipped: true, reason: 'recipient_no_email' })

  // A notification, not a confirmation of the recipient's own action — respect
  // their unsubscribe preference.
  if (recipient.email_subscribed === false) {
    await admin.from('email_logs').insert({
      user_id: recipientId, recipient: toEmail, template: 'match_notification',
      subject: null, status: 'failed', error: 'recipient unsubscribed', resend_id: null,
    })
    return res.status(200).json({ skipped: true, reason: 'recipient_unsubscribed' })
  }

  // Short, NON-identifying context — only ever reference the recipient's OWN
  // post/offer (that's theirs to see); otherwise stay generic.
  let contextLine = ''
  if (match.post_id) {
    const { data: post } = await admin
      .from('posts').select('created_by, need_text, offer_text').eq('id', match.post_id).maybeSingle()
    if (post && post.created_by === recipientId) {
      const snippet = firstWords(post.need_text || post.offer_text, 12)
      contextLine = snippet ? `about your post: ${snippet}` : 'about your post'
    }
  } else if (match.marketplace_post_id) {
    const { data: mkt } = await admin
      .from('event_marketplace_posts').select('user_id, title').eq('id', match.marketplace_post_id).maybeSingle()
    if (mkt && mkt.user_id === recipientId) {
      const snippet = firstWords(mkt.title, 12)
      contextLine = snippet ? `about your Event Board post: ${snippet}` : 'about your Event Board post'
    } else {
      contextLine = 'on the Event Board'
    }
  }

  const displayName = firstName(recipient.name) || firstName(toEmail.split('@')[0]) || 'there'
  const matchUrl = `${APP_URL.replace(/\/$/, '')}/?tab=matches`
  const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(recipientId, process.env.SUPABASE_SERVICE_ROLE_KEY))}`

  const { subject, html } = matchNotificationTemplate({ displayName, contextLine, matchUrl, appUrl: APP_URL, unsubscribeUrl })

  const resend = new Resend(RESEND_KEY)
  const { resendId, sendError } = await sendOne(resend, toEmail, subject, html)
  await admin.from('email_logs').insert({
    user_id: recipientId, recipient: toEmail, template: 'match_notification',
    subject, status: sendError ? 'failed' : 'sent',
    error: sendError ? (sendError.message || JSON.stringify(sendError)) : null,
    resend_id: resendId,
  })
  if (sendError) return res.status(502).json({ error: sendError.message || 'send failed' })
  return res.status(200).json({ id: resendId, status: 'sent', action: 'match_notification' })
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

function firstWords(s, n) {
  const t = String(s || '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  const words = t.split(' ')
  return words.length <= n ? t : words.slice(0, n).join(' ') + '…'
}
