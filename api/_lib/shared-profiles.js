import { buildProfileContext } from '../../src/lib/askMutuProfile.js'

async function readAll(query) {
  const data = []
  for (let offset = 0; ; offset += 500) {
    const result = await query().range(offset, offset + 499)
    if (result.error) return { data: [], error: result.error }
    data.push(...(result.data || []))
    if ((result.data || []).length < 500) return { data, error: null }
  }
}

// The same explicit accepted reveal that enables ChatView's Show profile.
// Do not use Recently met filtering, practice counts, Buddy names or public
// names as a substitute for this permission. No profile directory is fetched.
export async function readSharedProfiles(client, userId) {
  if (!userId) return { data: [], error: new Error('Please sign in.') }
  try {
    const [matches, blocks] = await Promise.all([
      readAll(() => client.from('matches')
        .select('id, requester_user_id, helper_user_id, status, identity_reveal_status')
        .or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`)
        .eq('identity_reveal_status', 'accepted').order('id')),
      readAll(() => client.from('blocks').select('blocker_id, blocked_user_id')
        .or(`blocker_id.eq.${userId},blocked_user_id.eq.${userId}`).order('blocker_id').order('blocked_user_id')),
    ])
    if (matches.error || blocks.error) return { data: [], error: matches.error || blocks.error }
    const blocked = new Set((blocks.data || []).map(row => row.blocker_id === userId ? row.blocked_user_id : row.blocker_id))
    const allowed = new Set()
    for (const row of matches.data || []) {
      if (row.identity_reveal_status !== 'accepted' || !['active', 'completed'].includes(row.status)) continue
      const peer = row.requester_user_id === userId ? row.helper_user_id
        : row.helper_user_id === userId ? row.requester_user_id : null
      if (peer && peer !== userId && !blocked.has(peer)) allowed.add(peer)
    }
    if (!allowed.size) return { data: [], error: null }
    // Batch the authorized ids, retaining every shared profile (not just the
    // first API page). Only the allowlisted profile fields leave this module.
    const ids = [...allowed]
    const rows = []
    for (let i = 0; i < ids.length; i += 100) {
      const result = await client.from('profiles').select('*').in('id', ids.slice(i, i + 100))
      if (result.error) return { data: [], error: result.error }
      rows.push(...(result.data || []))
    }
    const unique = new Map()
    for (const row of rows) {
      if (!allowed.has(row.id)) continue
      const profile = buildProfileContext(row)
      unique.set(row.id, { peerId: row.id, name: profile.name || 'Member', profile })
    }
    return { data: [...unique.values()].sort((a, b) => a.name.localeCompare(b.name)), error: null }
  } catch (error) { return { data: [], error } }
}

