import { supabase, isSupabaseConfigured } from './supabase'
import { apiUrl } from './apiBase'

// ── Event memory · encounters + derived follow-ups ───────────────────
// event_encounters is the single store. A "follow-up" is an encounter with a
// next_action that isn't completed. All rows are private to the author.

// Reuses the shared public.event_encounters table (see
// migration-event-encounters.sql + migration-event-memory.sql). Its `status`
// column belongs to the Event-Mode confirmation flow, so we DON'T set custom
// values here — a "follow-up" is next_action set + followed_up_at IS NULL, and
// completing one stamps followed_up_at (the base table's existing field).

const COLS = 'id, user_id, event_id, encountered_user_id, person_name, topics, private_note, commitment, next_action, due_at, followed_up_at, followup_dismissed_at, message_status, message_draft, message_drafted_at, message_sent_at, created_at'

// A stable key for "the same person" across encounters: their profile id when
// linked, else the lowercased name. Used to dedupe contacts + gather history.
export function personKey(enc) {
  if (enc?.encountered_user_id) return `u:${enc.encountered_user_id}`
  const name = (enc?.display_name || enc?.person_name || '').trim().toLowerCase()
  return name ? `n:${name}` : `id:${enc?.id}`
}

// Resolve each encounter's identity + event so every reader (dashboard, Ask
// Mutu, history) sees a consistent name — whether it was recorded via Event
// Mode/Recap (linked profile, person_name empty) or a manual/AI capture
// (person_name set, no link). Single source of truth stays event_encounters.
async function resolveEncounters(rows) {
  if (!rows || rows.length === 0) return []
  const userIds  = Array.from(new Set(rows.map(r => r.encountered_user_id).filter(Boolean)))
  const eventIds = Array.from(new Set(rows.map(r => r.event_id).filter(Boolean)))
  const [profs, evs] = await Promise.all([
    userIds.length  ? supabase.from('profiles').select('id, name, avatar_url, program').in('id', userIds)      : Promise.resolve({ data: [] }),
    eventIds.length ? supabase.from('events').select('id, title, start_at, location').in('id', eventIds)        : Promise.resolve({ data: [] }),
  ])
  const pById = Object.fromEntries((profs.data || []).map(p => [p.id, p]))
  const eById = Object.fromEntries((evs.data  || []).map(e => [e.id, e]))
  return rows.map(r => {
    const p  = r.encountered_user_id ? pById[r.encountered_user_id] : null
    const ev = r.event_id ? eById[r.event_id] : null
    const httpAvatar = p?.avatar_url && /^https?:/.test(p.avatar_url) ? p.avatar_url : null
    return {
      ...r,
      display_name:   (r.person_name && r.person_name.trim()) || p?.name || 'Someone',
      avatar_url:     httpAvatar,
      program:        p?.program || null,
      event_title:    ev?.title || null,
      event_location: ev?.location || null,
      event_start_at: ev?.start_at || null,
    }
  })
}

export async function fetchEncounters(userId, { eventId } = {}) {
  if (!isSupabaseConfigured || !userId) return { data: [], error: null }
  let q = supabase.from('event_encounters').select(COLS).eq('user_id', userId).order('created_at', { ascending: false })
  if (eventId) q = q.eq('event_id', eventId)
  const { data, error } = await q
  return { data: await resolveEncounters(data || []), error }
}

// Open follow-ups for the dashboard: encounters with a next_action, not yet
// followed up.
export async function fetchFollowups(userId) {
  if (!isSupabaseConfigured || !userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('event_encounters')
    .select(COLS)
    .eq('user_id', userId)
    .neq('next_action', '')
    .is('followed_up_at', null)
    .is('followup_dismissed_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
  return { data: await resolveEncounters(data || []), error }
}

// All encounters with one person (across events), newest first — for the
// unified contact history. Matches by profile link when present, else by name.
export async function fetchPersonHistory(userId, { encounteredUserId, personName }) {
  if (!isSupabaseConfigured || !userId) return { data: [], error: null }
  let q = supabase.from('event_encounters').select(COLS).eq('user_id', userId)
  if (encounteredUserId) q = q.eq('encountered_user_id', encounteredUserId)
  else if (personName)   q = q.is('encountered_user_id', null).ilike('person_name', personName.trim())
  else return { data: [], error: null }
  const { data, error } = await q.order('created_at', { ascending: false })
  return { data: await resolveEncounters(data || []), error }
}

// Follow-up lifecycle (reuses the encounter's timestamps — no separate table).
export async function dismissFollowup(id) {
  return updateEncounter(id, { followup_dismissed_at: new Date().toISOString() })
}
// Undo a completed/dismissed next action → back to pending (if it has a next_action).
export async function reopenFollowup(id) {
  return updateEncounter(id, { followed_up_at: null, followup_dismissed_at: null })
}

// ── Message (communication) lifecycle — separate from the next action ──
export async function saveMessageDraft(id, text) {
  return updateEncounter(id, {
    message_status: 'draft',
    message_draft: String(text || '').slice(0, 4000),
    message_drafted_at: new Date().toISOString(),
  })
}
export async function markMessageSent(id) {
  return updateEncounter(id, { message_status: 'sent', message_sent_at: new Date().toISOString() })
}
export async function unmarkMessageSent(id) {
  return updateEncounter(id, { message_status: 'draft', message_sent_at: null })
}
export async function addFollowup(id, { nextAction, dueAt }) {
  return updateEncounter(id, {
    next_action: String(nextAction || '').trim().slice(0, 300),
    due_at: dueAt || null,
    followed_up_at: null,
    followup_dismissed_at: null,
  })
}

export async function createEncounter({ userId, eventId, encounteredUserId, personName, topics, privateNote, commitment, nextAction, dueAt }) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  if (!userId)            return { data: null, error: new Error('Not signed in') }
  if (!personName?.trim()) return { data: null, error: new Error('Add a name') }
  const { data, error } = await supabase
    .from('event_encounters')
    .insert({
      user_id:             userId,
      event_id:            eventId || null,
      encountered_user_id: encounteredUserId || null,
      person_name:         personName.trim().slice(0, 120),
      topics:              (topics || []).slice(0, 12),
      private_note:        String(privateNote || '').trim().slice(0, 1000),
      commitment:          String(commitment || '').trim().slice(0, 300),
      next_action:         String(nextAction || '').trim().slice(0, 300),
      due_at:              dueAt || null,
      source:              'manual',
    })
    .select(COLS)
    .single()
  return { data, error }
}

export async function updateEncounter(id, patch) {
  if (!isSupabaseConfigured || !id) return { error: new Error('Missing encounter') }
  const clean = {}
  for (const k of ['person_name', 'topics', 'private_note', 'commitment', 'next_action', 'due_at', 'event_id', 'followed_up_at', 'followup_dismissed_at', 'message_status', 'message_draft', 'message_drafted_at', 'message_sent_at']) {
    if (patch[k] !== undefined) clean[k] = patch[k]
  }
  const { error } = await supabase.from('event_encounters').update(clean).eq('id', id)
  return { error }
}

export async function completeFollowup(id) {
  return updateEncounter(id, { followed_up_at: new Date().toISOString() })
}

export async function deleteEncounter(id) {
  if (!isSupabaseConfigured || !id) return { error: new Error('Missing encounter') }
  const { error } = await supabase.from('event_encounters').delete().eq('id', id)
  return { error }
}

/**
 * "Tell Mutu what happened" — send free text, get a structured draft back.
 * Reuses the consolidated /api/ai-rewrite endpoint (mode: 'capture'), so no new
 * serverless function. Returns { capture: { person, context, need, commitment,
 * next_action, due }, error }. The user confirms/edits before it's saved.
 */
export async function extractCapture(text, { eventTitle } = {}) {
  if (!isSupabaseConfigured) return { capture: null, error: new Error('Supabase not configured') }
  if (!text?.trim())         return { capture: null, error: new Error('Nothing to capture') }
  let resp
  try {
    resp = await fetch(apiUrl('/api/ai-rewrite'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'capture', text: text.trim(), context: { eventTitle } }),
    })
  } catch (err) {
    return { capture: null, error: err }
  }
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) return { capture: null, error: new Error(body?.error || 'Could not read that') }
  return { capture: body.capture || null, error: null }
}

// ── Ask Mutu chat history (persisted; storage only, no AI cost) ──────
export async function fetchAskHistory(userId, limit = 60) {
  if (!isSupabaseConfigured || !userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('ask_mutu_messages')
    .select('id, role, text, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit)
  return { data: data || [], error }
}
export async function saveAskMessage(userId, role, text) {
  if (!isSupabaseConfigured || !userId) return { error: null }
  const { error } = await supabase
    .from('ask_mutu_messages')
    .insert({ user_id: userId, role, text: String(text || '').slice(0, 4000) })
  return { error }
}
export async function clearAskHistory(userId) {
  if (!isSupabaseConfigured || !userId) return { error: null }
  const { error } = await supabase.from('ask_mutu_messages').delete().eq('user_id', userId)
  return { error }
}

// Build the compact, private grounding context for Ask Mutu from the user's
// own encounters + events. Only fields the user already owns.
export function buildAssistantContext({ encounters = [], events = [], connections = [] }) {
  return {
    // People you know but have NOT met in person yet (Community match /
    // identity reveal / chat). Kept separate from `people` (met) so Mutu never
    // conflates a connection with someone you met. Identity-hidden ones omitted.
    connections: connections
      .filter(c => c.name)
      .map(c => ({ name: c.name, relationship: c.context || 'Connection', program: c.program || null })),
    people: encounters.map(e => {
      // Three INDEPENDENT states — never collapse them into one "followed up":
      //  • message  = a communication (drafted / sent / none)
      //  • action   = a commitment/task (pending / completed / dismissed / none)
      const messageState = e.message_status === 'sent' ? 'sent'
                         : e.message_status === 'draft' ? 'drafted'
                         : 'none'
      const hasAction = Boolean((e.next_action || '').trim())
      const actionState = !hasAction ? 'none'
                        : e.followed_up_at ? 'completed'
                        : e.followup_dismissed_at ? 'dismissed'
                        : 'pending'
      return {
        name:          e.display_name || e.person_name || 'Someone',
        met_at:        e.event_title || null,
        met_on:        e.event_start_at ? new Date(e.event_start_at).toISOString().slice(0, 10) : (e.created_at ? new Date(e.created_at).toISOString().slice(0, 10) : null),
        topics:        e.topics || [],
        note:          e.private_note || '',
        commitment:    e.commitment || '',
        // Message (communication) — a drafted message is NOT a sent message.
        message_state: messageState,
        message_sent_on: e.message_sent_at ? new Date(e.message_sent_at).toISOString().slice(0, 10) : null,
        // Next action (commitment/task) — separate from the message.
        next_action:   e.next_action || '',
        action_state:  actionState,
        due:           e.due_at ? new Date(e.due_at).toISOString().slice(0, 10) : null,
      }
    }),
    upcoming_events: events.map(e => e.title).filter(Boolean),
  }
}

/**
 * Ask Mutu a question, grounded on the user's own networking data.
 * Returns { answer, error }.
 */
export async function askMutu(question, context) {
  if (!isSupabaseConfigured) return { answer: null, error: new Error('Supabase not configured') }
  if (!question?.trim())     return { answer: null, error: new Error('Ask a question') }
  let resp
  try {
    resp = await fetch(apiUrl('/api/ai-rewrite'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'assistant', text: question.trim(), context: context || {} }),
    })
  } catch (err) {
    return { answer: null, error: err }
  }
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) return { answer: null, error: new Error(body?.error || 'Ask Mutu is unavailable') }
  return { answer: body.answer || null, error: null }
}
