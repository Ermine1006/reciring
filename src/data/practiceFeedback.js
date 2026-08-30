// ── Private practice feedback: THE taxonomy ─────────────────────────
// One controlled vocabulary, shared by the UI, the Passport inbox and
// the CHECK constraint in scripts/migration-practice-feedback.sql.
// The CODE is the data; the label is only how we say it today.
//
// Feedback here answers exactly one question: what is one thing your
// partner should try next. It is never a rating, a score, a ranking or
// a judgement of the person. It is private to the two participants.

export const NOTE_MAX = 280

/** Shown above the question, every time. */
export const FEEDBACK_FRAMING =
  'Keep it specific, constructive and focused on the next attempt.'
export const FEEDBACK_QUESTION = 'What is one thing your partner should try next?'
export const NOTE_LABEL = 'Add a specific example'

// Suggestions are about the WORK in the next attempt, never the person.
// Nothing here touches personality, accent, appearance, cultural style,
// disability or any protected characteristic.
export const SUGGESTIONS = {
  case: [
    { code: 'clarify_objective_earlier', label: 'Clarify the objective earlier', skills: ['problem_clarification'] },
    { code: 'tailor_structure', label: 'Make the structure more tailored', skills: ['structuring', 'hypothesis_development'] },
    { code: 'explain_calculations', label: 'Explain calculations more clearly', skills: ['quantitative_reasoning'] },
    { code: 'connect_insight_to_question', label: 'Connect insights to the business question', skills: ['exhibit_interpretation', 'synthesis'] },
    { code: 'recommendation_more_direct', label: 'Make the recommendation more direct', skills: ['final_recommendation'] },
    { code: 'communicate_concisely', label: 'Communicate more concisely', skills: ['communication'] },
    { code: 'other', label: 'Other', skills: [] },
  ],
  behavioural: [
    { code: 'clearer_context', label: 'Give clearer context', skills: ['situation_and_context', 'story_selection'] },
    { code: 'emphasise_personal_actions', label: 'Emphasise personal actions', skills: ['personal_actions'] },
    { code: 'add_evidence_of_impact', label: 'Add evidence of impact', skills: ['results_and_impact'] },
    { code: 'sharper_reflection', label: 'Make the reflection more specific', skills: ['reflection_and_learning'] },
    { code: 'answer_more_concisely', label: 'Answer more concisely', skills: ['concision', 'follow_up_questions'] },
    { code: 'strengthen_delivery', label: 'Strengthen delivery and presence', skills: ['executive_presence'] },
    { code: 'other', label: 'Other', skills: [] },
  ],
}

export const ALL_SUGGESTION_CODES = Object.values(SUGGESTIONS)
  .flat().map((s) => s.code)

/**
 * The options to offer, for this session. A Quick Skill Drill puts the
 * suggestions tied to its selected skill first, so the most useful
 * next step is the easiest one to pick.
 */
export function suggestionsFor({ interviewCategory, skillFocus } = {}) {
  const list = SUGGESTIONS[interviewCategory] || []
  if (!skillFocus) return list
  const related = list.filter((s) => s.skills.includes(skillFocus))
  const rest = list.filter((s) => !s.skills.includes(skillFocus))
  return [...related, ...rest]
}

/** A code's label inside its own category. Null when it does not belong. */
export function suggestionLabel(interviewCategory, code) {
  if (!code) return null
  return (SUGGESTIONS[interviewCategory] || []).find((s) => s.code === code)?.label || null
}

/** Any category: used by the Passport inbox, which knows the session. */
export function suggestionLabelAnywhere(code) {
  if (!code) return null
  return Object.values(SUGGESTIONS).flat().find((s) => s.code === code)?.label || null
}
