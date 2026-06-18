import { supabase, isSupabaseConfigured } from './supabase'

// Internal: fetch profiles for a set of user ids and return a Map for
// quick lookup. Used by both fetch / send to stitch sender info onto
// raw event_messages rows without depending on a PostgREST FK between
// event_messages.sender_user_id and public.profiles.id (the actual
// FK points at auth.users, so embedded joins like `sender:profiles(...)`
// silently break — manual stitch is reliable).
async function fetchProfilesByIds(userIds) {
  if (!userIds || userIds.length === 0) return new Map()
  const { data } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds)
  return new Map((data || []).map(p => [p.id, p]))
}

function shapeMessage(row, profileById) {
  const profile = profileById.get(row.sender_user_id)
  return {
    id:         row.id,
    event_id:   row.event_id,
    sender_id:  row.sender_user_id,
    body:       row.body,
    created_at: row.created_at,
    sender_name:   profile?.name || 'Member',
    sender_avatar: profile?.avatar_url || null,
  }
}

/**
 * Fetch all messages in an event's group thread, oldest first.
 * Stitches the sender's profile (name + avatar) in a second query.
 */
export async function fetchEventMessages(eventId) {
  if (!isSupabaseConfigured) return { data: [], error: null }
  if (!eventId)              return { data: [], error: new Error('missing event id') }

  const { data: rows, error } = await supabase
    .from('event_messages')
    .select('id, event_id, sender_user_id, body, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error)                       return { data: [], error }
  if (!rows || rows.length === 0)  return { data: [], error: null }

  const senderIds = [...new Set(rows.map(r => r.sender_user_id))]
  const byId = await fetchProfilesByIds(senderIds)

  return { data: rows.map(r => shapeMessage(r, byId)), error: null }
}

/**
 * Post a message in an event's group thread. RLS guarantees the
 * sender is a current attendee or the host AND that sender_user_id
 * matches auth.uid().
 *
 * Returns the inserted message with sender info already stitched so
 * the caller can append it directly without an extra round-trip.
 */
export async function sendEventMessage(eventId, userId, body) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  if (!eventId || !userId)   return { data: null, error: new Error('missing event or user') }

  const trimmed = String(body || '').trim()
  if (!trimmed) return { data: null, error: new Error('Message cannot be empty') }

  const { data: row, error } = await supabase
    .from('event_messages')
    .insert({
      event_id:       eventId,
      sender_user_id: userId,
      body:           trimmed.slice(0, 2000),
    })
    .select('id, event_id, sender_user_id, body, created_at')
    .single()

  if (error) return { data: null, error }

  const byId = await fetchProfilesByIds([userId])
  return { data: shapeMessage(row, byId), error: null }
}

/**
 * Subscribe to new messages in a specific event's thread. Returns the
 * Supabase channel — caller must removeChannel on cleanup.
 *
 * Only INSERT events; we don't yet support edits/deletes from realtime
 * (delete-via-realtime would need a second listener and the UI doesn't
 * surface deletions yet).
 */
export function subscribeEventMessages(eventId, onInsert) {
  if (!isSupabaseConfigured || !eventId) return null

  const channel = supabase
    .channel(`event-msg-${eventId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'event_messages',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => onInsert?.(payload.new),
    )
    .subscribe()

  return channel
}
