import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Fetch all messages in an event's group thread, oldest first.
 * Embeds the sender's profile (name + avatar) so the UI can render
 * bubbles without N+1 lookups.
 */
export async function fetchEventMessages(eventId) {
  if (!isSupabaseConfigured) return { data: [], error: null }
  if (!eventId)              return { data: [], error: new Error('missing event id') }

  const { data, error } = await supabase
    .from('event_messages')
    .select(`
      id, event_id, sender_user_id, body, created_at,
      sender:profiles ( id, name, avatar_url )
    `)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) return { data: [], error }
  return {
    data: (data || []).map(m => ({
      id:         m.id,
      event_id:   m.event_id,
      sender_id:  m.sender_user_id,
      body:       m.body,
      created_at: m.created_at,
      sender_name:   m.sender?.name || 'Member',
      sender_avatar: m.sender?.avatar_url || null,
    })),
    error: null,
  }
}

/**
 * Post a message in an event's group thread. RLS guarantees the
 * sender is a current attendee or the host AND that sender_user_id
 * matches auth.uid().
 */
export async function sendEventMessage(eventId, userId, body) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  if (!eventId || !userId)   return { data: null, error: new Error('missing event or user') }

  const trimmed = String(body || '').trim()
  if (!trimmed) return { data: null, error: new Error('Message cannot be empty') }

  const { data, error } = await supabase
    .from('event_messages')
    .insert({
      event_id:       eventId,
      sender_user_id: userId,
      body:           trimmed.slice(0, 2000),
    })
    .select(`
      id, event_id, sender_user_id, body, created_at,
      sender:profiles ( id, name, avatar_url )
    `)
    .single()

  if (error) return { data: null, error }
  return {
    data: {
      id:         data.id,
      event_id:   data.event_id,
      sender_id:  data.sender_user_id,
      body:       data.body,
      created_at: data.created_at,
      sender_name:   data.sender?.name || 'Member',
      sender_avatar: data.sender?.avatar_url || null,
    },
    error: null,
  }
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
