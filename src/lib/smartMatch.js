import { supabase, isSupabaseConfigured } from './supabase'
import { VISIBILITY_PUBLIC } from './visibility'

// ── Smart Match Nudge · client wiring (Phase 1.3) ────────────────────
//
// Bridges the frontend to two pieces that already existed but were never
// connected:
//   • the `match-suggestions` Edge Function (compatibility scorer), and
//   • the `match_nudges` table (RLS-scoped to the signed-in user).
//
// The scorer reads the JWT from the session, scores every onboarded
// candidate, and upserts the viewer's top-5 as `status='pending'` rows.
// We then read those rows back and let the user mark interest / skip.

// Ask the scorer to (re)generate suggestions for the signed-in user.
// Returns { count, error }. Errors are returned, never thrown, so the UI
// can degrade quietly when the function isn't deployed yet.
export async function generateSmartMatches() {
  if (!isSupabaseConfigured) return { count: 0, error: null }
  const { data, error } = await supabase.functions.invoke('match-suggestions', { body: {} })
  if (error) return { count: 0, error }
  return { count: data?.count ?? 0, error: null }
}

// Read my pending nudges, best score first. RLS returns only my own rows;
// candidate identities are never exposed here — only candidate_id (used as
// an anonymous avatar seed) + the identity-free `reason` string.
export async function fetchPendingNudges() {
  if (!isSupabaseConfigured) return { nudges: [], error: null }
  const { data, error } = await supabase
    .from('match_nudges')
    .select('id, candidate_id, score, reason, status')
    .eq('status', 'pending')
    .order('score', { ascending: false })
  if (error) return { nudges: [], error }
  return { nudges: data || [], error: null }
}

// Keep saved interest visible across refreshes and return visits. RLS still
// scopes these rows to the viewer; no reciprocal row is read. Candidates who
// chose a Public profile are named (same rule as Give & Ask posts); the
// profile query filters on visibility server-side, so a Private member's
// name never reaches this client.
export async function fetchVisibleNudges() {
  if (!isSupabaseConfigured) return { nudges: [], error: null }
  const { data, error } = await supabase
    .from('match_nudges')
    .select('id, candidate_id, score, reason, status')
    .in('status', ['pending', 'interested', 'matched'])
    .order('score', { ascending: false })
  const nudges = data || []
  const ids = [...new Set(nudges.map(n => n.candidate_id).filter(Boolean))]
  if (error || !ids.length) return { nudges, error }
  const { data: publicProfiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', ids)
    .eq('visibility', VISIBILITY_PUBLIC)
  const nameById = new Map((Array.isArray(publicProfiles) ? publicProfiles : [])
    .filter(p => String(p?.name || '').trim())
    .map(p => [p.id, String(p.name).trim().split(/\s+/)[0]]))
  return {
    nudges: nudges.map(n => nameById.has(n.candidate_id) ? { ...n, publicName: nameById.get(n.candidate_id) } : n),
    error,
  }
}

// Move one of my nudges pending → 'interested' | 'skipped'. RLS lets a user
// update only their own rows, and only the status (WITH CHECK on user_id).
// Marking 'interested' may trigger the server-side handshake (see
// scripts/migration-smart-match-handshake.sql): if the candidate already
// marked me interested, a match is created for both of us.
export async function setNudgeStatus(id, status) {
  if (!isSupabaseConfigured || !id) return { error: new Error('not configured') }
  if (!['interested', 'skipped'].includes(status)) return { error: new Error('Invalid action') }
  const { data, error } = await supabase
    .from('match_nudges')
    .update({ status })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .single()
  return { error: error || (!data ? new Error('This suggestion changed. Refresh and try again.') : null) }
}

// After marking interest, check whether the handshake produced a live match
// with this candidate. RLS lets me read matches I'm part of, so the person
// who completes the mutual interest sees the new connection immediately.
export async function checkMutualMatch(candidateId) {
  if (!isSupabaseConfigured || !candidateId) return { matched: false, matchId: null }
  const { data: { session } } = await supabase.auth.getSession()
  const me = session?.user?.id
  if (!me) return { matched: false, matchId: null }
  const { data, error } = await supabase
    .from('matches')
    .select('id, status')
    .or(`and(requester_user_id.eq.${me},helper_user_id.eq.${candidateId}),and(requester_user_id.eq.${candidateId},helper_user_id.eq.${me})`)
    .eq('status', 'active')
    .limit(1)
  const row = data && data[0]
  return { matched: Boolean(row), matchId: row ? row.id : null, error }
}

// People who tapped Interested on me and are waiting for my answer (see
// scripts/migration-smart-match-interest-notify.sql). The server returns a
// sender's id and first name only when they chose a Public profile; for
// Private senders the client only ever sees the nudge id. Before that
// migration runs this quietly returns nothing.
export async function fetchIncomingInterests() {
  if (!isSupabaseConfigured) return { incoming: [], error: null }
  const { data, error } = await supabase.rpc('incoming_smart_interests')
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '')
    return { incoming: [], error: missing ? null : error }
  }
  return { incoming: Array.isArray(data) ? data : [], error: null }
}

// Answer an incoming interest. Interested creates the match through the
// server handshake; Not now is silent and the sender is never told.
export async function respondToInterest(nudgeId, interested) {
  if (!isSupabaseConfigured || !nudgeId) return { matched: false, matchId: null, error: new Error('not configured') }
  const { data, error } = await supabase.rpc('respond_smart_interest', { p_nudge_id: nudgeId, p_interested: Boolean(interested) })
  const row = Array.isArray(data) ? data[0] : data
  return { matched: Boolean(row?.matched), matchId: row?.match_id || null, error }
}
