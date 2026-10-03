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


// A specific chat can open either an explicitly shared profile or the full
// profile of a Public member you are matched with. A named post is not
// consent to reveal a private full profile.
export async function readChatProfile(client, userId, matchId) {
  const missing = { status: 404, error: 'This profile is unavailable.' }
  const failed = { status: 503, error: 'The profile could not load. Please try again.' }
  const matchResult = await client.from('matches').select('id, requester_user_id, helper_user_id, status, identity_reveal_status, source, post_id').eq('id', matchId).maybeSingle()
  if (matchResult.error) return failed
  const match = matchResult.data
  if (!match || !['active', 'completed'].includes(match.status)) return missing
  const peerId = match.requester_user_id === userId ? match.helper_user_id : match.helper_user_id === userId ? match.requester_user_id : null
  if (!peerId || peerId === userId) return missing
  const blocked = await client.from('blocks').select('blocker_id').or(`and(blocker_id.eq.${userId},blocked_user_id.eq.${peerId}),and(blocker_id.eq.${peerId},blocked_user_id.eq.${userId})`).limit(1)
  if (blocked.error) return failed
  if (blocked.data?.length) return missing
  const result = await client.from('profiles').select('*').eq('id', peerId).maybeSingle()
  if (result.error) return failed
  if (!result.data) return missing
  const row = result.data
  const shared = match.identity_reveal_status === 'accepted'
  // Once two people are matched and have a conversation, a member who chose
  // a Public profile is fully visible to their match, school email included.
  // Exception: if they reached out through an anonymous post, that choice
  // wins until they accept a reveal. Private members still need a reveal.
  let publicAccess = false
  if (!shared && row.visibility === 'public') {
    publicAccess = true
    if ((match.source || 'post') === 'post' && match.post_id) {
      const post = await client.from('posts').select('created_by, is_anonymous').eq('id', match.post_id).maybeSingle()
      if (post.error) return failed
      publicAccess = Boolean(post.data && !(post.data.created_by === peerId && post.data.is_anonymous === true))
    }
  }
  if (!shared && !publicAccess) return { status: 403, error: 'Their full profile has not been shared yet.', code: 'profile_sharing_required' }
  const profile = pickProfileFields(row)
  if (row.email) profile.email = row.email
  return { status: 200, profile, access: shared ? 'shared' : 'connected' }
}

// Full member-authored profile, without AI length limits or account metadata.
// Contact details are never part of this list: email is added only inside a
// matched conversation (readChatProfile), never on the public route.
const PROFILE_FIELDS = ['name', 'avatar_url', 'program', 'graduation_year', 'location', 'career_stage', 'title', 'company', 'professional_headline', 'headline', 'industries_known', 'industries_exploring', 'industry_interests', 'expertise_offered', 'help_wanted', 'can_help_with', 'skills_to_learn', 'personal_interests', 'activity_preferences', 'helping_preferences', 'networking_intent', 'prompt_ask_me', 'prompt_weekend', 'prompt_seeking']
function pickProfileFields(row) {
  return Object.fromEntries(PROFILE_FIELDS.filter(key => row[key] != null).map(key => [key, row[key]]))
}

// Any surface that names a member (Home, Give & Ask, events, My Circle) can
// open that member's profile, but ONLY when they chose a Public profile.
// Private members get the same 404 as a missing account, so this route never
// confirms that a private person exists. Blocks are checked both ways first.
export async function readPublicProfile(client, userId, peerId) {
  const missing = { status: 404, error: 'This profile is not public.' }
  const failed = { status: 503, error: 'The profile could not load. Please try again.' }
  if (!userId || !peerId || peerId === userId) return missing
  const blocked = await client.from('blocks').select('blocker_id').or(`and(blocker_id.eq.${userId},blocked_user_id.eq.${peerId}),and(blocker_id.eq.${peerId},blocked_user_id.eq.${userId})`).limit(1)
  if (blocked.error) return failed
  if (blocked.data?.length) return missing
  const result = await client.from('profiles').select('*').eq('id', peerId).maybeSingle()
  if (result.error) return failed
  if (!result.data || result.data.visibility !== 'public' || !String(result.data.name || '').trim()) return missing
  return { status: 200, profile: pickProfileFields(result.data), access: 'public' }
}
