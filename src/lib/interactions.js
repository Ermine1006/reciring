import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Fetch all of the current user's post interactions as a Map.
 * Returns { data: Map<postId, type>, error }.
 *
 * Reading this on app load and after each new write keeps the Discover
 * ranker in sync with persistent state across refreshes and tab switches.
 */
export async function fetchUserInteractions(userId) {
  if (!isSupabaseConfigured || !userId) return { data: new Map(), error: null }

  const { data, error } = await supabase
    .from('post_interactions')
    .select('post_id, interaction_type')
    .eq('user_id', userId)

  if (error) return { data: new Map(), error }
  const map = new Map()
  for (const row of (data || [])) {
    map.set(row.post_id, row.interaction_type)
  }
  return { data: map, error: null }
}

/**
 * Upsert a single (user, post) interaction.
 *
 * Priority order (caller is responsible for not downgrading):
 *   swiped_left > viewed > none
 *
 * The caller should check the current local map and skip the call if
 * the requested type is a downgrade (e.g. user already swiped_left a
 * post and now they're tapping it — don't overwrite with 'viewed').
 */
export async function recordPostInteraction(userId, postId, type) {
  if (!isSupabaseConfigured)          return { error: new Error('Supabase not configured.') }
  if (!userId || !postId)             return { error: new Error('missing args') }
  if (!['viewed','swiped_left'].includes(type)) {
    return { error: new Error(`invalid interaction type: ${type}`) }
  }

  const { error } = await supabase
    .from('post_interactions')
    .upsert(
      {
        user_id:             userId,
        post_id:             postId,
        interaction_type:    type,
        last_interaction_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,post_id' },
    )

  return { error }
}
