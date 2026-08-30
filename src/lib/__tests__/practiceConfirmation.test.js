import { describe, it, expect } from 'vitest'
import {
  ANSWERS, ANSWER_KEYS, DID_NOT_HAPPEN_REASONS,
  roleLabels, buildSubmission, validateFeedback, canConfirm, reviewLines,
} from '../practiceConfirmation'
import {
  SUGGESTIONS, ALL_SUGGESTION_CODES, NOTE_MAX,
  suggestionsFor, suggestionLabel, FEEDBACK_FRAMING,
} from '../../data/practiceFeedback'
import { computePassport, evaluateMilestones } from '../practicePassport'

const ME = 'user-me'
const PARTNER = 'user-partner'
const OUTSIDER = 'user-outsider'
const past = new Date(Date.now() - 3600e3).toISOString()
const future = new Date(Date.now() + 3600e3).toISOString()

const session = (over = {}) => ({
  id: 's1', community_id: 'c1', status: 'scheduled',
  participant_a_user_id: ME, participant_b_user_id: PARTNER,
  scheduled_start: past,
  session_mode: 'full_mock_swap', interview_category: 'case', skill_focus: null,
  ...over,
})

describe('entry conditions (tests 1, 2, 3)', () => {
  it('only a participant may confirm', () => {
    expect(canConfirm({ session: session(), userId: ME }).ok).toBe(true)
    expect(canConfirm({ session: session(), userId: OUTSIDER }))
      .toMatchObject({ ok: false, reason: 'not_participant' })
  })

  it('is unavailable before the scheduled time', () => {
    expect(canConfirm({ session: session({ scheduled_start: future }), userId: ME }))
      .toMatchObject({ ok: false, reason: 'not_started' })
  })

  it('is unavailable once this user already confirmed', () => {
    expect(canConfirm({ session: session(), userId: ME, myConfirmed: true }))
      .toMatchObject({ ok: false, reason: 'already_confirmed' })
  })

  it('is unavailable on a settled session', () => {
    for (const st of ['verified', 'disputed', 'cancelled', 'proposed', 'declined']) {
      expect(canConfirm({ session: session({ status: st }), userId: ME }).ok).toBe(false)
    }
  })

  it('nothing about the guide or the clock produces a confirmation', () => {
    // canConfirm only ever says "you may be asked"; the payload still
    // requires explicit answers
    expect(buildSubmission({})).toBeNull()
    expect(buildSubmission({ answer: 'completed' })).toBeNull()          // no roles ticked
    expect(buildSubmission({ answer: 'completed', ownRound: true })).toBeNull()
    expect(buildSubmission({ answer: 'did_not_happen' })).toBeNull()     // no reason
  })
})

describe('answers map onto existing RPC outcomes only (tests 5, 6, 7)', () => {
  it('"yes" requires both role attestations, exactly as the database does', () => {
    const s = buildSubmission({ answer: 'completed', ownRound: true, partnerRound: true })
    expect(s).toMatchObject({
      outcome: 'completed', completedOwnRound: true, completedPartnerRound: true, noShowOf: null,
    })
  })

  it('"it happened but roles were not completed" uses a valid existing outcome, and cannot verify', () => {
    // KNOWN GAP: the schema has no half-completed outcome
    expect(ANSWERS.partial.outcome).toBe('cancelled')
    const s = buildSubmission({ answer: 'partial' })
    expect(s.outcome).toBe('cancelled')
    expect(s.completedOwnRound).toBe(false)
    expect(s.completedPartnerRound).toBe(false)
    expect(s.suggestionCode).toBeNull()
  })

  it('"it did not happen" carries a private reason and names nobody publicly', () => {
    const absent = buildSubmission({
      answer: 'did_not_happen', reasonCode: 'partner_absent', partnerUserId: PARTNER, myUserId: ME,
    })
    expect(absent).toMatchObject({ outcome: 'no_show', noShowOf: PARTNER })
    const mine = buildSubmission({
      answer: 'did_not_happen', reasonCode: 'i_could_not_attend', partnerUserId: PARTNER, myUserId: ME,
    })
    expect(mine).toMatchObject({ outcome: 'no_show', noShowOf: ME })
    const clash = buildSubmission({
      answer: 'did_not_happen', reasonCode: 'scheduling_conflict', partnerUserId: PARTNER, myUserId: ME,
    })
    expect(clash).toMatchObject({ outcome: 'cancelled', noShowOf: null })
  })

  it('every answer resolves to an outcome the RPC already accepts', () => {
    const valid = ['completed', 'no_show', 'cancelled']
    for (const k of ANSWER_KEYS) expect(valid).toContain(ANSWERS[k].outcome)
    for (const r of DID_NOT_HAPPEN_REASONS) expect(valid).toContain(r.outcome)
  })

  it('no answer preselects itself', () => {
    expect(ANSWER_KEYS).toHaveLength(3)
    expect(ANSWERS.completed.needsRoles).toBe(true)
    expect(ANSWERS.partial.needsRoles).toBe(false)
  })
})

describe('role wording follows the agreed mode', () => {
  it('names a drill a drill, and a mock a mock', () => {
    expect(roleLabels(session()).own).toBe('I completed my mock interview round')
    expect(roleLabels(session({ session_mode: 'quick_skill_drill' })).own)
      .toBe('I completed my skill drill')
    expect(roleLabels(session({ session_mode: 'quick_skill_drill' })).partner)
      .toMatch(/supported my partner’s skill drill and gave feedback/)
  })
})

describe('feedback taxonomy (tests 15, 16, 17)', () => {
  it('accepts only codes from the session\'s own category', () => {
    expect(validateFeedback({ interviewCategory: 'case', suggestionCode: 'tailor_structure' }).ok).toBe(true)
    expect(validateFeedback({ interviewCategory: 'case', suggestionCode: 'clearer_context' }).error)
      .toBe('suggestion_category_mismatch')
    expect(validateFeedback({ interviewCategory: 'case', suggestionCode: 'you_seem_nervous' }).error)
      .toBe('unknown_suggestion')
  })

  it('caps the optional note at 280 characters', () => {
    expect(NOTE_MAX).toBe(280)
    expect(validateFeedback({
      interviewCategory: 'case', suggestionCode: 'tailor_structure', note: 'x'.repeat(280),
    }).ok).toBe(true)
    expect(validateFeedback({
      interviewCategory: 'case', suggestionCode: 'tailor_structure', note: 'x'.repeat(281),
    }).error).toBe('note_too_long')
  })

  it('is entirely optional, and never blocks a confirmation', () => {
    expect(validateFeedback({ interviewCategory: 'case' }).ok).toBe(true)
    const s = buildSubmission({ answer: 'completed', ownRound: true, partnerRound: true })
    expect(s.outcome).toBe('completed')
    expect(s.suggestionCode).toBeNull()
  })

  it('puts the drill\'s own skill first, without hiding the rest', () => {
    const ordered = suggestionsFor({ interviewCategory: 'case', skillFocus: 'final_recommendation' })
    expect(ordered[0].code).toBe('recommendation_more_direct')
    expect(ordered).toHaveLength(SUGGESTIONS.case.length)
    expect(suggestionsFor({ interviewCategory: 'case' })).toEqual(SUGGESTIONS.case)
  })

  it('asks about the next attempt, never about the person', () => {
    expect(FEEDBACK_FRAMING).toBe('Keep it specific, constructive and focused on the next attempt.')
    const everything = JSON.stringify(SUGGESTIONS).toLowerCase()
    for (const banned of ['personality', 'accent', 'appearance', 'culture', 'confident person',
      'rate', 'score', 'ready', 'better than', 'recommend this']) {
      expect(everything).not.toContain(banned)
    }
    expect(ALL_SUGGESTION_CODES).toContain('other')
  })

  it('labels come from the code, inside its own category', () => {
    expect(suggestionLabel('case', 'recommendation_more_direct')).toBe('Make the recommendation more direct')
    expect(suggestionLabel('behavioural', 'recommendation_more_direct')).toBeNull()
  })
})

describe('the immutable review (test 14)', () => {
  it('states exactly what is about to be submitted', () => {
    expect(reviewLines({
      session: session({ session_mode: 'quick_skill_drill', skill_focus: 'final_recommendation' }),
      answer: 'completed', suggestionCode: 'recommendation_more_direct', note: '',
    })).toEqual([
      'The Quick Skill Drill happened',
      'Both agreed roles were completed',
      'Private suggestion: Make the recommendation more direct',
    ])
  })

  it('says plainly when nothing will be verified', () => {
    expect(reviewLines({ session: session(), answer: 'partial' }))
      .toContain('Both roles were not completed, so this will not be verified')
    expect(reviewLines({ session: session(), answer: 'did_not_happen', reasonCode: 'technical_issue' }))
      .toContain('Reason kept private: Technical issue')
  })
})

describe('Passport reacts only to server-verified completion (tests 4, 8, 10, 17)', () => {
  const conf = (sid, uid, over = {}) => ({
    session_id: sid, user_id: uid, outcome: 'completed',
    completed_own_round: true, completed_partner_round: true, ...over,
  })

  it('a pending session adds nothing, however much feedback exists', () => {
    const p = computePassport({
      userId: ME, communityId: 'c1',
      sessions: [session({ status: 'completed_pending_confirmation' })],
      confirmations: [conf('s1', ME)],
      feedback: [{ id: 'f1', session_id: 's1', author_user_id: ME, recipient_user_id: PARTNER, suggestion_code: 'tailor_structure' }],
      feedbackSupported: true,
    })
    expect(p.verified).toBe(0)
    expect(p.tokenCount).toBe(0)
  })

  it('a verified session adds exactly one practice and at most one Token', () => {
    const p = computePassport({
      userId: ME, communityId: 'c1',
      sessions: [session({ status: 'verified' })],
      confirmations: [conf('s1', ME), conf('s1', PARTNER)],
      tokens: [{ session_id: 's1' }],
      feedback: [
        { id: 'f1', session_id: 's1', author_user_id: ME, recipient_user_id: PARTNER, suggestion_code: 'tailor_structure' },
        { id: 'f2', session_id: 's1', author_user_id: PARTNER, recipient_user_id: ME, suggestion_code: 'communicate_concisely', created_at: '2026-08-28T12:00:00Z' },
      ],
      feedbackSupported: true,
    })
    expect(p.verified).toBe(1)
    expect(p.tokenCount).toBe(1)
    expect(p.candidateRounds).toBe(1)
    expect(p.interviewerRounds).toBe(1)
  })

  it('shows me only the feedback written for me', () => {
    const p = computePassport({
      userId: ME, communityId: 'c1',
      sessions: [session({ status: 'verified' })],
      confirmations: [conf('s1', ME)],
      feedback: [
        { id: 'mine', session_id: 's1', author_user_id: ME, recipient_user_id: PARTNER, suggestion_code: 'tailor_structure' },
        { id: 'for-me', session_id: 's1', author_user_id: PARTNER, recipient_user_id: ME, suggestion_code: 'communicate_concisely' },
        { id: 'other-pair', session_id: 's9', author_user_id: 'x1', recipient_user_id: 'x2', suggestion_code: 'other' },
      ],
      feedbackSupported: true,
    })
    expect(p.feedbackReceived.map((f) => f.id)).toEqual(['for-me'])
  })

  it('Helpful Interviewer needs a suggestion once feedback can be stored', () => {
    const sessions = ['a', 'b', 'c'].map((k) => session({ id: k, status: 'verified' }))
    const confirmations = ['a', 'b', 'c'].map((k) => conf(k, ME))
    const earned = (p) => evaluateMilestones(p).find((m) => m.id === 'helpful_interviewer').earned

    // before the migration: interviewer rounds alone still count
    expect(earned(computePassport({ userId: ME, communityId: 'c1', sessions, confirmations }))).toBe(true)

    // after it: three rounds with only one suggestion is not enough
    expect(earned(computePassport({
      userId: ME, communityId: 'c1', sessions, confirmations, feedbackSupported: true,
      feedback: [{ id: 'f1', session_id: 'a', author_user_id: ME, recipient_user_id: PARTNER, suggestion_code: 'other' }],
    }))).toBe(false)

    expect(earned(computePassport({
      userId: ME, communityId: 'c1', sessions, confirmations, feedbackSupported: true,
      feedback: ['a', 'b', 'c'].map((k) => ({
        id: `f-${k}`, session_id: k, author_user_id: ME, recipient_user_id: PARTNER, suggestion_code: 'other',
      })),
    }))).toBe(true)
  })

  it('never treats note length or wording as quality', () => {
    const short = computePassport({
      userId: ME, communityId: 'c1', sessions: [session({ status: 'verified' })],
      confirmations: [conf('s1', ME)], feedbackSupported: true,
      feedback: [{ id: 'f1', session_id: 's1', author_user_id: ME, recipient_user_id: PARTNER, suggestion_code: 'other', note: 'ok' }],
    })
    const long = computePassport({
      userId: ME, communityId: 'c1', sessions: [session({ status: 'verified' })],
      confirmations: [conf('s1', ME)], feedbackSupported: true,
      feedback: [{ id: 'f1', session_id: 's1', author_user_id: ME, recipient_user_id: PARTNER, suggestion_code: 'other', note: 'x'.repeat(280) }],
    })
    expect(short.helpfulInterviewerRounds).toBe(long.helpfulInterviewerRounds)
    expect(short.verified).toBe(long.verified)
  })
})
