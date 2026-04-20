import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Create a match: the current user (helper) picks up a post.
 * Returns { data: matchRow, error }
 */
export async function createMatch(helperUserId, post) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }

  const { data, error } = await supabase
    .from('matches')
    .insert({
      post_id:           post.id,
      requester_user_id: post.created_by,
      helper_user_id:    helperUserId,
    })
    .select()
    .single()

  return { data, error }
}

/**
 * Fetch all ACTIVE matches for the current user (as requester or helper).
 * Joins the related post so the UI can show the request context.
 * Returns { data: [matchRow], error }
 */
export async function fetchMyMatches(userId) {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('matches')
    .select(`
      *,
      post:posts (
        id, need_text, offer_text, help_type, industry_tag,
        time_commitment, urgency, created_by
      )
    `)
    .or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`)
    .neq('status', 'unmatched')
    .order('created_at', { ascending: false })

  return { data: data || [], error }
}

/**
 * Fetch post IDs that have any active match involving the given user.
 * Used to hide already-matched posts from the Discover feed.
 */
export async function fetchMatchedPostIds(userId) {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('matches')
    .select('post_id')
    .or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`)
    .eq('status', 'active')

  if (error) return { data: [], error }
  return { data: (data || []).map(r => r.post_id), error: null }
}

/**
 * Unmatch — soft-delete by setting status to 'unmatched'.
 * Uses .select() to verify the row was actually updated (RLS can silently
 * block updates, returning no error but also no rows).
 */
export async function unmatchMatch(matchId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }

  const { data, error } = await supabase
    .from('matches')
    .update({ status: 'unmatched' })
    .eq('id', matchId)
    .select('id, status')

  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: new Error('Unmatch had no effect — the row was not updated. Check your DB CHECK constraint and RLS policies.') }
  }
  if (data[0].status !== 'unmatched') {
    return { error: new Error(`Status is "${data[0].status}" instead of "unmatched" — CHECK constraint may be blocking the value.`) }
  }
  return { error: null }
}

/**
 * Map a DB match row to the shape consumed by MatchesList / ChatView.
 */
export function matchToUI(row, currentUserId) {
  const isHelper = row.helper_user_id === currentUserId
  const peerId = isHelper ? row.requester_user_id : row.helper_user_id
  const post = row.post || {}

  return {
    id:              row.id,
    postId:          row.post_id,
    peerId,
    isHelper,
    status:          row.status,
    createdAt:       row.created_at,
    request: {
      id:       post.id,
      needs:    post.need_text,
      offers:   post.offer_text,
      category: post.help_type?.[0] || 'Other',
      tags:     [...(post.help_type || []), ...(post.industry_tag || [])],
      time:     post.time_commitment || '15 min',
      urgency:  post.urgency,
    },
  }
}
