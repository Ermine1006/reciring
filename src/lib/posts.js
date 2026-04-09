import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Fetch all posts, newest first.
 * Returns objects shaped for the existing card UI:
 *   { id, created_by, needs, offers, category, tags, time, urgency, createdAt, poster }
 */
export async function fetchPosts() {
  if (!isSupabaseConfigured) return { data: null, error: null }

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return { data: null, error }

  // Map DB rows → card shape expected by CardStack / RequestCard
  const mapped = data.map(row => ({
    id:         row.id,
    created_by: row.created_by,       // real user id — used by block/report
    needs:      row.need_text,
    offers:     row.offer_text,
    category:   row.help_type?.[0] || 'Other',
    tags:       [...(row.help_type || []), ...(row.industry_tag || [])],
    time:       row.time_commitment || '15 min',
    urgency:    row.urgency,
    createdAt:  formatRelative(row.created_at),
    poster:     { points: 0, scheduled: 0, completed: 0, industries: row.industry_tag || [] },
  }))

  return { data: mapped, error: null }
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

  // Return the card-shaped object so the caller can prepend to state
  const card = {
    id:         data.id,
    created_by: data.created_by,
    needs:      data.need_text,
    offers:     data.offer_text,
    category:   data.help_type?.[0] || 'Other',
    tags:       [...(data.help_type || []), ...(data.industry_tag || [])],
    time:       data.time_commitment || '15 min',
    urgency:    data.urgency,
    createdAt:  'Just now',
    poster:     { points: 0, scheduled: 0, completed: 0, industries: data.industry_tag || [] },
  }

  return { data: card, error: null }
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatRelative(isoString) {
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
