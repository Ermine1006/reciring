import { supabase, isSupabaseConfigured } from './supabase'

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

// Move one of my nudges pending → 'interested' | 'skipped'. RLS lets a user
// update only their own rows, and only the status (WITH CHECK on user_id).
export async function setNudgeStatus(id, status) {
  if (!isSupabaseConfigured || !id) return { error: new Error('not configured') }
  const { error } = await supabase
    .from('match_nudges')
    .update({ status })
    .eq('id', id)
  return { error }
}
