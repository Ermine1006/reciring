import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Fetch all posts, newest first.
 * Returns objects shaped for the existing card UI:
 *   { id, created_by, needs, offers, category, tags, time, urgency, createdAt, poster }
 */
export async function fetchPosts() {
  if (!isSupabaseConfigured) return { data: null, error: null }

  // Try with profile join first for ranking data
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      creator:profiles ( total_points, meetings_scheduled, meetings_completed )
    `)
    .order('created_at', { ascending: false })

  // If the join fails (no FK relationship), fall back to plain select
  if (error) {
    console.warn('[ReciRing] Posts+profiles join failed, falling back:', error.message)
    const { data: plain, error: plainErr } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
    if (plainErr) return { data: null, error: plainErr }
    return { data: (plain || []).map(rowToCard), error: null }
  }

  return { data: (data || []).map(rowToCard), error: null }
}

/**
 * Create a new post linked to the current user.
 */
export async function createPost(userId, fields) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      created_by:      userId,
      need_text:       fields.needs,
      offer_text:      fields.offers,
      help_type:       fields.helpType   || [fields.category],
      industry_tag:    fields.industry   || [],
      time_commitment: fields.time       || '15 min',
      urgency:         fields.urgency    || null,
      is_anonymous:    true,
    })
    .select()
    .single()

  if (error) return { data: null, error }

  return { data: rowToCard(data), error: null }
}

/**
 * Update an existing post and republish it (reset created_at to now).
 * Only the author can update (RLS enforced).
 */
export async function updatePost(postId, userId, fields) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }

  const { data, error } = await supabase
    .from('posts')
    .update({
      need_text:       fields.need_text,
      offer_text:      fields.offer_text,
      help_type:       fields.help_type    || [],
      industry_tag:    fields.industry_tag  || [],
      time_commitment: fields.time_commitment || '15 min',
      urgency:         fields.urgency       || null,
      is_anonymous:    fields.is_anonymous ?? true,
      created_at:      new Date().toISOString(), // republish — move to top of feed
    })
    .eq('id', postId)
    .eq('created_by', userId)
    .select()
    .single()

  if (error) return { data: null, error }
  return { data: rowToCard(data), error: null }
}

/**
 * Map a raw DB row to the card shape expected by CardStack / RequestCard.
 */
export function rowToCard(row) {
  const creator = row.creator || {}
  return {
    id:           row.id,
    created_by:   row.created_by,
    needs:        row.need_text,
    offers:       row.offer_text,
    category:     row.help_type?.[0] || 'Other',
    tags:         [...(row.help_type || []), ...(row.industry_tag || [])],
    time:         row.time_commitment || '15 min',
    urgency:      row.urgency,
    createdAt:    formatRelative(row.created_at),
    createdAtRaw: row.created_at,   // ISO string for freshness scoring
    poster: {
      points:     creator.total_points       || 0,
      scheduled:  creator.meetings_scheduled || 0,
      completed:  creator.meetings_completed || 0,
      industries: row.industry_tag || [],
    },
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

export function formatRelative(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}
