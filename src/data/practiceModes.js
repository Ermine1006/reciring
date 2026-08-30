// ── Practice session modes: THE single source of truth ──────────────
// Mode labels, descriptions, approximate durations, interview
// categories, skill taxonomies, validation and Passport display
// labels all live here. Components import them; they never re-declare
// a label, a duration or a skill list.
//
// Both modes are RECIPROCAL: each person practises and each person
// supports their partner's round. A verified session still produces
// exactly one shared Token, whichever mode it was.
//
// Copy rule: never claim readiness, mastery, expertise or guaranteed
// improvement. We describe what two people agreed to do together.

export const SESSION_MODES = {
  full_mock_swap: {
    key: 'full_mock_swap',
    label: 'Full Mock Swap',
    description: 'Complete one full mock round each, then exchange feedback.',
    // Displayed as an approximation, never as a promise.
    approxMinutes: 75,
    durationLabel: 'About 75 min',
    agreement: 'You will each complete one candidate round and one interviewer round.',
    // skill focus is optional here, and never the only thing practised
    focus: 'optional',
    focusHint: 'Optional. One area you would like feedback on, not the only thing you will practise.',
    ownRoundLabel: 'I completed my mock interview round',
    partnerRoundLabel: 'I supported my partner’s round and gave feedback',
  },
  quick_skill_drill: {
    key: 'quick_skill_drill',
    label: 'Quick Skill Drill',
    description: 'Focus on one interview skill and practise it together.',
    approxMinutes: 30,
    durationLabel: 'About 30 min',
    agreement: 'You will each practise the selected skill and exchange feedback.',
    // a drill without a focus is just a short interview, so it is required
    focus: 'required',
    focusHint: 'Choose the one skill you will both practise.',
    ownRoundLabel: 'I completed my skill exercise',
    partnerRoundLabel: 'I supported my partner’s exercise and gave feedback',
  },
}
export const SESSION_MODE_KEYS = Object.keys(SESSION_MODES)

// Only categories with a defined workflow AND a structured rubric.
export const INTERVIEW_CATEGORIES = {
  case: { key: 'case', label: 'Case interview' },
  behavioural: { key: 'behavioural', label: 'Behavioural interview' },
}
export const INTERVIEW_CATEGORY_KEYS = Object.keys(INTERVIEW_CATEGORIES)

// Two separate rubrics. They are never merged, never offered together.
export const SKILLS_BY_CATEGORY = {
  case: [
    { key: 'problem_clarification', label: 'Problem clarification' },
    { key: 'hypothesis_development', label: 'Hypothesis development' },
    { key: 'structuring', label: 'Structuring' },
    { key: 'quantitative_reasoning', label: 'Quantitative reasoning' },
    { key: 'exhibit_interpretation', label: 'Exhibit interpretation' },
    { key: 'synthesis', label: 'Synthesis' },
    { key: 'final_recommendation', label: 'Final recommendation' },
    { key: 'communication', label: 'Communication' },
  ],
  behavioural: [
    { key: 'story_selection', label: 'Story selection' },
    { key: 'situation_and_context', label: 'Situation and context' },
    { key: 'personal_actions', label: 'Personal actions' },
    { key: 'results_and_impact', label: 'Results and impact' },
    { key: 'reflection_and_learning', label: 'Reflection and learning' },
    { key: 'concision', label: 'Concision' },
    { key: 'follow_up_questions', label: 'Follow-up questions' },
    { key: 'executive_presence', label: 'Executive presence' },
  ],
}

/** Every canonical skill key, whatever its category. */
export const ALL_SKILL_KEYS = Object.values(SKILLS_BY_CATEGORY)
  .flat().map((s) => s.key)

/** Shown when a historical session never recorded a structured field. */
export const NOT_RECORDED = 'Not recorded'

export const modeLabel = (key) => SESSION_MODES[key]?.label || NOT_RECORDED
export const categoryLabel = (key) => INTERVIEW_CATEGORIES[key]?.label || NOT_RECORDED
export const durationLabel = (key) => SESSION_MODES[key]?.durationLabel || null

/** A skill's label, looked up only inside its own category. */
export function skillLabel(categoryKey, skillKey) {
  if (!skillKey) return null
  const inCategory = (SKILLS_BY_CATEGORY[categoryKey] || []).find((s) => s.key === skillKey)
  if (inCategory) return inCategory.label
  // a skill from the other rubric is not a valid label here
  return null
}

/** Skills offered for a category. Never a merged list. */
export function skillsFor(categoryKey) {
  return SKILLS_BY_CATEGORY[categoryKey] || []
}

/**
 * The one validation rule set. Used by the scheduling UI before
 * proposing, by the receiving participant before accepting, and
 * mirrored by CHECK constraints in the migration proposal.
 */
export function validateSessionSetup({ mode, category, skillFocus } = {}) {
  if (!mode) return { ok: false, error: 'mode_required', message: 'Choose a mock interview mode.' }
  if (!SESSION_MODES[mode]) return { ok: false, error: 'mode_invalid', message: 'Choose a mock interview mode.' }
  if (!category) return { ok: false, error: 'category_required', message: 'Choose an interview type.' }
  if (!INTERVIEW_CATEGORIES[category]) {
    return { ok: false, error: 'category_invalid', message: 'Choose an interview type.' }
  }
  const rule = SESSION_MODES[mode].focus
  if (rule === 'required' && !skillFocus) {
    return { ok: false, error: 'skill_required', message: 'Choose the skill you will both practise.' }
  }
  if (skillFocus) {
    const valid = (SKILLS_BY_CATEGORY[category] || []).some((s) => s.key === skillFocus)
    if (!valid) {
      return { ok: false, error: 'skill_category_mismatch', message: 'That skill belongs to a different interview type.' }
    }
  }
  return { ok: true, error: null, message: null }
}

/** True when a session row carries a complete structured agreement. */
export function isStructured(session) {
  if (!session) return false
  return validateSessionSetup({
    mode: session.session_mode,
    category: session.interview_category,
    skillFocus: session.skill_focus,
  }).ok
}

/**
 * The lines both participants see, identically: on the confirmation
 * summary before proposing, on the invitation before accepting, and
 * on the scheduled session card afterwards.
 */
export function describeSession(session) {
  const mode = SESSION_MODES[session?.session_mode]
  if (!mode) {
    return { title: NOT_RECORDED, detail: NOT_RECORDED, agreement: null, focusLabel: null, structured: false }
  }
  const category = INTERVIEW_CATEGORIES[session.interview_category]
  const focus = skillLabel(session.interview_category, session.skill_focus)
  const detail = [category?.label || NOT_RECORDED, focus, mode.durationLabel]
    .filter(Boolean).join(' · ')
  return {
    title: mode.label,
    detail,
    focusLabel: focus,
    agreement: mode.agreement,
    durationLabel: mode.durationLabel,
    categoryLabel: category?.label || NOT_RECORDED,
    structured: isStructured(session),
  }
}

/** Completion wording, so a drill is never called a full interview. */
export function confirmationCopy(modeKey) {
  const mode = SESSION_MODES[modeKey]
  return {
    ownRound: mode?.ownRoundLabel || 'I completed my mock interview round',
    partnerRound: mode?.partnerRoundLabel || 'I supported my partner’s round and gave feedback',
  }
}
