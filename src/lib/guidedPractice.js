import { isStructured, SESSION_MODES, INTERVIEW_CATEGORIES, skillLabel } from '../data/practiceModes'
import {
  GUIDE_VERSION, FULL_MOCK_GUIDES, DRILLS_BY_CATEGORY,
  FEEDBACK_PROMPTS, MATERIAL_NOTE,
} from '../data/practiceGuides'

// ── Guided Practice: eligibility, roles, stages, local state ────────
// Pure functions. The guide FACILITATES a session; it never decides
// that one happened.
//
// AUTHORITATIVE vs LOCAL
//   Authoritative (database, unchanged by this step): the session row,
//   its mode / category / skill focus, both confirmations, the
//   verified status and the one shared Token.
//   Local (this device only): which round and stage you are on, and
//   the timer. It is UI position, not evidence. Nothing here can
//   verify a session, mint a Token, move a Passport number, or touch
//   the partner's screen.
//
// NO SYNCHRONISATION EXISTS. Both people open the same guide and see
// the same stages, each from their own role's perspective, but each
// device advances on its own. The UI never implies otherwise.

export { GUIDE_VERSION }

export const GUIDE_UNAVAILABLE =
  'Guided mock interview is unavailable because this session’s format was not recorded'

/**
 * May this user open the guide for this session?
 * Participant + active pairing + scheduled + a complete Step 2
 * agreement. A historical session without a recorded format gets a
 * clear explanation, never a guessed guide.
 */
export function guideAvailability({ session, pairing, userId } = {}) {
  if (!session || !userId) return { ok: false, reason: 'no_session' }
  const participants = [session.participant_a_user_id, session.participant_b_user_id]
  if (!participants.includes(userId)) return { ok: false, reason: 'not_participant' }
  if (pairing && !['accepted'].includes(pairing.status)) return { ok: false, reason: 'pairing_inactive' }
  if (session.status !== 'scheduled') return { ok: false, reason: 'not_scheduled' }
  if (!isStructured(session)) return { ok: false, reason: 'format_not_recorded', message: GUIDE_UNAVAILABLE }
  if (!resolveGuide(session)) return { ok: false, reason: 'no_guide', message: GUIDE_UNAVAILABLE }
  return { ok: true, reason: null }
}

/** The guide for this session's agreement, or null. Never a fallback. */
export function resolveGuide(session) {
  if (!session || !isStructured(session)) return null
  const { session_mode: mode, interview_category: category, skill_focus: skill } = session
  if (mode === 'full_mock_swap') return FULL_MOCK_GUIDES[category] || null
  if (mode === 'quick_skill_drill') {
    // a skill only ever resolves inside its own category
    const drill = (DRILLS_BY_CATEGORY[category] || {})[skill]
    if (!drill) return null
    return { ...drill, key: `quick_skill_drill:${category}:${skill}`, mode, category, skillKey: skill }
  }
  return null
}

/** The stages a guide runs through, one screen at a time. */
export function guideStages(guide) {
  if (!guide) return []
  if (guide.stages) return guide.stages
  // a drill is short by design: set up, practise, feedback
  return [
    {
      key: 'set_up',
      title: 'Set up',
      time: null,
      shared: [...(guide.setup || []), MATERIAL_NOTE],
      note: guide.objective,
      cta: 'Begin the drill',
    },
    {
      key: 'practise',
      title: guide.title,
      time: guide.time,
      steps: guide.steps || [],
      observe: guide.observe || [],
      note: guide.note || null,
    },
    {
      key: 'feedback',
      title: 'Feedback and switch',
      time: '2-3 min',
      shared: FEEDBACK_PROMPTS,
      note: 'Say it out loud. Nothing here is recorded.',
      cta: 'Finish round',
    },
  ]
}

/**
 * Who is the candidate in this round?
 * Round 1 uses the session's stored first interviewee. Round 2 always
 * reverses it. When the session never stored one, the participants
 * pick locally (`localFirst`) and nothing is written to the database.
 */
export function rolesForRound({ session, userId, round = 1, localFirst = null } = {}) {
  if (!session || !userId) return { role: null, partnerRole: null, resolved: false }
  const a = session.participant_a_user_id
  const b = session.participant_b_user_id
  const stored = session.round1_interviewee_user_id
  const valid = stored && [a, b].includes(stored)
  const firstCandidate = valid ? stored : ([a, b].includes(localFirst) ? localFirst : null)
  if (!firstCandidate) return { role: null, partnerRole: null, resolved: false, needsChoice: true }
  const candidateThisRound = round === 1
    ? firstCandidate
    : (firstCandidate === a ? b : a)
  const iAmCandidate = candidateThisRound === userId
  return {
    role: iAmCandidate ? 'candidate' : 'interviewer',
    partnerRole: iAmCandidate ? 'interviewer' : 'candidate',
    candidateUserId: candidateThisRound,
    resolved: true,
    fromSession: Boolean(valid),
  }
}

export const ROLE_LABEL = { candidate: 'You are Candidate', interviewer: 'You are Interviewer' }

/** What this user should read at this stage, for their own role. */
export function stageInstructions(stage, role) {
  if (!stage) return []
  if (stage.shared) return stage.shared
  if (stage.steps) return stage.steps
  return (role === 'candidate' ? stage.candidate : stage.interviewer) || []
}

/** "What to observe" belongs to whoever is watching this round. */
export function stageObservations(stage, role) {
  if (!stage) return []
  if (role === 'interviewer') return stage.observe || []
  return []
}

/** Suggested seconds for a stage, from copy like "3-5 min". Null when
 *  the stage has no suggested time. Guidance only, never a limit. */
export function suggestedSeconds(stage) {
  const t = stage?.time
  if (!t) return null
  const nums = String(t).match(/\d+/g)
  if (!nums) return null
  // a range suggests the upper bound, so nobody feels rushed
  return Number(nums[nums.length - 1]) * 60
}

export const totalStages = (guide) => guideStages(guide).length

/** Where the guide goes next. Never advances by itself. */
export function nextPosition({ guide, round, stageIndex }) {
  const last = totalStages(guide) - 1
  if (stageIndex < last) return { round, stageIndex: stageIndex + 1, done: false, switching: false }
  if (round === 1) return { round: 2, stageIndex: 0, done: false, switching: true }
  return { round, stageIndex, done: true, switching: false }
}

// ── Local, non-authoritative progress ───────────────────────────────
// Keyed by user + session + guide version, so one person's position
// can never appear on another account, another session, or after the
// guide itself changes shape.

export const guideStateKey = ({ userId, sessionId }) =>
  `mutu_guide:${GUIDE_VERSION}:${userId || 'anon'}:${sessionId || 'none'}`

/** Statuses after which local guide position is meaningless. */
const CLEARED_STATUSES = ['verified', 'cancelled', 'declined', 'withdrawn', 'expired', 'no_show', 'disputed']
export const shouldClearGuideState = (session) =>
  Boolean(session && CLEARED_STATUSES.includes(session.status))

export function loadGuideState({ userId, sessionId, storage }) {
  const store = storage || safeStorage()
  if (!store) return null
  try {
    const raw = store.getItem(guideStateKey({ userId, sessionId }))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== GUIDE_VERSION) return null
    return parsed
  } catch { return null }
}

export function saveGuideState({ userId, sessionId, state, storage }) {
  const store = storage || safeStorage()
  if (!store) return
  try {
    store.setItem(guideStateKey({ userId, sessionId }),
      JSON.stringify({ ...state, version: GUIDE_VERSION }))
  } catch { /* a full or blocked store must never break the guide */ }
}

export function clearGuideState({ userId, sessionId, storage }) {
  const store = storage || safeStorage()
  if (!store) return
  try { store.removeItem(guideStateKey({ userId, sessionId })) } catch { /* ignore */ }
}

function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

/** A short, honest description of the session for the lobby header. */
export function lobbySummary(session) {
  const mode = SESSION_MODES[session?.session_mode]
  const category = INTERVIEW_CATEGORIES[session?.interview_category]
  if (!mode || !category) return null
  const focus = skillLabel(session.interview_category, session.skill_focus)
  return {
    title: mode.label,
    detail: [category.label, focus, mode.durationLabel].filter(Boolean).join(' · '),
    agreement: mode.agreement,
  }
}
