// ── The mock interview slice of Ask Mutu's grounding ──────────────
// Ask Mutu was built before the practice pilot and never learned about
// it, which is why it could not answer anything about interviews. This
// assembles that missing context from rows the app has already loaded.
//
// Two things are excluded by construction rather than by care:
//   • meeting URLs and locations — a link is participant-private
//     scheduling data, and an assistant answer is the easiest place
//     for it to end up somewhere it should not be;
//   • the free text of private feedback — those are the partner's own
//     words about the user. The controlled suggestion CODE is
//     included, because it is a fixed vocabulary the user already
//     sees in their Passport and it is what makes "what should I work
//     on next" answerable.
//
// Nothing here evaluates the user. The assistant is given counts and
// agreements, never a judgement about how anyone performed.

import { PRACTICE_TYPE_LABELS } from '../data/practiceOptions'
import { describeSession } from '../data/practiceModes'
import { suggestionLabelAnywhere } from '../data/practiceFeedback'
import { availabilitySummary } from './togetherSummary'

const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : null)
const labels = (types = []) => (types || []).map((t) => PRACTICE_TYPE_LABELS[t] || t)

/**
 * @returns null when the member has never touched practice, so the
 *          assistant is not handed an object full of zeroes to
 *          misread as "they tried and failed".
 */
export function buildPracticeContext({
  myRequest = null,
  myWindows = [],
  pairings = [],
  sessions = [],
  passport = null,
  feedback = [],
  namesById = {},
  userId = null,
  now = new Date(),
} = {}) {
  const accepted = (pairings || []).filter((p) => p && p.status === 'accepted')
  const verified = passport?.verified || 0
  if (!myRequest && accepted.length === 0 && verified === 0) return null

  const nameOf = (id) => {
    const n = namesById[id]
    return (typeof n === 'string' ? n : n?.name) || null
  }
  const sessionsByPairing = new Map()
  for (const s of sessions || []) {
    if (!s?.pairing_id) continue
    const prev = sessionsByPairing.get(s.pairing_id)
    if (!prev || String(s.scheduled_start) > String(prev.scheduled_start)) {
      sessionsByPairing.set(s.pairing_id, s)
    }
  }

  return {
    // Where they stand in the pool, in their own words
    in_pool: Boolean(myRequest && myRequest.status === 'active'),
    my_listing: myRequest ? {
      want_to_practise: labels(myRequest.want_types),
      want_focus:       myRequest.want_focus || null,
      can_help_with:    labels(myRequest.help_types),
      help_focus:       myRequest.help_focus || null,
      session_length:   myRequest.duration_minutes ? `${myRequest.duration_minutes} min` : null,
      availability:     availabilitySummary(myWindows, myRequest.timezone, now) || null,
      status:           myRequest.status || null,
    } : null,

    // What they have actually completed. Server-derived, never inferred.
    record: passport ? {
      verified_practices: passport.verified || 0,
      different_partners: passport.partners || 0,
      candidate_rounds:   passport.candidateRounds || 0,
      interviewer_rounds: passport.interviewerRounds || 0,
      shared_tokens:      passport.tokenCount || 0,
    } : null,

    partners: accepted.map((p) => {
      const s = sessionsByPairing.get(p.id) || null
      return {
        name: nameOf(p.counterpart_user_id),
        // what is true between the two of them right now
        has_upcoming_session: Boolean(s && s.status === 'scheduled'),
        awaiting_confirmation: Boolean(s && s.status === 'completed_pending_confirmation'),
      }
    }).filter((p) => p.name),

    upcoming_sessions: (sessions || [])
      .filter((s) => s && s.status === 'scheduled' && s.scheduled_start
        && new Date(s.scheduled_start) > now)
      .sort((a, b) => String(a.scheduled_start).localeCompare(String(b.scheduled_start)))
      .slice(0, 5)
      .map((s) => {
        const d = describeSession(s)
        const partnerId = s.participant_a_user_id === userId
          ? s.participant_b_user_id : s.participant_a_user_id
        return {
          with: nameOf(partnerId),
          date: day(s.scheduled_start),
          mode: d.structured ? d.title : null,
          interview_type: d.structured ? d.categoryLabel : null,
          focus: d.focusLabel || null,
          // deliberately no meeting_url, no location: private scheduling data
        }
      }),

    needs_confirmation: (sessions || [])
      .filter((s) => s && s.status === 'completed_pending_confirmation')
      .map((s) => {
        const partnerId = s.participant_a_user_id === userId
          ? s.participant_b_user_id : s.participant_a_user_id
        return { with: nameOf(partnerId), date: day(s.scheduled_start) }
      }),

    // Suggestion CODES only, as labels. Never the partner's own words.
    suggestions_received: (feedback || [])
      .filter((f) => f && f.recipient_user_id === userId && f.suggestion_code && !f.reported_at)
      .slice(0, 6)
      .map((f) => suggestionLabelAnywhere(f.suggestion_code))
      .filter(Boolean),
  }
}
