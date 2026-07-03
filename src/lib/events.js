import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Fetch upcoming events with attendee counts.
 *
 * Excludes cancelled events by default — cancelled events are still in
 * the DB (for audit + attendee history) but shouldn't surface in the
 * Upcoming feed. Slice B's detail page will still load cancelled
 * events directly by id.
 *
 * Sorted by soonest start time first.
 */
export async function fetchUpcomingEvents() {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, description, start_at, location, category,
      max_attendees, min_attendees, host_user_id, host_display_name, host_type,
      image_url, is_sponsored, created_at,
      status, cancellation_reason, cancelled_at,
      attendee_visibility,
      event_attendees ( count )
    `)
    .gte('start_at', new Date().toISOString())
    .neq('status', 'cancelled')
    .neq('status', 'completed')
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
      attendee_visibility: fields.attendee_visibility || 'public',
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

/**
 * Fetch a single event by id, including the live attendee count.
 * Used by the Event Detail page on open / refresh.
 */
export async function fetchEventById(eventId) {
  if (!isSupabaseConfigured) return { data: null, error: null }
  if (!eventId)              return { data: null, error: new Error('missing event id') }

  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, description, start_at, location, category,
      max_attendees, min_attendees, host_user_id, host_display_name, host_type,
      image_url, is_sponsored, created_at,
      status, cancellation_reason, cancelled_at,
      attendee_visibility,
      event_attendees ( count )
    `)
    .eq('id', eventId)
    .maybeSingle()

  if (error) return { data: null, error }
  if (!data) return { data: null, error: null }
  return {
    data: { ...data, attendee_count: data.event_attendees?.[0]?.count || 0 },
    error: null,
  }
}

/**
 * Fetch the attendee list for an event with each user's first name
 * and avatar_url. Sorted by join time, oldest first (so the host can
 * see in what order people RSVPed).
 *
 * Done as TWO queries (attendees, then profiles by id) instead of an
 * embedded PostgREST join — there's no FK from event_attendees.user_id
 * → public.profiles.id (the existing FK is to auth.users.id), so
 * `select profile:profiles(...)` silently returns nulls. The manual
 * stitch is reliable without schema changes.
 *
 * When `includeContact` is true, the profile select is widened to
 * include `email` and `program` for the host's "Manage participants"
 * view. Callers should ONLY pass true when the current user is the
 * event host — the UI enforces this. Note that `profiles` currently
 * has an open SELECT policy at the DB level, so this widening is a
 * client-side defense-in-depth (a determined caller could still hit
 * profiles directly), not a hard boundary. A future migration should
 * lock the host-only email path down via a SECURITY DEFINER function.
 */
export async function fetchEventAttendees(eventId, { includeContact = false } = {}) {
  if (!isSupabaseConfigured) return { data: [], error: null }
  if (!eventId)              return { data: [], error: new Error('missing event id') }

  const { data: rows, error } = await supabase
    .from('event_attendees')
    .select('user_id, joined_at')
    .eq('event_id', eventId)
    .order('joined_at', { ascending: true })

  if (error)                  return { data: [], error }
  if (!rows || rows.length === 0) return { data: [], error: null }

  const userIds = rows.map(r => r.user_id)
  const profileSelect = includeContact
    ? 'id, name, avatar_url, email, program'
    : 'id, name, avatar_url'
  const { data: profiles } = await supabase
    .from('profiles')
    .select(profileSelect)
    .in('id', userIds)

  const byId = new Map((profiles || []).map(p => [p.id, p]))

  return {
    data: rows.map(r => {
      const p = byId.get(r.user_id)
      return {
        user_id:    r.user_id,
        joined_at:  r.joined_at,
        name:       p?.name || 'Member',
        avatar_url: p?.avatar_url || null,
        email:      includeContact ? (p?.email   || null) : null,
        program:    includeContact ? (p?.program || null) : null,
      }
    }),
    error: null,
  }
}

/**
 * Update an event's editable fields (host only — RLS enforces it).
 *
 * `fields` is a partial object; only present keys are updated. Allowed
 * keys map to the form: title, description, start_at, location,
 * category, max_attendees, host_type, image_url. Other columns
 * (status, cancelled_at, host_user_id, host_display_name, created_at)
 * are intentionally NOT editable here — status changes go through
 * cancelEvent; the rest are immutable.
 */
export async function updateEvent(eventId, fields) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  if (!eventId)              return { data: null, error: new Error('missing event id') }

  const ALLOWED = ['title','description','start_at','location','category','max_attendees','min_attendees','host_type','image_url','attendee_visibility']
  const patch = {}
  for (const key of ALLOWED) {
    if (key in (fields || {})) patch[key] = fields[key]
  }
  if (Object.keys(patch).length === 0) {
    return { data: null, error: new Error('Nothing to update') }
  }

  const { data, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', eventId)
    .select()
    .single()

  if (error) return { data: null, error }
  return { data, error: null }
}

/**
 * Cancel an event (host only — enforced by RLS UPDATE policy).
 *
 * Sets status='cancelled' and stamps the reason. The DB trigger
 * `trg_notify_event_cancellation` fans out a notification to every
 * attendee in the same transaction; `trg_stamp_event_cancelled_at`
 * fills `cancelled_at` automatically.
 *
 * `reason` is short text — the picker in the UI offers Weather /
 * Low attendance / Personal emergency / Other; "Other" passes through
 * the user's free-text input.
 */
export async function cancelEvent(eventId, reason) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  if (!eventId)              return { error: new Error('missing event id') }

  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 200) : ''

  const { data, error } = await supabase
    .from('events')
    .update({
      status: 'cancelled',
      cancellation_reason: cleanReason || null,
    })
    .eq('id', eventId)
    .select('id, status')

  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: new Error('Cancel had no effect — RLS may have blocked you (only the host can cancel).') }
  }
  return { error: null }
}
