// Vercel serverless function — POST /api/send-email
//
// Single-recipient send. Used for transactional emails (welcome, etc.)
// and for admins sending one-off messages. Multi-recipient broadcasts
// go through /api/broadcast.
//
// Authorization model:
//   - Anyone can send to themselves     (welcome trigger)
//   - Admins can send to anyone         (one-off ops)
//
// Guards:
//   - 'welcome' template is deduped: at most one successful send per user
//   - Marketing templates respect profiles.email_subscribed
//   - 'welcome' is treated as TRANSACTIONAL — sent regardless of subscribed flag
//
// Required Vercel env vars:
//   RESEND_API_KEY              — Resend API token
//   VITE_SUPABASE_URL           — same value the client uses
//   VITE_SUPABASE_ANON_KEY      — same value the client uses
//   SUPABASE_SERVICE_ROLE_KEY   — service role for log + unsubscribe-token secret

import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { welcomeTemplate } from './templates/welcome.js'
import { isAdmin } from './lib/admin.js'
import { makeUnsubscribeToken } from './lib/unsubscribe-token.js'

const FROM = 'Reciring Team <hello@reciring.com>'

// Map template id → builder. Mark which are transactional (always send,
// regardless of unsubscribe flag, never deduped). Transactional emails
// are user-initiated or signup-related; marketing emails are not.
const TEMPLATES = {
  welcome: { build: welcomeTemplate, transactional: true,  dedupe: true  },
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
  const APP_URL      = process.env.APP_URL || 'https://reciring.com'

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !RESEND_KEY) {
    return res.status(500).json({
      error: 'server not configured',
      detail: 'check RESEND_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY',
    })
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
  const { template, to, data: extraData = {} } = req.body || {}
  if (!template || !to)       return res.status(400).json({ error: 'template and to are required' })
  if (!TEMPLATES[template])   return res.status(400).json({ error: `unknown template: ${template}` })
  if (typeof to !== 'string') return res.status(400).json({ error: 'to must be a string (use /api/broadcast for multi-recipient)' })

  const cfg = TEMPLATES[template]
  const callerIsAdmin = isAdmin(user.email)
  const sendingToSelf = to.toLowerCase().trim() === (user.email || '').toLowerCase().trim()

  if (!sendingToSelf && !callerIsAdmin) {
    return res.status(403).json({ error: 'you can only send to your own email (admin required for other recipients)' })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // 3. Resolve recipient's user_id + subscription status
  //    Needed for: dedupe lookup, unsubscribe check, unsubscribe token generation
  const { data: recipientProfile } = await admin
    .from('profiles')
    .select('id, email, email_subscribed')
    .ilike('email', to.trim())
    .maybeSingle()

  const recipientUserId = recipientProfile?.id || (sendingToSelf ? user.id : null)

  // 4. Unsubscribe gate — only for non-transactional templates
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

  // 5. Dedupe gate — at-most-once for templates that opt in (e.g. welcome)
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

  // 6. Build template
  const unsubscribeUrl = recipientUserId
    ? `${APP_URL.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(recipientUserId, SERVICE_KEY))}`
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

  // 7. Send via Resend
  const resend = new Resend(RESEND_KEY)
  let resendId = null
  let sendError = null
  try {
    const { data, error } = await resend.emails.send({
      from: FROM, to: [to], subject, html,
    })
    if (error) sendError = error
    else       resendId = data?.id || null
  } catch (err) {
    sendError = { message: err?.message || String(err) }
  }

  // 8. Log every attempt
  const status = sendError ? 'failed' : 'sent'
  await admin.from('email_logs').insert({
    user_id:   recipientUserId,
    recipient: to,
    template,
    subject,
    status,
    error:     sendError ? (sendError.message || JSON.stringify(sendError)) : null,
    resend_id: resendId,
  })

  if (sendError) {
    return res.status(502).json({ error: sendError.message || 'send failed', detail: sendError })
  }

  return res.status(200).json({ id: resendId, status: 'sent' })
}
