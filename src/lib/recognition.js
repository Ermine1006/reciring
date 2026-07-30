import { supabase, isSupabaseConfigured } from './supabase'

// ── Recognition engine · client data layer (Slice 1 schema) ──────────
//
// Flow: both participants tap "We met" (exchange_confirmations), then each may
// recognize the other once (recognition_events). See
// scripts/migration-recognition-schema.sql.

// Record my "We met" for a match. The (match_id,user_id) PK dedupes a second
// tap, which we treat as success.
export async function confirmExchange(matchId, userId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  if (!matchId || !userId)   return { error: new Error('missing match or user') }
  const { error } = await supabase
    .from('exchange_confirmations')
    .insert({ match_id: matchId, user_id: userId })
  if (error && error.code !== '23505') return { error }
  return { error: null }
}

// Both participants' confirmation rows (RLS lets each read both).
export async function fetchExchangeStatus(matchId, userId) {
  if (!isSupabaseConfigured || !matchId) return { mineConfirmed: false, bothConfirmed: false, error: null }
  const { data, error } = await supabase
    .from('exchange_confirmations')
    .select('user_id')
    .eq('match_id', matchId)
  if (error) return { mineConfirmed: false, bothConfirmed: false, error }
  const ids = (data || []).map(r => r.user_id)
  return {
    mineConfirmed: ids.includes(userId),
    bothConfirmed: ids.length >= 2,
    error: null,
  }
}

// Have I already recognized this exchange? Givers can read their own rows.
export async function hasRecognized(matchId, userId) {
  if (!isSupabaseConfigured || !matchId || !userId) return { recognized: false, error: null }
  const { data, error } = await supabase
    .from('recognition_events')
    .select('id')
    .eq('match_id', matchId)
    .eq('giver_id', userId)
    .maybeSingle()
  if (error) return { recognized: false, error }
  return { recognized: Boolean(data), error: null }
}

// Coarse trust signal for a user (Slice 4). Returns only qualified +
// recognizerCount — the view exposes nothing finer. A user with no
// recognitions has no row → not qualified.
export async function fetchTrustSignal(userId) {
  if (!isSupabaseConfigured || !userId) return { qualified: false, recognizerCount: 0, error: null }
  const { data, error } = await supabase
    .from('trust_signal')
    .select('qualified, recognizer_count')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { qualified: false, recognizerCount: 0, error }
  return { qualified: Boolean(data?.qualified), recognizerCount: data?.recognizer_count || 0, error: null }
}

// Submit my recognition of the peer. free_text is private (never returned to
// the receiver — enforced by RLS + the recognition_received view).
export async function submitRecognition({ matchId, giverId, receiverId, chips, freeText }) {
  if (!isSupabaseConfigured)     return { error: new Error('Supabase not configured') }
  if (!matchId || !giverId || !receiverId) return { error: new Error('missing ids') }
  if (!chips || chips.length === 0) return { error: new Error('Pick at least one') }
  const { error } = await supabase
    .from('recognition_events')
    .insert({
      match_id:    matchId,
      giver_id:    giverId,
      receiver_id: receiverId,
      chips,
      free_text:   String(freeText || '').trim().slice(0, 280),
    })
  if (error) {
    if (error.code === '23505') return { error: new Error('You already recognized this exchange') }
    return { error }
  }
  return { error: null }
}
