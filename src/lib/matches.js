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
 * Fetch all matches for the current user (as requester or helper).
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
    .order('created_at', { ascending: false })

  return { data: data || [], error }
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
