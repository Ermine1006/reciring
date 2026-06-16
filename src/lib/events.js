import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Fetch upcoming events with attendee counts.
 *
 * Uses a single query with an embedded count aggregate so the UI gets
 * `attendee_count` per event without N+1. PostgREST returns it as
 * `event_attendees: [{ count }]` when we ask for `count` on the join.
 *
 * Sorted by soonest start time first.
 */
export async function fetchUpcomingEvents() {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, description, start_at, location, category,
      max_attendees, host_user_id, host_display_name, host_type,
      image_url, is_sponsored, created_at,
      event_attendees ( count )
    `)
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })

  if (error) return { data: [], error }
  return {
    data: (data || []).map(e => ({
      ...e,
      attendee_count: e.event_attendees?.[0]?.count || 0,
    })),
    error: null,
  }
}

/**
 * Fetch the event_ids the current user has joined. Used by the UI to
 * flip Join buttons to "Joined" and to drive the "My Events" filter.
 */
export async function fetchMyJoinedEventIds(userId) {
  if (!isSupabaseConfigured || !userId) return { data: new Set(), error: null }

  const { data, error } = await supabase
    .from('event_attendees')
    .select('event_id')
    .eq('user_id', userId)

  if (error) return { data: new Set(), error }
  return { data: new Set((data || []).map(r => r.event_id)), error: null }
}

/**
 * Create an event. The DB enforces host_user_id = auth.uid() via RLS.
 * `start_at` should be an ISO timestamp string (the form combines
 * its date + time inputs before calling here).
 */
export async function createEvent(fields) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { data: null, error: new Error('Not signed in') }

  const { data, error } = await supabase
    .from('events')
    .insert({
      title:             fields.title,
      description:       fields.description || '',
      start_at:          fields.start_at,
      location:          fields.location || '',
      category:          fields.category,
      max_attendees:     fields.max_attendees,
      host_user_id:      session.user.id,
      host_display_name: fields.host_display_name,
      host_type:         fields.host_type || 'individual',
      image_url:         fields.image_url || null,
      is_sponsored:      Boolean(fields.is_sponsored),
    })
    .select()
    .single()

  return { data, error }
}

/**
 * Join an event. The capacity trigger raises an exception if the
 * event is full, surfacing as a generic Supabase error. The UNIQUE
 * constraint surfaces dup joins as Postgres code 23505 — we map
 * both into clean user-facing messages.
 */
export async function joinEvent(eventId, userId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  if (!eventId || !userId)   return { error: new Error('missing event or user') }

  const { error } = await supabase
    .from('event_attendees')
    .insert({ event_id: eventId, user_id: userId })

  if (error) {
    if (error.code === '23505') return { error: new Error('You already joined this event') }
    if (/capacity/i.test(error.message || '')) return { error: new Error('This event is full') }
    return { error }
  }
  return { error: null }
}

/**
 * Leave an event (un-join). RLS allows users to delete only their own
 * attendee rows, so we don't need to filter by user_id explicitly,
 * but doing so is defensive against accidental misuse.
 */
export async function leaveEvent(eventId, userId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  const { error } = await supabase
    .from('event_attendees')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId)
  return { error }
}
