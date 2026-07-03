// Vercel serverless function — GET /api/unsubscribe?token=...
//
// Public endpoint (no auth) — called when a user clicks the
// unsubscribe link in any Reciring email. The token is HMAC-signed
// using SUPABASE_SERVICE_ROLE_KEY, so we can verify the recipient
// without requiring them to be logged in.
//
// On success: flips profiles.email_subscribed to false and returns
// an HTML confirmation page styled to match Reciring's aesthetic.
// On failure: returns a 400 HTML page with a brief error.

import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from './_lib/unsubscribe-token.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(405).send(errorPage('Invalid request method.'))
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(500).send(errorPage('Server is not configured for unsubscribe.'))
  }

  const token = (req.query?.token || '').toString()
  const userId = verifyUnsubscribeToken(token, SERVICE_KEY)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (!userId) {
    return res.status(400).send(errorPage('This unsubscribe link is invalid or expired.'))
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Idempotent — already-false rows just return unchanged.
  const { data, error } = await admin
    .from('profiles')
    .update({ email_subscribed: false })
    .eq('id', userId)
    .select('email, email_subscribed')
    .maybeSingle()

  if (error) {
    return res.status(500).send(errorPage('We could not update your preferences. Please try again later.'))
  }

  if (!data) {
    return res.status(404).send(errorPage('We could not find your account.'))
  }

  // Append to audit log. Best-effort — don't fail the user-facing page
  // if the insert errors (the flag is already updated, which is what
  // matters for compliance).
  await admin
    .from('email_subscriptions')
    .insert({
      user_id:  userId,
      status:   'unsubscribed',
      source:   'user_unsubscribe_link',
      acted_by: userId,
    })
    .then(({ error: logErr }) => {
      if (logErr) console.warn('[unsubscribe] audit log insert failed:', logErr.message)
    })

  return res.status(200).send(confirmationPage(data.email))
}

// ── HTML pages ─────────────────────────────────────────────

function shell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} · Reciring</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background: #EEE9E0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .card {
    background: #FFFFFF;
    border-radius: 24px;
    max-width: 480px; width: 100%;
    padding: 40px 36px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.08);
    text-align: center;
    overflow: hidden;
    position: relative;
  }
  .accent {
    position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, #E6D3A3 0%, #C8A96A 50%, #A88245 100%);
  }
  h1 {
    font-family: "Playfair Display", Georgia, serif;
    font-size: 24px; font-weight: 500; color: #A88245;
    margin: 0 0 12px;
  }
  p { font-size: 14px; line-height: 1.55; color: #6B7280; margin: 0 0 10px; }
  .email { color: #111111; font-weight: 600; }
  a {
    display: inline-block; margin-top: 18px;
    padding: 12px 28px; background: linear-gradient(135deg, #C8A96A, #A88245);
    color: #FFFFFF; text-decoration: none; border-radius: 12px;
    font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="accent"></div>
    ${bodyHtml}
  </div>
</body>
</html>`
}

function confirmationPage(email) {
  return shell('Unsubscribed', `
    <p style="font-size:36px; margin:0 0 14px;">📭</p>
    <h1>You're unsubscribed</h1>
    <p>We've stopped sending non-essential emails to <span class="email">${escapeHtml(email)}</span>.</p>
    <p>Account-related and transactional emails (security, password resets) will still reach you.</p>
    <p>Changed your mind? Update your preferences in your profile settings.</p>
    <a href="https://reciring.com">Back to Reciring</a>
  `)
}

function errorPage(message) {
  return shell('Unsubscribe failed', `
    <p style="font-size:36px; margin:0 0 14px;">⚠️</p>
    <h1>Something went wrong</h1>
    <p>${escapeHtml(message)}</p>
    <a href="https://reciring.com">Back to Reciring</a>
  `)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
