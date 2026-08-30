import { describe, it, expect, beforeEach } from 'vitest'
import {
  guideAvailability, resolveGuide, guideStages, rolesForRound,
  stageInstructions, stageObservations, suggestedSeconds, nextPosition,
  guideStateKey, loadGuideState, saveGuideState, clearGuideState,
  shouldClearGuideState, lobbySummary, GUIDE_VERSION, GUIDE_UNAVAILABLE,
} from '../guidedPractice'
import { SKILLS_BY_CATEGORY } from '../../data/practiceModes'
import { CASE_DRILLS, BEHAVIOURAL_DRILLS, FULL_MOCK_GUIDES } from '../../data/practiceGuides'

const ME = 'user-me'
const PARTNER = 'user-partner'
const OUTSIDER = 'user-outsider'

const session = (over = {}) => ({
  id: 's1', community_id: 'c1', status: 'scheduled',
  participant_a_user_id: ME, participant_b_user_id: PARTNER,
  session_mode: 'full_mock_swap', interview_category: 'case', skill_focus: null,
  round1_interviewee_user_id: null,
  ...over,
})
const pairing = { status: 'accepted' }

describe('entry conditions (tests 1, 2, 3, 15)', () => {
  it('opens for a participant on a scheduled, fully specified session', () => {
    expect(guideAvailability({ session: session(), pairing, userId: ME }).ok).toBe(true)
    expect(guideAvailability({ session: session(), pairing, userId: PARTNER }).ok).toBe(true)
  })

  it('never opens for a non-participant', () => {
    const a = guideAvailability({ session: session(), pairing, userId: OUTSIDER })
    expect(a.ok).toBe(false)
    expect(a.reason).toBe('not_participant')
  })

  it('only a scheduled session with an active pairing qualifies', () => {
    for (const st of ['proposed', 'completed_pending_confirmation', 'verified', 'cancelled', 'no_show']) {
      expect(guideAvailability({ session: session({ status: st }), pairing, userId: ME }).ok).toBe(false)
    }
    expect(guideAvailability({ session: session(), pairing: { status: 'ended' }, userId: ME }).ok).toBe(false)
  })

  it('explains rather than guessing when the format was never recorded', () => {
    const historical = session({ session_mode: null, interview_category: null })
    const a = guideAvailability({ session: historical, pairing, userId: ME })
    expect(a.ok).toBe(false)
    expect(a.reason).toBe('format_not_recorded')
    expect(a.message).toBe(GUIDE_UNAVAILABLE)
    expect(resolveGuide(historical)).toBeNull()
  })

  it('refuses a drill with no skill, and a skill from the other rubric', () => {
    expect(resolveGuide(session({ session_mode: 'quick_skill_drill', skill_focus: null }))).toBeNull()
    expect(resolveGuide(session({
      session_mode: 'quick_skill_drill', interview_category: 'case', skill_focus: 'concision',
    }))).toBeNull()
  })
})

describe('guide resolution (tests 4, 5, 6)', () => {
  it('Case and Behavioural full mocks are different guides', () => {
    const c = resolveGuide(session({ interview_category: 'case' }))
    const b = resolveGuide(session({ interview_category: 'behavioural' }))
    expect(c.key).toBe('full_mock_swap:case')
    expect(b.key).toBe('full_mock_swap:behavioural')
    expect(guideStages(c)).toHaveLength(7)
    expect(guideStages(b)).toHaveLength(5)
    expect(guideStages(c).map((s) => s.key)).not.toEqual(guideStages(b).map((s) => s.key))
  })

  it('a drill loads its own structured skill guide', () => {
    const g = resolveGuide(session({
      session_mode: 'quick_skill_drill', interview_category: 'case', skill_focus: 'final_recommendation',
    }))
    expect(g.title).toBe('Final recommendation')
    expect(g.steps.some((s) => /two minute recommendation/i.test(s))).toBe(true)
    expect(guideStages(g)).toHaveLength(3)          // never the full mock
    expect(guideStages(g)).not.toEqual(guideStages(FULL_MOCK_GUIDES.case))
  })

  it('every structured skill has a drill, in its own category only', () => {
    for (const s of SKILLS_BY_CATEGORY.case) {
      expect(CASE_DRILLS[s.key], `case drill missing: ${s.key}`).toBeTruthy()
      expect(BEHAVIOURAL_DRILLS[s.key]).toBeUndefined()
    }
    for (const s of SKILLS_BY_CATEGORY.behavioural) {
      expect(BEHAVIOURAL_DRILLS[s.key], `behavioural drill missing: ${s.key}`).toBeTruthy()
      expect(CASE_DRILLS[s.key]).toBeUndefined()
    }
  })

  it('every drill carries the fields the guide needs', () => {
    for (const [key, d] of Object.entries({ ...CASE_DRILLS, ...BEHAVIOURAL_DRILLS })) {
      expect(d.title, key).toBeTruthy()
      expect(d.objective, key).toBeTruthy()
      expect(Array.isArray(d.setup), key).toBe(true)
      expect(d.steps.length, key).toBeGreaterThan(2)
      expect(d.observe.length, key).toBeGreaterThan(0)
      expect(d.time, key).toBeTruthy()
      expect(d.reps, key).toBeGreaterThanOrEqual(1)
      expect(d.completion, key).toBeTruthy()
    }
  })
})

describe('roles (tests 7, 8)', () => {
  it('derives round 1 from the stored first interviewee', () => {
    const s = session({ round1_interviewee_user_id: PARTNER })
    expect(rolesForRound({ session: s, userId: ME, round: 1 }))
      .toMatchObject({ role: 'interviewer', resolved: true, fromSession: true })
    expect(rolesForRound({ session: s, userId: PARTNER, round: 1 }).role).toBe('candidate')
  })

  it('reverses the roles in round 2', () => {
    const s = session({ round1_interviewee_user_id: PARTNER })
    expect(rolesForRound({ session: s, userId: ME, round: 2 }).role).toBe('candidate')
    expect(rolesForRound({ session: s, userId: PARTNER, round: 2 }).role).toBe('interviewer')
  })

  it('asks the participants to choose when the session stored nobody', () => {
    const s = session()                              // round1_interviewee is null today
    const unresolved = rolesForRound({ session: s, userId: ME, round: 1 })
    expect(unresolved.resolved).toBe(false)
    expect(unresolved.needsChoice).toBe(true)
    // a local choice resolves it WITHOUT writing anything to the session
    const local = rolesForRound({ session: s, userId: ME, round: 1, localFirst: ME })
    expect(local).toMatchObject({ role: 'candidate', resolved: true, fromSession: false })
    expect(s.round1_interviewee_user_id).toBeNull()
  })

  it('ignores a stored value that is not a participant', () => {
    const s = session({ round1_interviewee_user_id: OUTSIDER })
    expect(rolesForRound({ session: s, userId: ME, round: 1 }).needsChoice).toBe(true)
  })
})

describe('stage content is per role', () => {
  const guide = FULL_MOCK_GUIDES.case
  const understand = guideStages(guide)[1]

  it('each participant reads their own instructions', () => {
    expect(stageInstructions(understand, 'candidate')[0]).toMatch(/Restate the objective/)
    expect(stageInstructions(understand, 'interviewer')[0]).toMatch(/Present the case prompt/)
  })

  it('what to observe belongs to the interviewer', () => {
    const structure = guideStages(guide)[3]
    expect(stageObservations(structure, 'interviewer').length).toBeGreaterThan(0)
    expect(stageObservations(structure, 'candidate')).toEqual([])
  })

  it('suggested time is a suggestion, taken from the upper bound', () => {
    expect(suggestedSeconds({ time: '3-5 min' })).toBe(300)
    expect(suggestedSeconds({ time: '2 min' })).toBe(120)
    expect(suggestedSeconds({ time: null })).toBeNull()
  })

  it('offers a way past a stage that will not fit every case', () => {
    const hypothesis = guideStages(guide)[2]
    expect(hypothesis.skip).toBe('Continue without hypothesis')
  })

  it('never presents one framework as the correct answer', () => {
    const all = JSON.stringify(guide)
    expect(all).not.toMatch(/correct answer|right framework|interview ready|mastered|score/i)
    expect(guideStages(guide)[3].note).toMatch(/no single correct framework/i)
  })
})

describe('progression (tests 9, 10, 11, 12)', () => {
  const guide = FULL_MOCK_GUIDES.case

  it('advances one stage at a time and switches roles between rounds', () => {
    expect(nextPosition({ guide, round: 1, stageIndex: 0 }))
      .toEqual({ round: 1, stageIndex: 1, done: false, switching: false })
    expect(nextPosition({ guide, round: 1, stageIndex: 6 }))
      .toEqual({ round: 2, stageIndex: 0, done: false, switching: true })
    expect(nextPosition({ guide, round: 2, stageIndex: 6 }))
      .toMatchObject({ done: true })
  })

  it('finishing the guide produces no verification, Token or Passport change', () => {
    const end = nextPosition({ guide, round: 2, stageIndex: 6 })
    expect(end.done).toBe(true)
    // the guide's own vocabulary contains no completion authority
    expect(Object.keys(end)).toEqual(['round', 'stageIndex', 'done', 'switching'])
    const asText = JSON.stringify({ guide, end })
    expect(asText).not.toMatch(/token|verified|mint/i)
  })

  it('a timer is only a suggestion, and expiry decides nothing', () => {
    const stage = guideStages(guide)[4]
    const seconds = suggestedSeconds(stage)
    expect(seconds).toBe(1200)
    // reaching zero changes no position and no status
    expect(nextPosition({ guide, round: 1, stageIndex: 4 }).stageIndex).toBe(5)
    expect(shouldClearGuideState({ status: 'scheduled' })).toBe(false)
  })
})

describe('local progress is local (tests 13, 14)', () => {
  const store = () => {
    const map = new Map()
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
      _map: map,
    }
  }
  let storage
  beforeEach(() => { storage = store() })

  it('is keyed by user, session and guide version', () => {
    expect(guideStateKey({ userId: ME, sessionId: 's1' }))
      .toBe(`mutu_guide:${GUIDE_VERSION}:${ME}:s1`)
    saveGuideState({ userId: ME, sessionId: 's1', state: { round: 2, stageIndex: 3 }, storage })
    // another user, and another session, see nothing
    expect(loadGuideState({ userId: PARTNER, sessionId: 's1', storage })).toBeNull()
    expect(loadGuideState({ userId: ME, sessionId: 's2', storage })).toBeNull()
    expect(loadGuideState({ userId: ME, sessionId: 's1', storage })).toMatchObject({ round: 2, stageIndex: 3 })
  })

  it('ignores state written by a different guide version', () => {
    storage.setItem(guideStateKey({ userId: ME, sessionId: 's1' }),
      JSON.stringify({ round: 2, stageIndex: 5, version: 'g0' }))
    expect(loadGuideState({ userId: ME, sessionId: 's1', storage })).toBeNull()
  })

  it('is cleared once the session is settled', () => {
    for (const st of ['verified', 'cancelled', 'declined', 'withdrawn', 'expired', 'no_show', 'disputed']) {
      expect(shouldClearGuideState({ status: st })).toBe(true)
    }
    saveGuideState({ userId: ME, sessionId: 's1', state: { round: 1, stageIndex: 2 }, storage })
    clearGuideState({ userId: ME, sessionId: 's1', storage })
    expect(loadGuideState({ userId: ME, sessionId: 's1', storage })).toBeNull()
  })

  it('survives a storage that refuses to write', () => {
    const broken = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(() => saveGuideState({ userId: ME, sessionId: 's1', state: {}, storage: broken })).not.toThrow()
    expect(loadGuideState({ userId: ME, sessionId: 's1', storage: broken })).toBeNull()
  })
})

describe('lobby summary and safety copy', () => {
  it('describes the agreement the two people made', () => {
    expect(lobbySummary(session())).toEqual({
      title: 'Full Mock Swap',
      detail: 'Case interview · About 75 min',
      agreement: 'You will each complete one candidate round and one interviewer round.',
    })
    expect(lobbySummary(session({
      session_mode: 'quick_skill_drill', skill_focus: 'synthesis',
    })).detail).toBe('Case interview · Synthesis · About 30 min')
  })

  it('supplies no case content and asks for permitted material', () => {
    const everything = JSON.stringify({ CASE_DRILLS, BEHAVIOURAL_DRILLS, FULL_MOCK_GUIDES })
    expect(everything).toMatch(/permitted to (use|share)/)
    for (const banned of ['McKinsey', 'BCG', 'Bain', 'casebook', 'Lindsay']) {
      expect(everything).not.toContain(banned)
    }
  })

  it('keeps executive presence about practised delivery, never the person', () => {
    const d = BEHAVIOURAL_DRILLS.executive_presence
    expect(d.objective).toMatch(/not a fixed trait/i)
    expect(d.note).toMatch(/never comment on personality, accent, cultural style, disability or appearance/i)
    expect(JSON.stringify(d)).not.toMatch(/confidence level|charisma|likeab/i)
  })
})
