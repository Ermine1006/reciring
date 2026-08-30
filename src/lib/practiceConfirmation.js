import { SESSION_MODES } from '../data/practiceModes'
import { NOTE_MAX, ALL_SUGGESTION_CODES, SUGGESTIONS, suggestionLabel } from '../data/practiceFeedback'

// ── Completion confirmation: mapping and validation ─────────────────
// The DATABASE decides whether a practice happened. This layer only
// turns three plain questions into the outcomes the existing
// submit_practice_confirmation RPC already accepts, and checks a
// submission before it is sent.
//
// THE RPC's OUTCOMES (unchanged, and the only ones that exist):
//   'completed'  requires BOTH round attestations (DB CHECK
//                psc_completed_is_reciprocal)
//   'no_show'    the practice did not happen, optionally naming who
//                did not attend
//   'cancelled'  the practice did not happen as agreed
//
// KNOWN GAP, reported rather than papered over: "It happened, but we
// did not complete both roles" has no outcome of its own. The schema
// cannot record a half-completed reciprocal exchange, because
// 'completed' demands both rounds. It maps to 'cancelled', which is
// the only honest existing value: no verification, no Token. A future
// migration could add a distinct 'partial' outcome.

export const ANSWERS = {
  completed: {
    key: 'completed',
    label: 'Yes, we completed it',
    outcome: 'completed',
    needsRoles: true,
  },
  partial: {
    key: 'partial',
    label: 'It happened, but we did not complete both roles',
    // no dedicated outcome exists; this is not a verified practice
    outcome: 'cancelled',
    needsRoles: false,
    note: 'This will not be verified and no Token is created.',
  },
  did_not_happen: {
    key: 'did_not_happen',
    label: 'No, it did not happen',
    outcome: 'no_show',
    needsRoles: false,
    needsReason: true,
  },
}
export const ANSWER_KEYS = Object.keys(ANSWERS)

/** Private, operational only. Never public, never a score or badge. */
export const DID_NOT_HAPPEN_REASONS = [
  { code: 'scheduling_conflict', label: 'Scheduling conflict', outcome: 'cancelled' },
  { code: 'partner_absent', label: 'Partner did not attend', outcome: 'no_show', blames: 'partner' },
  { code: 'i_could_not_attend', label: 'I could not attend', outcome: 'no_show', blames: 'me' },
  { code: 'technical_issue', label: 'Technical issue', outcome: 'cancelled' },
  { code: 'other', label: 'Other', outcome: 'cancelled' },
]

/** Round wording follows the mode that was actually agreed. */
export function roleLabels(session) {
  const drill = session?.session_mode === 'quick_skill_drill'
  const noun = drill ? 'skill drill' : 'mock interview round'
  return {
    own: `I completed my ${noun}`,
    partner: `I supported my partner’s ${noun} and gave feedback`,
    noun,
  }
}

/**
 * Turn the answers into the exact RPC arguments. Returns null when the
 * form is not ready, so a half-filled screen can never be submitted.
 */
export function buildSubmission({
  answer, ownRound = false, partnerRound = false,
  reasonCode = null, partnerUserId = null, myUserId = null,
  suggestionCode = null, note = '',
} = {}) {
  const a = ANSWERS[answer]
  if (!a) return null

  if (a.key === 'completed') {
    // the database refuses a 'completed' outcome without both rounds,
    // so the UI must have both explicitly checked
    if (!ownRound || !partnerRound) return null
    return {
      outcome: 'completed',
      completedOwnRound: true,
      completedPartnerRound: true,
      noShowOf: null,
      suggestionCode: suggestionCode || null,
      note: (note || '').trim().slice(0, NOTE_MAX),
    }
  }

  if (a.key === 'partial') {
    return {
      outcome: 'cancelled',
      completedOwnRound: false,
      completedPartnerRound: false,
      noShowOf: null,
      suggestionCode: null,
      note: '',
    }
  }

  // did not happen
  const reason = DID_NOT_HAPPEN_REASONS.find((r) => r.code === reasonCode)
  if (!reason) return null
  const noShowOf = reason.blames === 'partner' ? partnerUserId
    : reason.blames === 'me' ? myUserId : null
  return {
    outcome: reason.outcome,
    completedOwnRound: false,
    completedPartnerRound: false,
    noShowOf,
    reasonCode: reason.code,
    suggestionCode: null,
    note: '',
  }
}

/** A suggestion is valid only inside the session's own category. */
export function validateFeedback({ interviewCategory, suggestionCode, note = '' } = {}) {
  if (!suggestionCode) return { ok: true, error: null }        // feedback is optional
  if (!ALL_SUGGESTION_CODES.includes(suggestionCode)) {
    return { ok: false, error: 'unknown_suggestion' }
  }
  const inCategory = (SUGGESTIONS[interviewCategory] || []).some((s) => s.code === suggestionCode)
  if (!inCategory) return { ok: false, error: 'suggestion_category_mismatch' }
  if ((note || '').length > NOTE_MAX) return { ok: false, error: 'note_too_long' }
  return { ok: true, error: null }
}

/**
 * May this user confirm right now? Mirrors the RPC's own checks so the
 * UI never offers a button the database will refuse. Finishing the
 * Guided Mode is NOT one of these conditions.
 */
export function canConfirm({ session, userId, myConfirmed = false, now = new Date() } = {}) {
  if (!session || !userId) return { ok: false, reason: 'no_session' }
  if (![session.participant_a_user_id, session.participant_b_user_id].includes(userId)) {
    return { ok: false, reason: 'not_participant' }
  }
  if (myConfirmed) return { ok: false, reason: 'already_confirmed' }
  const confirmable = ['scheduled', 'completed_pending_confirmation']
  if (!confirmable.includes(session.status)) return { ok: false, reason: 'invalid_state' }
  if (new Date(session.scheduled_start) > now) return { ok: false, reason: 'not_started' }
  return { ok: true, reason: null }
}

/** The exact lines shown before an immutable submission. */
export function reviewLines({ session, answer, suggestionCode, note, reasonCode }) {
  const mode = SESSION_MODES[session?.session_mode]?.label || 'practice'
  const lines = []
  if (answer === 'completed') {
    lines.push(`The ${mode} happened`)
    lines.push('Both agreed roles were completed')
    const label = suggestionLabel(session?.interview_category, suggestionCode)
    if (label) lines.push(`Private suggestion: ${label}`)
    if ((note || '').trim()) lines.push('With a short private note')
  } else if (answer === 'partial') {
    lines.push(`The ${mode} happened`)
    lines.push('Both roles were not completed, so this will not be verified')
  } else {
    lines.push(`The ${mode} did not happen`)
    const reason = DID_NOT_HAPPEN_REASONS.find((r) => r.code === reasonCode)
    if (reason) lines.push(`Reason kept private: ${reason.label}`)
  }
  return lines
}
