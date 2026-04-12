import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Fetch all messages for a match, oldest first.
 */
export async function fetchMessages(matchId) {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })

  return { data: data || [], error }
}

/**
 * Send a text message.
 */
export async function sendMessage(matchId, senderUserId, body) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }

  const row = {
    match_id:       matchId,
    sender_user_id: senderUserId,
    body,
  }

  // First try with type column; if the column doesn't exist, retry without it
  let { data, error } = await supabase
    .from('messages')
    .insert({ ...row, type: 'text' })
    .select()
    .single()

  if (error && error.message?.includes('type')) {
    ;({ data, error } = await supabase
      .from('messages')
      .insert(row)
      .select()
      .single())
  }

  return { data, error }
}

/**
 * Send a meeting proposal message.
 */
export async function sendMeetingProposal(matchId, senderUserId, { datetime, location }) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }

  const meetingData = { datetime, location, status: 'pending' }

  // Try with type+metadata columns first; fall back to body-only if columns don't exist
  let { data, error } = await supabase
    .from('messages')
    .insert({
      match_id:       matchId,
      sender_user_id: senderUserId,
      body:           JSON.stringify(meetingData),
      type:           'meeting_proposal',
      metadata:       meetingData,
    })
    .select()
    .single()

  if (error && (error.message?.includes('type') || error.message?.includes('metadata'))) {
    ;({ data, error } = await supabase
      .from('messages')
      .insert({
        match_id:       matchId,
        sender_user_id: senderUserId,
        body:           JSON.stringify(meetingData),
      })
      .select()
      .single())
  }

  return { data, error }
}

/**
 * Update a meeting proposal's status (confirm / reschedule).
 */
export async function updateMeetingStatus(messageId, status) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }

  // Fetch current metadata, update the status field
  const { data: existing, error: fetchErr } = await supabase
    .from('messages')
    .select('metadata')
    .eq('id', messageId)
    .single()

  if (fetchErr) return { data: null, error: fetchErr }

  const { data, error } = await supabase
    .from('messages')
    .update({ metadata: { ...existing.metadata, status } })
    .eq('id', messageId)
    .select()
    .single()

  return { data, error }
}

/**
 * Map a DB message row to the shape consumed by ChatView.
 */
export function msgToUI(row, currentUserId) {
  const type = row.type || 'text'
  const meeting = type === 'meeting_proposal'
    ? (row.metadata || tryParseJSON(row.body))
    : null

  return {
    id:        row.id,
    senderId:  row.sender_user_id === currentUserId ? 'me' : 'peer',
    content:   row.body,
    type,
    timestamp: row.created_at,
    ...(meeting ? { meeting } : {}),
  }
}

function tryParseJSON(str) {
  try { const o = JSON.parse(str); return typeof o === 'object' ? o : null }
  catch { return null }
}
