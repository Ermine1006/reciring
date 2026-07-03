// Vercel serverless function — POST /api/admin/subscription
//
// Admin-only. Resubscribes or unsubscribes a user by email address,
// then logs the event to public.email_subscriptions for audit.
//
// Body:
//   { email: string, action: 'subscribe' | 'unsubscribe', notes?: string }
//
// Returns:
//   { ok: true, user_id, email, status }   on success
//   { error: '...' }                       on failure
//
// Lookup is case-insensitive on the email column. If the user has
// no profile row, returns 404 — we don't create stub rows.

import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '../_lib/admin.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method not allowed' })

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return res.status(500).json({ error: 'server not configured' })
  }

  // 1. Verify caller is admin
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'missing token' })

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user)      return res.status(401).json({ error: 'invalid token' })
  if (!isAdmin(user.email))  return res.status(403).json({ error: 'admin required' })

  // 2. Validate body
  const { email, action, notes } = req.body || {}
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'email is required' })
  }
  if (action !== 'subscribe' && action !== 'unsubscribe') {
    return res.status(400).json({ error: "action must be 'subscribe' or 'unsubscribe'" })
  }

  const targetEmail = email.trim().toLowerCase()
  const newFlag = action === 'subscribe'
  const newStatus = action === 'subscribe' ? 'subscribed' : 'unsubscribed'
  const source = action === 'subscribe' ? 'admin_resubscribe' : 'admin_unsubscribe'

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // 3. Look up target user
  const { data: target, error: lookupErr } = await admin
    .from('profiles')
    .select('id, email, email_subscribed')
    .ilike('email', targetEmail)
    .maybeSingle()

  if (lookupErr) return res.status(500).json({ error: 'lookup failed', detail: lookupErr.message })
  if (!target)   return res.status(404).json({ error: `no user found with email ${targetEmail}` })

  // 4. Update profiles flag (idempotent — already-matching writes are fine)
  const { error: updateErr } = await admin
    .from('profiles')
    .update({ email_subscribed: newFlag })
    .eq('id', target.id)

  if (updateErr) return res.status(500).json({ error: 'profile update failed', detail: updateErr.message })

  // 5. Append to audit log
  const { error: logErr } = await admin
    .from('email_subscriptions')
    .insert({
      user_id:  target.id,
      status:   newStatus,
      source,
      acted_by: user.id,
      notes:    typeof notes === 'string' ? notes.slice(0, 500) : null,
    })

  if (logErr) {
    // Don't fail the whole request — the flag is already updated. Just warn.
    console.warn('[admin/subscription] audit log insert failed:', logErr.message)
  }

  return res.status(200).json({
    ok:        true,
    user_id:   target.id,
    email:     target.email,
    status:    newStatus,
    previous:  target.email_subscribed ? 'subscribed' : 'unsubscribed',
  })
}
