import { createClient } from '@supabase/supabase-js'
import { readSharedProfiles, readChatProfile } from './_lib/shared-profiles.js'

// Read only. Authenticated identity is the ONLY source of viewer id. The server
// checks blocks both ways without exposing another person's block list, which
// client RLS intentionally does not allow a blocked user to read.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers?.authorization || '')?.[1]
  if (!token) return res.status(401).json({ error: 'Please sign in.' })
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(503).json({ error: 'Shared profiles are unavailable right now.' })
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data?.user?.id) return res.status(401).json({ error: 'Please sign in again.' })
    if (req.query?.matchId !== undefined) {
      const id = req.query.matchId
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({ error: 'Invalid conversation.' })
      const result = await readChatProfile(client, data.user.id, id)
      return res.status(result.status).json(result.status === 200 ? { profile: result.profile, access: result.access } : { error: result.error, ...(result.code ? { code: result.code } : {}) })
    }
    const profiles = await readSharedProfiles(client, data.user.id)
    if (profiles.error) return res.status(503).json({ error: 'Shared profiles could not load. Please try again.' })
    return res.status(200).json({ profiles: profiles.data })
  } catch { return res.status(503).json({ error: 'Shared profiles could not load. Please try again.' }) }
}
