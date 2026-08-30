import { supabase, isSupabaseConfigured } from './supabase'

// ── Reciprocal Practice · data layer ─────────────────────────────
// Thin wrappers over the Practice tables, views, and SECURITY
// DEFINER RPCs created by scripts/migration-practice-reciprocal.sql.
// House rules (match every other src/lib module):
//   • every function returns { data, error } (or { error }) and NEVER throws;
//   • no-op guard on isSupabaseConfigured;
//   • all state transitions go through supabase.rpc(...) — there are
//     deliberately no direct writes to pairings/sessions/confirmations/
//     tokens (the DB has no client write policies on them);
//   • identity privacy is the DB's job: browse rows and pre-acceptance
//     pairing rows simply contain no user ids. Do not try to join
//     profiles onto them.

const notConfigured = () => ({ data: null, error: new Error('Supabase not configured.') })

// ── Communities ──────────────────────────────────────────────────

/** Resolve a community id by slug (the pilot uses 'rotman'). */
export async function fetchCommunityBySlug(slug = 'rotman') {
  if (!isSupabaseConfigured) return notConfigured()
  const { data, error } = await supabase
    .from('communities')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle()
  return { data, error }
}

/** Is the current user a member of this community? (reads own rows only) */
export async function fetchMyCommunityMembership(communityId, userId) {
  if (!isSupabaseConfigured || !communityId || !userId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('community_members')
    .select('community_id, status, source, joined_at')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .eq('status', 'member')
    .maybeSingle()
  return { data, error }
}

// ── My practice request (Stage B: owner-only reads/writes) ──────

export async function fetchMyPracticeRequest(userId, communityId) {
  if (!isSupabaseConfigured || !userId || !communityId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('practice_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('community_id', communityId)
    .eq('status', 'active')
    .maybeSingle()
  return { data, error }
}

/**
 * Create my request. One active request per user per community —
 * the DB unique index enforces it; surface its violation cleanly.
 */
export async function createPracticeRequest({
  userId, communityId, wantTypes, wantFocus = '', helpTypes, helpFocus = '',
  helpContext = '', locationType = 'virtual', durationMinutes = 60, timezone,
}) {
  if (!isSupabaseConfigured) return notConfigured()
  const { data, error } = await supabase
    .from('practice_requests')
    .insert({
      user_id: userId,
      community_id: communityId,
      want_types: wantTypes,
      want_focus: wantFocus,
      help_types: helpTypes,
      help_focus: helpFocus,
      help_context: helpContext,
      location_type: locationType,
      duration_minutes: durationMinutes,
      timezone,
    })
    .select()
    .single()
  return { data, error }
}

export async function updatePracticeRequest(requestId, patch) {
  if (!isSupabaseConfigured) return notConfigured()
  const { data, error } = await supabase
    .from('practice_requests')
    .update(patch)
    .eq('id', requestId)
    .select()
  if (error) return { data: null, error }
  if (!data || data.length === 0) {
    return { data: null, error: new Error('Update had no effect — check ownership/RLS.') }
  }
  return { data: data[0], error: null }
}

/** Pause / resume / withdraw my request (owner-legal transitions only). */
export async function setPracticeRequestStatus(requestId, status) {
  return updatePracticeRequest(requestId, { status })
}

// ── Availability windows (owner-only) ────────────────────────────

export async function fetchMyAvailabilityWindows(requestId) {
  if (!isSupabaseConfigured || !requestId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_availability_windows')
    .select('id, starts_at, ends_at')
    .eq('request_id', requestId)
    .order('starts_at', { ascending: true })
  return { data: data || [], error }
}

/**
 * Replace my request's windows wholesale (the composer edits the
 * full list). Windows are { starts_at, ends_at } ISO strings —
 * ALREADY converted from wall time + IANA zone by the caller.
 */
export async function replaceAvailabilityWindows(requestId, windows) {
  if (!isSupabaseConfigured) return notConfigured()
  const del = await supabase
    .from('practice_availability_windows')
    .delete()
    .eq('request_id', requestId)
  if (del.error) return { data: null, error: del.error }
  if (!windows || windows.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_availability_windows')
    .insert(windows.map((w) => ({
      request_id: requestId,
      starts_at: w.starts_at,
      ends_at: w.ends_at,
    })))
    .select('id, starts_at, ends_at')
  return { data: data || [], error }
}

// ── Stage A: sanitized, community-scoped browse ──────────────────

/**
 * Anonymous partner cards for one community. Each row carries the
 * request content + exact windows + mutual_fit — and NO identity.
 */
export async function browsePracticeRequests(communityId) {
  if (!isSupabaseConfigured || !communityId) return { data: [], error: null }
  const { data, error } = await supabase.rpc('browse_practice_requests', {
    p_community_id: communityId,
  })
  return { data: data || [], error }
}

// ── Invitations / pairings ───────────────────────────────────────

/** All my pairings (view: counterpart identity is null until accepted). */
export async function fetchMyPairings() {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('my_practice_pairings')
    .select('*')
    .order('invited_at', { ascending: false })
  return { data: data || [], error }
}

/**
 * Invite the (anonymous) owner of a request. Returns the sanitized
 * pairing. Pass windowId to bind the invitation to ONE of the
 * partner's availability slots ("I can make this time") — accepting
 * such an invitation books that slot as a scheduled session directly.
 */
export async function sendPracticeInvitation(requestId, windowId = null) {
  if (!isSupabaseConfigured) return notConfigured()
  const { data, error } = await supabase.rpc('send_practice_invitation', {
    p_request_id: requestId,
    p_window_id: windowId,
  })
  return { data, error }
}

/** Accept — creates the Practice chat and reveals identities. */
export async function acceptPracticeInvitation(pairingId) {
  if (!isSupabaseConfigured) return notConfigured()
  const { data, error } = await supabase.rpc('accept_practice_pairing', {
    p_pairing_id: pairingId,
  })
  return { data, error }
}

export async function declinePracticeInvitation(pairingId) {
  if (!isSupabaseConfigured) return notConfigured()
  const { error } = await supabase.rpc('decline_practice_invitation', {
    p_pairing_id: pairingId,
  })
  return { error }
}

export async function withdrawPracticeInvitation(pairingId) {
  if (!isSupabaseConfigured) return notConfigured()
  const { error } = await supabase.rpc('withdraw_practice_invitation', {
    p_pairing_id: pairingId,
  })
  return { error }
}

/**
 * End an ACCEPTED partnership. Either participant may do it; the
 * other person is notified, any proposed/scheduled session is
 * cancelled, verified history and the chat remain, and the pair
 * becomes matchable again right away.
 */
export async function endPracticePairing(pairingId) {
  if (!isSupabaseConfigured) return notConfigured()
  const { data, error } = await supabase.rpc('end_practice_pairing', {
    p_pairing_id: pairingId,
  })
  return { data, error }
}

/** Live windows of BOTH sides of an accepted pairing (scheduling UI). */
export async function fetchPairingWindows(pairingId) {
  if (!isSupabaseConfigured || !pairingId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_pairing_windows')
    .select('*')
    .eq('pairing_id', pairingId)
    .order('starts_at', { ascending: true })
  return { data: data || [], error }
}

// ── Sessions: mutual propose → confirm ───────────────────────────

/** All sessions I'm part of (base-table RLS scopes to participants). */
export async function fetchMySessions() {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('*')
    .order('scheduled_start', { ascending: false })
  return { data: data || [], error }
}

/**
 * Can this database record a session agreement (mode / interview
 * category / skill focus)? Probed once, read-only. Until the session
 * modes migration runs this is false, and the scheduler keeps working
 * exactly as before rather than pretending a selection was stored.
 */
export async function fetchSessionModeSupport() {
  if (!isSupabaseConfigured) return { supported: false, error: null }
  const { error } = await supabase
    .from('practice_sessions')
    .select('session_mode')
    .limit(1)
  if (!error) return { supported: true, error: null }
  // 42703 = undefined column; PGRST204 = column not in the schema cache
  const missing = error.code === '42703' || error.code === 'PGRST204'
    || /session_mode/.test(String(error.message || ''))
  return { supported: false, error: missing ? null : error }
}

export async function proposePracticeSession({
  pairingId, scheduledStart, durationMinutes = 60, timezone,
  locationType = 'virtual', locationDetail = '',
  sessionMode = null, interviewCategory = null, skillFocus = null,
  meetingMethod = null, meetingUrl = '', meetingLocation = '',
  meetingFieldsSupported = false,
}) {
  // The meeting link is participant-private session data. Until the
  // meeting-fields migration runs it is stored in the existing
  // structured location columns, which carry the same
  // participants-only RLS. It is never put in a chat message.
  if (meetingMethod) {
    const online = meetingMethod !== 'in_person'
    locationType = online ? 'virtual' : 'in_person'
    locationDetail = online ? (meetingUrl || '').trim() : (meetingLocation || '').trim()
  }
  if (!isSupabaseConfigured) return notConfigured()
  const base = {
    p_pairing_id: pairingId,
    p_scheduled_start: scheduledStart,
    p_duration_minutes: durationMinutes,
    p_timezone: timezone,
    p_location_type: locationType,
    p_location_detail: locationDetail,
  }
  // the agreement is passed ONLY when the caller has one; the older
  // RPC signature stays valid for the un-migrated database
  let args = sessionMode
    ? { ...base, p_session_mode: sessionMode, p_interview_category: interviewCategory, p_skill_focus: skillFocus }
    : base
  if (meetingFieldsSupported && meetingMethod) {
    args = {
      ...args,
      p_meeting_method: meetingMethod,
      p_meeting_url: meetingMethod === 'in_person' ? null : (meetingUrl || '').trim(),
      p_meeting_location: meetingMethod === 'in_person' ? (meetingLocation || '').trim() : null,
    }
  }
  const { data, error } = await supabase.rpc('propose_practice_session', args)
  return { data, error }
}

export async function confirmPracticeSession(sessionId) {
  if (!isSupabaseConfigured) return notConfigured()
  const { data, error } = await supabase.rpc('confirm_practice_session', {
    p_session_id: sessionId,
  })
  return { data, error }
}

export async function declinePracticeSession(sessionId) {
  if (!isSupabaseConfigured) return notConfigured()
  const { error } = await supabase.rpc('decline_practice_session', {
    p_session_id: sessionId,
  })
  return { error }
}

export async function withdrawPracticeSession(sessionId) {
  if (!isSupabaseConfigured) return notConfigured()
  const { error } = await supabase.rpc('withdraw_practice_session', {
    p_session_id: sessionId,
  })
  return { error }
}

export async function cancelPracticeSession(sessionId, reason = '') {
  if (!isSupabaseConfigured) return notConfigured()
  const { error } = await supabase.rpc('cancel_practice_session', {
    p_session_id: sessionId,
    p_reason: reason,
  })
  return { error }
}

// ── Two-sided completion ─────────────────────────────────────────

/** Both confirmation rows of a session ("waiting for partner" UI). */
/**
 * Every confirmation row RLS lets me see: my own rows and my
 * partners' rows, for my sessions only. Powers the Practice Passport,
 * which reads roles from the real attestations rather than assuming
 * them. Another member's practice history is unreachable here.
 */
export async function fetchMyPracticeConfirmations() {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_session_confirmations')
    .select('session_id, user_id, outcome, completed_own_round, completed_partner_round, confirmed_at')
  return { data: data || [], error }
}

export async function fetchSessionConfirmations(sessionId) {
  if (!isSupabaseConfigured || !sessionId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_session_confirmations')
    .select('*')
    .eq('session_id', sessionId)
  return { data: data || [], error }
}

/**
 * Submit MY immutable confirmation. outcome: 'completed' requires
 * both round attestations true (the DB CHECK enforces it too).
 * Verification + token minting happen atomically inside the RPC.
 */
export async function submitPracticeConfirmation({
  sessionId, outcome, completedOwnRound = false, completedPartnerRound = false, noShowOf = null,
  suggestionCode = null, note = '',
}) {
  if (!isSupabaseConfigured) return notConfigured()
  const base = {
    p_session_id: sessionId,
    p_outcome: outcome,
    p_completed_own_round: completedOwnRound,
    p_completed_partner_round: completedPartnerRound,
    p_no_show_of: noShowOf,
  }
  // The private suggestion travels WITH the confirmation so the two
  // are one transaction. It is only sent when the database can store
  // it; otherwise the confirmation goes through unchanged and the
  // feedback step is never offered.
  const args = suggestionCode
    ? { ...base, p_suggestion_code: suggestionCode, p_note: (note || '').slice(0, 280) }
    : base
  const { data, error } = await supabase.rpc('submit_practice_confirmation', args)
  return { data, error }
}

/**
 * Can this database store structured practice feedback? Probed
 * read-only. False until scripts/migration-practice-feedback.sql runs,
 * and the confirmation flow simply omits the feedback step.
 */
/** Does the database have the explicit meeting columns yet? */
export async function fetchMeetingFieldsSupport() {
  if (!isSupabaseConfigured) return { supported: false, error: null }
  const { error } = await supabase
    .from('practice_sessions')
    .select('meeting_method')
    .limit(1)
  if (!error) return { supported: true, error: null }
  const missing = error.code === '42703' || error.code === 'PGRST204'
    || /meeting_method/.test(String(error.message || ''))
  return { supported: false, error: missing ? null : error }
}

export async function fetchFeedbackSupport() {
  if (!isSupabaseConfigured) return { supported: false, error: null }
  const { error } = await supabase
    .from('practice_session_feedback')
    .select('id')
    .limit(1)
  if (!error) return { supported: true, error: null }
  const missing = error.code === '42P01' || error.code === 'PGRST205'
    || /practice_session_feedback/.test(String(error.message || ''))
  return { supported: false, error: missing ? null : error }
}

/**
 * Feedback RLS lets me read exactly two things: what was written FOR
 * me, and what I wrote. Nobody else's history is reachable here.
 */
export async function fetchMyPracticeFeedback() {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_session_feedback')
    .select('id, session_id, author_user_id, recipient_user_id, suggestion_code, note, created_at, reported_at')
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

/** Recipient flags a piece of feedback for review. */
export async function reportPracticeFeedback(feedbackId) {
  if (!isSupabaseConfigured) return notConfigured()
  const { data, error } = await supabase.rpc('report_practice_feedback', {
    p_feedback_id: feedbackId,
  })
  return { data, error }
}

// ── Verified exchanges + relationship edges (read-only) ──────────

/** My shared Exchange Tokens (RLS self-scopes to my own). */
export async function fetchMyExchangeTokens() {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_exchange_tokens')
    .select('*')
    .order('verified_at', { ascending: false })
  return { data: data || [], error }
}

/**
 * Resolve names/avatars for ALREADY-REVEALED counterparts (accepted
 * pairings, token partners). Never call this with ids from anonymous
 * surfaces — pre-acceptance rows don't carry ids by construction.
 */
export async function fetchProfilesByIds(ids = []) {
  if (!isSupabaseConfigured || ids.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, program')
    .in('id', [...new Set(ids)])
  if (error) return { data: {}, error }
  return { data: Object.fromEntries((data || []).map((p) => [p.id, p])), error: null }
}

/** My per-community relationship edges (view self-scopes). */
export async function fetchMyPracticeEdges() {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('practice_relationship_edges')
    .select('*')
  return { data: data || [], error }
}

/**
 * Community Map read models — the two RPCs proposed in
 * scripts/migration-community-network-graph.sql (v8). Until the
 * founder runs that migration they return errorKind 'missing'.
 * errorKind: null | 'missing' | 'denied' | 'error'
 */
// "Public status, private relationships": the browser only ever calls
// these two reads. community_map_summary carries NO pair edges and NO
// pair token counts; my_relationship_graph returns only relationships
// the caller participates in. (The old community_network_graph RPC,
// which sent the full edge list to every member, is dropped by the v8
// migration and is deliberately not callable from here.)
async function rpcWithKind(fn, communityId) {
  if (!isSupabaseConfigured || !communityId) return { data: null, error: null, errorKind: 'missing' }
  const { data, error } = await supabase.rpc(fn, { p_community_id: communityId })
  if (!error) return { data, error: null, errorKind: null }
  const msg = String(error.message || '')
  const kind =
    error.code === 'PGRST202' || /could not find the function|does not exist/i.test(msg) ? 'missing'
      : /not_eligible|not_authenticated|permission denied/i.test(msg) ? 'denied'
        : 'error'
  return { data: null, error, errorKind: kind }
}

export function fetchCommunityMapSummary(communityId) {
  return rpcWithKind('community_map_summary', communityId)
}

export function fetchMyRelationshipGraph(communityId) {
  return rpcWithKind('my_relationship_graph', communityId)
}
