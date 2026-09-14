import { createClient } from '@supabase/supabase-js'
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized.' })
  if (process.env.BUDDY_CRON_ENABLED !== 'true') return res.status(200).json({ skipped: true })
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(503).json({ error: 'Buddy reminders are not configured.' })
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await client.rpc('buddy_tick')
  if (error) return res.status(500).json({ error: 'Buddy reminder sweep failed.' })
  return res.status(200).json({ success: true })
}
