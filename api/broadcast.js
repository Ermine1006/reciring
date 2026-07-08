// Vercel serverless function — POST /api/broadcast
//
// Admin-only multi-recipient send. Used for announcements, feature
// updates, and (eventually) the weekly digest. NOT for transactional
// emails — those go through /api/send-email and are deduped.
//
// Body:
//   {
//     template: string,         // must be in TEMPLATES below
//     audience: 'all'           // OR an array of emails:
//     recipients: ['a@b', ...]  // explicit list (admin-curated)
//     data: { ... }             // template-specific data
//   }
//
// Behavior:
//   - Resolves the audience to a list of (user_id, email) tuples
//   - Skips users with email_subscribed = false (and logs the skip)
//   - Sends one email per recipient with a per-user unsubscribe token
//   - Logs every attempt (sent / failed / unsubscribed)
//   - Sends sequentially — at ~200 users, this comes in under 30s
//
// Returns: { sent: N, failed: M, unsubscribed: K, errors: [...] }

import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { welcomeTemplate } from './_templates/welcome.js'
import { broadcastMessageTemplate } from './_templates/broadcast-message.js'
import { eventsLaunchTemplate } from './_templates/events-launch.js'
import { isAdmin } from './_lib/admin.js'
import { makeUnsubscribeToken } from './_lib/unsubscribe-token.js'
import { EMAIL_FROM, APP_URL as APP_URL_FALLBACK } from '../src/lib/branding.js'

const FROM = EMAIL_FROM

// Resend free tier rate limit: 5 requests/sec. Sleep between sends
// to stay comfortably below (~4/sec). For larger lists (>50) this
// approaches Vercel's hobby-tier 10s function timeout — switch to
// the Resend batch API at that scale.
const SEND_INTERVAL_MS = 250

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Templates eligible for broadcast.
//   welcome           — sent via /api/send-email per signup; available
//                       here only for admin test sends.
//   broadcast_message — generic announcement template; admin supplies
//                       subject + body + eyebrow via the data field.
//   events_launch     — dedicated Events Launch announcement, fixed
//                       subject + body (premium product-update layout).
const TEMPLATES = {
  welcome:           welcomeTemplate,
  broadcast_message: broadcastMessageTemplate,
  events_launch:     eventsLaunchTemplate,
}

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
    return res.status(500).json({ error: 'server not configured' })
  }

  // 1. Verify caller JWT + admin
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'missing token' })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user)         return res.status(401).json({ error: 'invalid token' })
  if (!isAdmin(user.email))     return res.status(403).json({ error: 'admin required' })

  // 2. Validate body
  const { template, audience, recipients, data: extraData = {} } = req.body || {}
  if (!template)                return res.status(400).json({ error: 'template is required' })
  if (!TEMPLATES[template])     return res.status(400).json({ error: `unknown template: ${template}` })
  if (!audience && !recipients) return res.status(400).json({ error: 'either audience or recipients is required' })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // 3. Resolve audience → [{ user_id, email, email_subscribed }]
  let targets = []
  if (audience === 'all') {
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, email, email_subscribed')
      .not('email', 'is', null)
    if (error) return res.status(500).json({ error: 'failed to load audience', detail: error.message })
    targets = profiles || []
  } else if (Array.isArray(recipients)) {
    if (recipients.length === 0) return res.status(400).json({ error: 'recipients array is empty' })
    if (recipients.length > 500) return res.status(400).json({ error: 'max 500 recipients per request' })
    const cleaned = recipients
      .map(e => typeof e === 'string' ? e.trim() : null)
      .filter(Boolean)
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, email_subscribed')
      .in('email', cleaned)
    const byEmail = new Map((profiles || []).map(p => [p.email.toLowerCase(), p]))
    targets = cleaned.map(email => {
      const lower = email.toLowerCase()
      const p = byEmail.get(lower)
      return p || { id: null, email, email_subscribed: true }
    })
  } else {
    return res.status(400).json({ error: 'audience must be "all" or recipients must be an array' })
  }

  if (targets.length === 0) {
    return res.status(200).json({ sent: 0, failed: 0, unsubscribed: 0, errors: [] })
  }

  // 4. Iterate, send, log each
  const resend = new Resend(RESEND_KEY)
  const builder = TEMPLATES[template]

  let sent = 0
  let failed = 0
  let unsubscribed = 0
  const errors = []
  let isFirst = true

  for (const target of targets) {
    // Throttle: pause between sends to stay under Resend's 5/sec
    // rate limit. Skip the wait on the first iteration so a small
    // broadcast doesn't pay an unnecessary 250ms.
    if (!isFirst) await sleep(SEND_INTERVAL_MS)
    isFirst = false

    if (target.email_subscribed === false) {
      unsubscribed++
      await admin.from('email_logs').insert({
        user_id:   target.id,
        recipient: target.email,
        template,
        subject:   null,
        status:    'failed',
        error:     'recipient unsubscribed',
        resend_id: null,
      })
      continue
    }

    const unsubscribeUrl = target.id
      ? `${APP_URL.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(target.id, SERVICE_KEY))}`
      : null

    const { subject, html, text } = builder({
      displayName: extraData.displayName || target.email?.split('@')[0] || 'there',
      userEmail:   target.email,
      appUrl:      APP_URL,
      unsubscribeUrl,
      ...extraData,
    })

    let resendId = null
    let sendError = null
    try {
      // `text` is the auto-generated plain-text fallback when a template
      // returns one (block-based Custom emails). Resend keeps `text`
      // optional; omitting sends HTML-only, same as before.
      const payload = { from: FROM, to: [target.email], subject, html }
      if (text) payload.text = text
      const { data, error } = await resend.emails.send(payload)
      if (error) sendError = error
      else       resendId = data?.id || null
    } catch (err) {
      sendError = { message: err?.message || String(err) }
    }

    const status = sendError ? 'failed' : 'sent'
    if (sendError) {
      failed++
      errors.push({ recipient: target.email, error: sendError.message || String(sendError) })
    } else {
      sent++
    }

    await admin.from('email_logs').insert({
      user_id:   target.id,
      recipient: target.email,
      template,
      subject,
      status,
      error:     sendError ? (sendError.message || JSON.stringify(sendError)) : null,
      resend_id: resendId,
    })
  }

  return res.status(200).json({
    sent, failed, unsubscribed,
    errors: errors.slice(0, 20), // cap so the response stays small
  })
}
