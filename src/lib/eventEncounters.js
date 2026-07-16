// Event Networking Memory data layer.
//
// Every write path enforces owner-only via RLS (see
// migration-event-encounters.sql). Private notes and conversation
// topics never leave the owner's row — the encountered user cannot
// read them, nor can the event host, nor the app admin.
//
// The detection method for the MVP is 'manual' — the user manually
// taps "I met this person". BLE / NFC / QR / voice detectors would
// write to the same table with a different `source` value and reuse
// every code path below unchanged.

import { supabase, isSupabaseConfigured } from './supabase'

export const TOPIC_CHIPS = [
  'Startup',
  'Fundraising',
  'Hiring',
  'Co-founder',
  'Career',
  'AI',
  'Investing',
  'Product',
  'Other',
]

/**
 * Idempotent "I met this person" write. If a row already exists for
 * (user, event, encountered) we UPDATE it (topics + note); otherwise
 * INSERT. Returns the row so the caller can immediately show it.
 */
export async function recordEncounter({
  eventId, encounteredUserId, topics = [], privateNote = null, source = 'manual',
}) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { data: null, error: new Error('Not signed in') }
  if (!eventId || !encounteredUserId) {
    return { data: null, error: new Error('missing eventId or encounteredUserId') }
  }
  if (encounteredUserId === session.user.id) {
    return { data: null, error: new Error("You can't record yourself as an encounter.") }
  }

  // Upsert on the composite uniqueness key. Preserves the existing
  // status if the row already existed (don't downgrade a mutually-
  // confirmed encounter back to self_recorded just because someone
  // opened the modal again).
  const { data, error } = await supabase
    .from('event_encounters')
    .upsert({
      user_id:             session.user.id,
      event_id:            eventId,
      encountered_user_id: encounteredUserId,
      topics,
      private_note:        privateNote,
      source,
    }, { onConflict: 'user_id,event_id,encountered_user_id' })
    .select()
    .single()

  return { data, error }
}

/** Patch topics + note on an existing encounter (owner-only via RLS). */
export async function updateEncounter(id, { topics, privateNote }) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  const patch = {}
  if (topics !== undefined)       patch.topics       = topics
  if (privateNote !== undefined)  patch.private_note = privateNote
  if (Object.keys(patch).length === 0) return { data: null, error: new Error('Nothing to update') }

  const { data, error } = await supabase
    .from('event_encounters')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

/** Undo. Owner-only via RLS. */
export async function deleteEncounter(id) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  const { error } = await supabase.from('event_encounters').delete().eq('id', id)
  return { error }
}

/** Every encounter I've recorded for a given event. */
export async function listEncountersForEvent(eventId) {
  if (!isSupabaseConfigured || !eventId) return { data: [], error: null }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { data: [], error: null }

  const { data, error } = await supabase
    .from('event_encounters')
    .select('id, event_id, encountered_user_id, status, topics, private_note, created_at, confirmed_at, followed_up_at, source')
    .eq('user_id', session.user.id)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  return { data: data || [], error }
}

/**
 * Every encounter I've recorded across every event I've attended,
 * grouped by event. Powers My Event Memory. Returns:
 *   [ { event: {...}, encounters: [ { encountered_user_id, ... } ] } ]
 * Sorted with most-recent events first.
 */
export async function listMyEventMemory() {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { data: [], error: null }

  const { data: encounters, error } = await supabase
    .from('event_encounters')
    .select('id, event_id, encountered_user_id, status, topics, followed_up_at, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
  if (error) return { data: [], error }

  const eventIds = Array.from(new Set((encounters || []).map(e => e.event_id)))
  if (eventIds.length === 0) return { data: [], error: null }

  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_at, category, status')
    .in('id', eventIds)

  const eventById = new Map((events || []).map(e => [e.id, e]))
  const grouped = new Map()
  for (const enc of encounters) {
    const evt = eventById.get(enc.event_id)
    if (!evt) continue
    if (!grouped.has(evt.id)) grouped.set(evt.id, { event: evt, encounters: [] })
    grouped.get(evt.id).encounters.push(enc)
  }
  // Sort by event start descending (most recent event first).
  const rows = Array.from(grouped.values()).sort((a, b) =>
    new Date(b.event.start_at).getTime() - new Date(a.event.start_at).getTime()
  )
  return { data: rows, error: null }
}

/** Mark an encounter as followed-up. Owner-only via RLS. */
export async function markEncounterFollowedUp(id) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  const { error } = await supabase
    .from('event_encounters')
    .update({ followed_up_at: new Date().toISOString() })
    .eq('id', id)
  return { error }
}

// ── Confirmation flow (prototype) ─────────────────────────────

/**
 * Ask the encountered person to confirm we met. Creates a
 * confirmation_request row + flips the source encounter's status
 * to 'confirmation_requested'. Idempotent on the encounter side
 * via the UNIQUE(encounter_id) constraint on the requests table.
 */
export async function requestConfirmation(encounterId) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { data: null, error: new Error('Not signed in') }

  // Load the encounter so we have event_id + target user_id.
  const { data: enc, error: encErr } = await supabase
    .from('event_encounters')
    .select('id, event_id, encountered_user_id, user_id')
    .eq('id', encounterId)
    .maybeSingle()
  if (encErr || !enc) return { data: null, error: encErr || new Error('Encounter not found') }
  if (enc.user_id !== session.user.id) {
    return { data: null, error: new Error('Not your encounter') }
  }

  // Best-effort insert. Duplicate confirmation requests for the same
  // encounter are absorbed by the UNIQUE(encounter_id) constraint —
  // we treat 23505 as success.
  const { data: req, error: reqErr } = await supabase
    .from('encounter_confirmation_requests')
    .insert({
      encounter_id:      enc.id,
      event_id:          enc.event_id,
      requester_user_id: session.user.id,
      target_user_id:    enc.encountered_user_id,
    })
    .select()
    .maybeSingle()
  if (reqErr && reqErr.code !== '23505') return { data: null, error: reqErr }

  // Flip status even if the insert deduped — the source encounter
  // might not have been advanced yet.
  await supabase
    .from('event_encounters')
    .update({ status: 'confirmation_requested' })
    .eq('id', enc.id)
    .eq('status', 'self_recorded')

  return { data: req || { encounter_id: enc.id, status: 'pending' }, error: null }
}

/**
 * List pending confirmation requests where I'm the target. Used by
 * the notification pill on the event detail page.
 */
export async function listPendingConfirmations() {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { data: [], error: null }

  const { data, error } = await supabase
    .from('encounter_confirmation_requests')
    .select('id, encounter_id, event_id, requester_user_id, status, created_at')
    .eq('target_user_id', session.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

/**
 * Accept a confirmation request. Two writes happen:
 *   1. Update the request status → 'accepted'
 *   2. Upsert a mirror encounter for the target so their memory of
 *      the event includes the requester (self-recorded, no note).
 * The requester's encounter is flipped to 'mutually_confirmed' via
 * a separate update in step 3.
 *
 * All three steps run client-side under RLS — steps 1 + 2 write rows
 * the target owns; step 3 is guarded by the "confirmations target-
 * respond" policy which allows the target to observe the confirmed
 * status when needed. However, since the source encounter is owned
 * by the REQUESTER, we can't update it directly from the target's
 * session. Instead we rely on a small server-side reconciliation:
 * both parties check for accepted requests on load and update their
 * own encounter's status locally when they see one.
 */
export async function acceptConfirmation(requestId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { error: new Error('Not signed in') }

  const { data: req, error: reqErr } = await supabase
    .from('encounter_confirmation_requests')
    .select('id, encounter_id, event_id, requester_user_id, target_user_id, status')
    .eq('id', requestId)
    .maybeSingle()
  if (reqErr || !req) return { error: reqErr || new Error('Request not found') }
  if (req.target_user_id !== session.user.id) return { error: new Error('Not your request') }

  // Step 1: mark the request accepted.
  const { error: updErr } = await supabase
    .from('encounter_confirmation_requests')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', requestId)
  if (updErr) return { error: updErr }

  // Step 2: mirror encounter for the target so their event memory
  // now includes the requester. Empty topics + note — the target can
  // enrich it themselves later.
  await supabase
    .from('event_encounters')
    .upsert({
      user_id:             session.user.id,
      event_id:            req.event_id,
      encountered_user_id: req.requester_user_id,
      status:              'mutually_confirmed',
      confirmed_at:        new Date().toISOString(),
      source:              'manual',
    }, { onConflict: 'user_id,event_id,encountered_user_id' })

  return { error: null }
}

/** Decline a confirmation request. Just flips status. */
export async function declineConfirmation(requestId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  const { error } = await supabase
    .from('encounter_confirmation_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', requestId)
  return { error }
}

/**
 * For every encounter I've recorded, check whether the target
 * accepted our confirmation request. If yes, flip my encounter to
 * 'mutually_confirmed'. Called on Recap page load — it's the mirror
 * of the target's acceptance step, executed by the requester.
 */
export async function reconcileMyConfirmations(encounterIds = []) {
  if (!isSupabaseConfigured || encounterIds.length === 0) return { error: null }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { error: null }

  const { data: accepted } = await supabase
    .from('encounter_confirmation_requests')
    .select('encounter_id')
    .in('encounter_id', encounterIds)
    .eq('requester_user_id', session.user.id)
    .eq('status', 'accepted')

  const acceptedIds = (accepted || []).map(r => r.encounter_id)
  if (acceptedIds.length === 0) return { error: null }

  await supabase
    .from('event_encounters')
    .update({ status: 'mutually_confirmed', confirmed_at: new Date().toISOString() })
    .in('id', acceptedIds)
    .neq('status', 'mutually_confirmed')
  return { error: null }
}
