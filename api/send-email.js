// Vercel serverless function — POST /api/send-email
//
// Wraps the Resend SDK so RESEND_API_KEY never reaches the browser.
// The caller authenticates with a Supabase JWT in the Authorization
// header; we resolve auth.uid() server-side and (for now) only allow
// users to send to their own email. Slice B will extend this with
// an admin path for broadcasts.
//
// Required Vercel env vars:
//   RESEND_API_KEY              — Resend API token
//   VITE_SUPABASE_URL           — same value the client uses (set at build)
//   VITE_SUPABASE_ANON_KEY      — same value the client uses
//   SUPABASE_SERVICE_ROLE_KEY   — service role for writing email_logs
//
// All sends are logged to public.email_logs (status: sent | failed).

import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { welcomeTemplate } from './templates/welcome.js'

const FROM = 'Reciring Team <hello@reciring.com>'

// Map template id → builder function. Add new templates here.
const TEMPLATES = {
  welcome: welcomeTemplate,
}

export default async function handler(req, res) {
  // CORS — Vercel functions and the React SPA are served from the
  // same domain in production, so CORS is mostly a no-op, but we
  // set the headers explicitly so dev / preview deploys also work.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method not allowed' })

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const RESEND_KEY   = process.env.RESEND_API_KEY

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !RESEND_KEY) {
    return res.status(500).json({
      error: 'server not configured',
      detail: 'check RESEND_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY',
    })
  }

  // ── 1. Verify the caller's JWT ─────────────────────────────
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'missing token' })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return res.status(401).json({ error: 'invalid token' })

  // ── 2. Validate body ───────────────────────────────────────
  const { template, to, data: extraData = {} } = req.body || {}
  if (!template || !to)              return res.status(400).json({ error: 'template and to are required' })
  if (!TEMPLATES[template])          return res.status(400).json({ error: `unknown template: ${template}` })
  if (typeof to !== 'string')        return res.status(400).json({ error: 'to must be a string' })

  // Slice A: users may only send to themselves. Slice B will add an
  // admin path that bypasses this check after verifying admin role.
  if (to.toLowerCase().trim() !== (user.email || '').toLowerCase().trim()) {
    return res.status(403).json({ error: 'you can only send to your own email' })
  }

  // ── 3. Build the email from the template ───────────────────
  const builder = TEMPLATES[template]
  const { subject, html } = builder({
    displayName: extraData.displayName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'there',
    userEmail:   user.email,
    appUrl:      process.env.APP_URL || 'https://reciring.com',
    ...extraData,
  })

  if (!subject || !html) {
    return res.status(500).json({ error: 'template builder returned empty output' })
  }

  // ── 4. Send via Resend ─────────────────────────────────────
  const resend = new Resend(RESEND_KEY)
  const admin  = createClient(SUPABASE_URL, SERVICE_KEY)

  let resendId = null
  let sendError = null
  try {
    const { data, error } = await resend.emails.send({
      from:    FROM,
      to:      [to],
      subject,
      html,
    })
    if (error) sendError = error
    else       resendId = data?.id || null
  } catch (err) {
    sendError = { message: err?.message || String(err) }
  }

  // ── 5. Log every attempt (success OR failure) ──────────────
  const status = sendError ? 'failed' : 'sent'
  await admin.from('email_logs').insert({
    user_id:   user.id,
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
