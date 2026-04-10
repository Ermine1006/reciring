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

  const { data, error } = await supabase
    .from('messages')
    .insert({
      match_id:       matchId,
      sender_user_id: senderUserId,
      body,
      type:           'text',
    })
    .select()
    .single()

  return { data, error }
}

/**
 * Send a meeting proposal message.
 */
export async function sendMeetingProposal(matchId, senderUserId, { datetime, location }) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      match_id:       matchId,
      sender_user_id: senderUserId,
      body:           '',
      type:           'meeting_proposal',
      metadata:       { datetime, location, status: 'pending' },
    })
    .select()
    .single()

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
  return {
    id:        row.id,
    senderId:  row.sender_user_id === currentUserId ? 'me' : 'peer',
    content:   row.body,
    type:      row.type,
    timestamp: row.created_at,
    // meeting data lives in metadata for meeting_proposal type
    ...(row.type === 'meeting_proposal' && row.metadata
      ? { meeting: row.metadata }
      : {}),
  }
}
