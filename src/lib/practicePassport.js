// ── Practice Passport: THE canonical calculation layer ──────────────
// Every Passport number in the product comes from here: the compact
// card, the detailed sheet, milestones, recommendations and any later
// reporting. Pure functions only, so the counting rules are testable
// and cannot drift between surfaces.
//
// WHAT COUNTS (all of these, or it does not count)
//   · the session is a Practice session in THIS community
//   · its status is 'verified' — both participants submitted a
//     'completed' confirmation, which is what the RPC requires before
//     it flips the status and mints the shared Token
//   · the signed-in user is one of the two participants
//   · the partner is not blocked
// Scheduled, proposed, declined, withdrawn, expired, cancelled,
// no_show, disputed and one-sided 'completed_pending_confirmation'
// sessions never count.
//
// NO DOUBLE COUNTING
//   · a session is counted once even though it produces TWO
//     confirmation rows (one per participant)
//   · a session is counted once even though it contains TWO role
//     rounds (the reciprocal model: each person practises and each
//     person interviews)
//   · one verified session mints at most one shared Token, so token
//     counts and verified-practice counts stay in step
//
// ROLES (read from the confirmation rows, never assumed)
//   completed_own_round     → the user practised: a CANDIDATE round
//   completed_partner_round → the user ran their partner's round and
//                             gave feedback: an INTERVIEWER round
// Today the schema requires both to be true for a 'completed'
// outcome, so a verified session gives each person one of each. The
// calculation still reads the real flags, so it stays correct if
// one-directional practice is ever recorded.
//
// NOT RECORDED
//   Mode, interview category and skill focus live on the session row
//   (see scripts/migration-practice-session-modes.sql). Sessions from
//   before that migration have none, and read 'Not recorded' forever.
//   They are never inferred from chat text, request preferences,
//   Token snapshots or counts.

import {
  SESSION_MODES, SESSION_MODE_KEYS, INTERVIEW_CATEGORIES, INTERVIEW_CATEGORY_KEYS,
  SKILLS_BY_CATEGORY, isStructured,
} from '../data/practiceModes'

/** Session statuses that may ever be counted. */
export const VERIFIED_STATUS = 'verified'
/** Confirmation outcome that may ever be counted. */
export const COUNTED_OUTCOME = 'completed'

// Vocabularies come from ONE place: src/data/practiceModes.js.
// Nothing is re-declared here, so the scheduler, the session card,
// the confirmation copy and the Passport can never disagree.

/** Every milestone threshold lives here, and nowhere else. */
export const MILESTONE_THRESHOLDS = {
  first_live_practice: { verified: 1 },
  practice_explorer:   { verified: 3, partners: 2 },
  variety_builder:     { verified: 5, partners: 3 },
  role_balanced:       { candidateRounds: 2, interviewerRounds: 2 },
  helpful_interviewer: { helpfulInterviewerRounds: 3 },
}

export const MILESTONES = [
  { id: 'first_live_practice', label: 'First Live Mock Interview', hint: 'Complete 1 verified mock interview' },
  { id: 'practice_explorer',   label: 'Mock Interview Explorer',   hint: '3 verified mock interviews with at least 2 partners' },
  { id: 'variety_builder',     label: 'Variety Builder',     hint: '5 verified mock interviews with at least 3 partners' },
  { id: 'role_balanced',       label: 'Role Balanced',       hint: 'At least 2 candidate and 2 interviewer rounds' },
  { id: 'helpful_interviewer', label: 'Helpful Interviewer',  hint: '3 verified interviewer rounds with a suggestion given' },
]

const NOT_RECORDED = 'Not recorded'

/**
 * THE Passport calculation. Everything downstream reads this result.
 *
 * @param sessions      practice_sessions rows the caller can read
 * @param confirmations practice_session_confirmations rows (both
 *                      participants' rows for the caller's sessions)
 * @param rounds        practice_session_rounds rows — empty until the
 *                      rounds migration runs, which is why type and
 *                      skill coverage read 'Not recorded' today
 * @param blockedUserIds partners to exclude in both directions
 * @param namesById     already-unlocked identities only
 */
export function computePassport({
  userId,
  communityId = null,
  sessions = [],
  confirmations = [],
  rounds = [],
  tokens = [],
  feedback = [],
  feedbackSupported = false,
  blockedUserIds = new Set(),
  namesById = {},
  goal = '',
} = {}) {
  const blocked = blockedUserIds instanceof Set ? blockedUserIds : new Set(blockedUserIds || [])
  const partnerOf = (s) => (s.participant_a_user_id === userId ? s.participant_b_user_id : s.participant_a_user_id)

  // 1. eligible sessions — deduplicated by id, so a session can never
  //    be counted twice however many rows join onto it
  const eligible = new Map()
  for (const s of sessions) {
    if (!s || eligible.has(s.id)) continue
    if (s.status !== VERIFIED_STATUS) continue
    if (communityId && s.community_id !== communityId) continue
    if (![s.participant_a_user_id, s.participant_b_user_id].includes(userId)) continue
    const partner = partnerOf(s)
    if (!partner || partner === userId) continue
    if (blocked.has(partner)) continue
    eligible.set(s.id, s)
  }

  // 2. my role rounds, read from my own confirmation rows only
  let candidateRounds = 0
  let interviewerRounds = 0
  let reciprocalSessions = 0
  const seenConfirmation = new Set()
  for (const c of confirmations) {
    if (!c || c.user_id !== userId) continue
    if (c.outcome !== COUNTED_OUTCOME) continue
    if (!eligible.has(c.session_id)) continue
    if (seenConfirmation.has(c.session_id)) continue     // one row per session
    seenConfirmation.add(c.session_id)
    if (c.completed_own_round) candidateRounds += 1
    if (c.completed_partner_round) interviewerRounds += 1
    if (c.completed_own_round && c.completed_partner_round) reciprocalSessions += 1
  }

  // 3. partners, deduplicated
  const partnerIds = new Set()
  let lastVerifiedAt = null
  for (const s of eligible.values()) {
    partnerIds.add(partnerOf(s))
    const at = s.verified_at || s.completed_at || null
    if (at && (!lastVerifiedAt || new Date(at) > new Date(lastVerifiedAt))) lastVerifiedAt = at
  }

  // 4. mode / category / skill coverage — read from the SESSION row,
  //    and only when it actually carries a complete agreement. A
  //    historical session contributes nothing here rather than a guess.
  const modeCounts = new Map()
  const categoryCounts = new Map()
  const skillCounts = new Map()
  let structuredSessions = 0
  for (const s of eligible.values()) {
    if (!isStructured(s)) continue
    structuredSessions += 1
    modeCounts.set(s.session_mode, (modeCounts.get(s.session_mode) || 0) + 1)
    categoryCounts.set(s.interview_category, (categoryCounts.get(s.interview_category) || 0) + 1)
    // one selected skill, credited once to this user for this session
    if (s.skill_focus) {
      const k = `${s.interview_category}:${s.skill_focus}`
      skillCounts.set(k, (skillCounts.get(k) || 0) + 1)
    }
  }

  // feedback I WROTE, on verified sessions where I ran my partner's
  // round: the evidence behind Helpful Interviewer
  const feedbackGiven = new Set(
    feedback
      .filter((f) => f && f.author_user_id === userId && eligible.has(f.session_id))
      .map((f) => f.session_id)
  )
  // feedback written FOR me, newest first, for the private inbox
  const feedbackReceived = feedback
    .filter((f) => f && f.recipient_user_id === userId)
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))

  // one verified session mints at most one shared Token
  const tokenCount = new Set(
    tokens.filter((t) => t && t.session_id && eligible.has(t.session_id)).map((t) => t.session_id)
  ).size

  return {
    // the caller who owns these numbers, so presentation layers can
    // work out which participant is the partner without guessing
    userId,
    verified: eligible.size,
    // the same session set the counts are built from, exposed so the
    // Token list cannot drift from the numbers above it. Read-only:
    // no calculation depends on it.
    eligibleSessionIds: new Set(eligible.keys()),
    partners: partnerIds.size,
    partnerIds: [...partnerIds],
    // callers pass either id → 'Name' or id → profile row
    partnerNames: [...partnerIds]
      .map((id) => (typeof namesById[id] === 'string' ? namesById[id] : namesById[id]?.name) || null)
      .filter(Boolean),
    candidateRounds,
    interviewerRounds,
    reciprocalSessions,
    // Helpful Interviewer counts an interviewer round only once the
    // structured suggestion exists. Until the feedback migration runs
    // there is nothing to count, so the milestone keeps using the
    // interviewer rounds themselves rather than becoming unreachable.
    helpfulInterviewerRounds: feedbackSupported
      ? [...feedbackGiven].filter((id) => seenConfirmation.has(id)).length
      : interviewerRounds,
    feedbackSupported,
    feedbackReceived,
    tokenCount,
    lastVerifiedAt,
    goal: String(goal || '').trim(),
    // coverage is honest about what was never recorded
    structuredRecorded: structuredSessions > 0,
    structuredSessions,
    unrecordedSessions: eligible.size - structuredSessions,
    modes: SESSION_MODE_KEYS.map((k) => ({
      key: k, label: SESSION_MODES[k].label, count: modeCounts.get(k) || 0,
    })),
    categories: INTERVIEW_CATEGORY_KEYS.map((k) => ({
      key: k, label: INTERVIEW_CATEGORIES[k].label, count: categoryCounts.get(k) || 0,
    })),
    skills: INTERVIEW_CATEGORY_KEYS.map((cat) => ({
      category: cat,
      categoryLabel: INTERVIEW_CATEGORIES[cat].label,
      items: SKILLS_BY_CATEGORY[cat].map((sk) => ({
        ...sk, count: skillCounts.get(`${cat}:${sk.key}`) || 0,
      })),
    })),
    sessionIds: [...eligible.keys()],
  }
}

/** How a coverage row should read. Never a proficiency claim. */
export function coverageLabel(count, { recorded = true, isFocus = false } = {}) {
  if (!recorded) return NOT_RECORDED
  if (isFocus && count === 0) return 'Current focus'
  if (count === 0) return 'Not practised yet'
  return `Practised ${count} time${count === 1 ? '' : 's'}`
}

/** Milestones earned, from verified behaviour only. Private. */
export function evaluateMilestones(passport) {
  return MILESTONES.map((m) => {
    const need = MILESTONE_THRESHOLDS[m.id] || {}
    const earned = Object.entries(need).every(([k, v]) => (passport[k] || 0) >= v)
    const remaining = Object.entries(need)
      .map(([k, v]) => ({ key: k, missing: Math.max(0, v - (passport[k] || 0)) }))
      .filter((x) => x.missing > 0)
    return { ...m, earned, need, remaining }
  })
}

/**
 * One recommendation, chosen by the spec's priority order and only
 * from real Passport gaps. The CTA routes into an existing flow; it
 * never starts a parallel matching system.
 */
export function recommendNext(passport) {
  const p = passport || {}
  const modeCount = (k) => (p.modes || []).find((m) => m.key === k)?.count || 0
  const fullMock = modeCount('full_mock_swap')
  const drills = modeCount('quick_skill_drill')

  if ((p.verified || 0) === 0) {
    return { id: 'first', text: 'Complete your first live mock interview.', cta: { label: 'Find a mock interview partner', action: 'find_partner' } }
  }
  // verified practice exists, but none of it recorded a mode
  if ((p.structuredSessions || 0) === 0) {
    return { id: 'choose_mode', text: 'Choose a mock interview mode for your next session.', cta: { label: 'Schedule next mock interview', action: 'schedule' } }
  }
  if (fullMock > 0 && drills === 0) {
    return { id: 'try_drill', text: 'Try a Quick Skill Drill to focus on one improvement area.', cta: { label: 'Schedule next mock interview', action: 'schedule' } }
  }
  if (drills > 0 && fullMock === 0) {
    return { id: 'try_full_mock', text: 'Complete a Full Mock Swap to practise the complete interview flow.', cta: { label: 'Schedule next mock interview', action: 'schedule' } }
  }
  if ((p.partners || 0) <= 1) {
    return { id: 'new_partner', text: 'Try your next mock interview with someone new.', cta: { label: 'Find a mock interview partner', action: 'find_partner' } }
  }
  // a skill the user marked as their current focus and never practised
  const gap = (p.skills || []).flatMap((g) => g.items)
    .find((sk) => sk.selected && (sk.count || 0) === 0)
  if (gap) {
    return { id: 'skill_gap', text: `Practise ${gap.label} in your next session.`, cta: { label: 'Practise this skill', action: 'schedule' } }
  }
  return { id: 'vary', text: 'Continue with a different partner or skill.', cta: { label: 'Find a mock interview partner', action: 'find_partner' } }
}
