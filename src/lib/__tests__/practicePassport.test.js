import { describe, it, expect } from 'vitest'
import {
  computePassport, evaluateMilestones, recommendNext, coverageLabel,
  MILESTONE_THRESHOLDS,
} from '../practicePassport'
import {
  validateSessionSetup, describeSession, confirmationCopy, skillsFor, skillLabel,
  SESSION_MODES, INTERVIEW_CATEGORIES, SKILLS_BY_CATEGORY, isStructured,
} from '../../data/practiceModes'

const ME = 'user-me'
const COMM = 'comm-rotman'

const session = (id, partner, over = {}) => ({
  id, community_id: COMM, status: 'verified',
  participant_a_user_id: ME, participant_b_user_id: partner,
  verified_at: '2026-08-20T12:00:00Z', ...over,
})
// a session carrying the Step 2 structured agreement
const structured = (id, partner, mode, category, skill = null, over = {}) =>
  session(id, partner, { session_mode: mode, interview_category: category, skill_focus: skill, ...over })
// the reciprocal shape the DB enforces today: a 'completed' outcome
// requires BOTH round attestations
const conf = (sessionId, userId, over = {}) => ({
  session_id: sessionId, user_id: userId, outcome: 'completed',
  completed_own_round: true, completed_partner_round: true, ...over,
})

describe('counting rules (tests 1, 2, 3)', () => {
  it('counts only mutually verified sessions', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1'), session('s2', 'p2')],
      confirmations: [conf('s1', ME), conf('s1', 'p1'), conf('s2', ME), conf('s2', 'p2')],
    })
    expect(p.verified).toBe(2)
    expect(p.partners).toBe(2)
  })

  it('a one-sided confirmation never counts', () => {
    // the partner never confirmed, so the session is still pending
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1', { status: 'completed_pending_confirmation', verified_at: null })],
      confirmations: [conf('s1', ME)],
    })
    expect(p.verified).toBe(0)
    expect(p.candidateRounds).toBe(0)
    expect(p.interviewerRounds).toBe(0)
  })

  it('cancelled, no-show, disputed, scheduled and expired sessions never count', () => {
    const states = ['cancelled', 'no_show', 'disputed', 'scheduled', 'proposed', 'expired', 'withdrawn', 'declined']
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: states.map((st, i) => session(`s${i}`, `p${i}`, { status: st })),
      confirmations: states.map((_, i) => conf(`s${i}`, ME, { outcome: 'no_show' })),
    })
    expect(p.verified).toBe(0)
    expect(p.partners).toBe(0)
  })
})

describe('deduplication (tests 4, 5, 7)', () => {
  it('deduplicates unique partners across repeat practice', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1'), session('s2', 'p1'), session('s3', 'p2')],
      confirmations: [conf('s1', ME), conf('s2', ME), conf('s3', ME)],
    })
    expect(p.verified).toBe(3)
    expect(p.partners).toBe(2)                       // p1 practised twice
  })

  it('a session with two role rounds is one verified practice, not two', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1')],
      // both participants confirmed, and each confirmed both rounds
      confirmations: [conf('s1', ME), conf('s1', 'p1')],
    })
    expect(p.verified).toBe(1)                       // not 2, not 4
    expect(p.candidateRounds).toBe(1)
    expect(p.interviewerRounds).toBe(1)
    expect(p.reciprocalSessions).toBe(1)
  })

  it('a duplicated join row cannot inflate any count', () => {
    const s = session('s1', 'p1')
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [s, { ...s }, s],
      confirmations: [conf('s1', ME), conf('s1', ME)],
      tokens: [{ session_id: 's1' }, { session_id: 's1' }],
    })
    expect(p.verified).toBe(1)
    expect(p.candidateRounds).toBe(1)
    expect(p.tokenCount).toBe(1)                     // at most one shared Token
  })

  it('one completed session yields at most one shared Token', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1'), session('s2', 'p1')],
      confirmations: [conf('s1', ME), conf('s2', ME)],
      tokens: [{ session_id: 's1' }, { session_id: 's2' }],
    })
    expect(p.tokenCount).toBe(2)
    expect(p.tokenCount).toBeLessThanOrEqual(p.verified)
  })
})

describe('roles (test 6)', () => {
  it('reads each role from the real confirmation flags', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1'), session('s2', 'p2'), session('s3', 'p3')],
      confirmations: [
        conf('s1', ME),
        // a one-directional round, should the schema ever allow it:
        conf('s2', ME, { completed_partner_round: false }),
        conf('s3', ME, { completed_own_round: false }),
      ],
    })
    expect(p.candidateRounds).toBe(2)                // s1 + s2
    expect(p.interviewerRounds).toBe(2)              // s1 + s3
    expect(p.reciprocalSessions).toBe(1)             // only s1
    expect(p.verified).toBe(3)                       // sessions, not rounds
  })

  it('never credits a role from another member\'s confirmation', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1')],
      confirmations: [conf('s1', 'p1')],             // only the partner confirmed rows present
    })
    expect(p.candidateRounds).toBe(0)
    expect(p.interviewerRounds).toBe(0)
  })
})

describe('scoping and privacy (tests 10, 11)', () => {
  it('excludes blocked partners', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1'), session('s2', 'blocked-user')],
      confirmations: [conf('s1', ME), conf('s2', ME)],
      blockedUserIds: new Set(['blocked-user']),
    })
    expect(p.verified).toBe(1)
    expect(p.partnerIds).toEqual(['p1'])
  })

  it('excludes sessions from another community', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1'), session('s2', 'p2', { community_id: 'other-community' })],
      confirmations: [conf('s1', ME), conf('s2', ME)],
    })
    expect(p.verified).toBe(1)
  })

  it('ignores sessions the user did not take part in', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [{ ...session('s1', 'p1'), participant_a_user_id: 'x1', participant_b_user_id: 'x2' }],
      confirmations: [conf('s1', 'x1'), conf('s1', 'x2')],
    })
    expect(p.verified).toBe(0)
    expect(p.partners).toBe(0)
  })

  it('shows a partner name only when one was supplied as unlocked', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1'), session('s2', 'p2')],
      confirmations: [conf('s1', ME), conf('s2', ME)],
      namesById: { p1: { name: 'Sara Kim' } },       // p2 not unlocked
    })
    expect(p.partnerNames).toEqual(['Sara Kim'])
  })
})

describe('structured session fields (tests 9, 15)', () => {
  it('leaves historical sessions Not recorded rather than guessing', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [session('s1', 'p1'), session('s2', 'p2')],   // no mode/category
      confirmations: [conf('s1', ME), conf('s2', ME)],
    })
    expect(p.verified).toBe(2)
    expect(p.structuredRecorded).toBe(false)
    expect(p.unrecordedSessions).toBe(2)
    expect(p.modes.every((m) => m.count === 0)).toBe(true)
    expect(p.categories.every((c) => c.count === 0)).toBe(true)
    expect(p.skills.flatMap((g) => g.items).every((sk) => sk.count === 0)).toBe(true)
    expect(coverageLabel(0, { recorded: false })).toBe('Not recorded')
  })

  it('counts mode, category and skill from verified structured sessions only', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [
        structured('s1', 'p1', 'full_mock_swap', 'case'),
        structured('s2', 'p2', 'quick_skill_drill', 'case', 'final_recommendation'),
        structured('s3', 'p1', 'quick_skill_drill', 'behavioural', 'concision'),
        // scheduled, so it never counts even though it is fully structured
        structured('s4', 'p3', 'full_mock_swap', 'case', null, { status: 'scheduled', verified_at: null }),
      ],
      confirmations: [conf('s1', ME), conf('s2', ME), conf('s3', ME), conf('s4', ME)],
    })
    expect(p.verified).toBe(3)
    expect(p.modes.find((m) => m.key === 'full_mock_swap').count).toBe(1)
    expect(p.modes.find((m) => m.key === 'quick_skill_drill').count).toBe(2)
    expect(p.categories.find((c) => c.key === 'case').count).toBe(2)
    expect(p.categories.find((c) => c.key === 'behavioural').count).toBe(1)
    const caseSkills = p.skills.find((g) => g.category === 'case').items
    expect(caseSkills.find((sk) => sk.key === 'final_recommendation').count).toBe(1)
    const behSkills = p.skills.find((g) => g.category === 'behavioural').items
    expect(behSkills.find((sk) => sk.key === 'concision').count).toBe(1)
  })

  it('a reciprocal structured session counts once, in one mode, with one Token', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [structured('s1', 'p1', 'quick_skill_drill', 'case', 'structuring')],
      confirmations: [conf('s1', ME), conf('s1', 'p1')],     // both confirmed both rounds
      tokens: [{ session_id: 's1' }],
    })
    expect(p.verified).toBe(1)
    expect(p.candidateRounds).toBe(1)
    expect(p.interviewerRounds).toBe(1)
    expect(p.tokenCount).toBe(1)
    expect(p.modes.find((m) => m.key === 'quick_skill_drill').count).toBe(1)
    expect(p.skills.find((g) => g.category === 'case').items
      .find((sk) => sk.key === 'structuring').count).toBe(1)
  })

  it('ignores a session whose structured agreement is incomplete or mismatched', () => {
    const p = computePassport({
      userId: ME, communityId: COMM,
      sessions: [
        // drill with no skill: not a valid agreement
        structured('s1', 'p1', 'quick_skill_drill', 'case', null),
        // behavioural skill on a case session: rejected
        structured('s2', 'p2', 'quick_skill_drill', 'case', 'concision'),
      ],
      confirmations: [conf('s1', ME), conf('s2', ME)],
    })
    expect(p.verified).toBe(2)                 // they are still verified practices
    expect(p.structuredSessions).toBe(0)       // but contribute no coverage
    expect(p.modes.every((m) => m.count === 0)).toBe(true)
  })
})

describe('coverage language never claims proficiency', () => {
  it('uses practice counts, not mastery words', () => {
    expect(coverageLabel(0)).toBe('Not practised yet')
    expect(coverageLabel(1)).toBe('Practised 1 time')
    expect(coverageLabel(3)).toBe('Practised 3 times')
    expect(coverageLabel(0, { isFocus: true })).toBe('Current focus')
    for (const n of [0, 1, 5, 40]) {
      expect(coverageLabel(n)).not.toMatch(/master|expert|ready|score|rank/i)
    }
  })
})

describe('milestones use verified behaviour only (test 9)', () => {
  const build = (n, partners) => {
    const sessions = []
    const confirmations = []
    for (let i = 0; i < n; i++) {
      const partner = `p${i % partners}`
      sessions.push(session(`s${i}`, partner))
      confirmations.push(conf(`s${i}`, ME))
    }
    return computePassport({ userId: ME, communityId: COMM, sessions, confirmations })
  }
  const earned = (p) => evaluateMilestones(p).filter((m) => m.earned).map((m) => m.id)

  it('earns nothing without a verified practice', () => {
    expect(earned(computePassport({ userId: ME }))).toEqual([])
  })

  it('follows the centralised thresholds exactly', () => {
    expect(earned(build(1, 1))).toEqual(['first_live_practice'])
    expect(earned(build(3, 2))).toEqual(
      expect.arrayContaining(['first_live_practice', 'practice_explorer', 'role_balanced', 'helpful_interviewer']))
    expect(earned(build(3, 1))).not.toContain('practice_explorer')      // needs 2 partners
    expect(earned(build(5, 3))).toContain('variety_builder')
    expect(earned(build(5, 2))).not.toContain('variety_builder')        // needs 3 partners
  })

  it('keeps every threshold in one config object', () => {
    expect(MILESTONE_THRESHOLDS.variety_builder).toEqual({ verified: 5, partners: 3 })
    expect(MILESTONE_THRESHOLDS.role_balanced).toEqual({ candidateRounds: 2, interviewerRounds: 2 })
    expect(Object.keys(MILESTONE_THRESHOLDS)).toHaveLength(5)
  })

  it('reports what is still missing without inventing progress', () => {
    const m = evaluateMilestones(build(1, 1)).find((x) => x.id === 'variety_builder')
    expect(m.earned).toBe(false)
    expect(m.remaining).toEqual([{ key: 'verified', missing: 4 }, { key: 'partners', missing: 2 }])
  })
})

describe('recommendations follow real mode and skill gaps (test 16)', () => {
  const rec = (p) => recommendNext(p).text
  const modes = (full, drill) => [
    { key: 'full_mock_swap', label: 'Full Mock Swap', count: full },
    { key: 'quick_skill_drill', label: 'Quick Skill Drill', count: drill },
  ]

  it('walks the Step 2 priority order', () => {
    expect(rec({ verified: 0 })).toBe('Complete your first live mock interview.')
    // verified practice, but nothing recorded a mode
    expect(rec({ verified: 3, structuredSessions: 0, partners: 2, modes: modes(0, 0) }))
      .toBe('Choose a mock interview mode for your next session.')
    expect(rec({ verified: 2, structuredSessions: 2, partners: 2, modes: modes(2, 0) }))
      .toBe('Try a Quick Skill Drill to focus on one improvement area.')
    expect(rec({ verified: 2, structuredSessions: 2, partners: 2, modes: modes(0, 2) }))
      .toBe('Complete a Full Mock Swap to practise the complete interview flow.')
    expect(rec({ verified: 3, structuredSessions: 3, partners: 1, modes: modes(2, 1) }))
      .toBe('Try your next mock interview with someone new.')
    expect(rec({
      verified: 5, structuredSessions: 5, partners: 3, modes: modes(3, 2),
      skills: [{ category: 'case', items: [{ key: 'synthesis', label: 'Synthesis', count: 0, selected: true }] }],
    })).toBe('Practise Synthesis in your next session.')
    expect(rec({ verified: 6, structuredSessions: 6, partners: 4, modes: modes(3, 3) }))
      .toBe('Continue with a different partner or skill.')
  })

  it('never recommends a skill the user did not select as their focus', () => {
    expect(rec({
      verified: 5, structuredSessions: 5, partners: 3, modes: modes(3, 2),
      skills: [{ category: 'case', items: [{ key: 'synthesis', label: 'Synthesis', count: 0 }] }],
    })).toBe('Continue with a different partner or skill.')
  })

  it('routes every recommendation into an existing flow, with no urgency', () => {
    const cases = [
      { verified: 0 },
      { verified: 3, structuredSessions: 0, modes: modes(0, 0) },
      { verified: 2, structuredSessions: 2, partners: 2, modes: modes(2, 0) },
      { verified: 2, structuredSessions: 2, partners: 2, modes: modes(0, 2) },
      { verified: 9, structuredSessions: 9, partners: 5, modes: modes(5, 4) },
    ]
    for (const p of cases) {
      const { cta, text } = recommendNext(p)
      expect(['find_partner', 'schedule']).toContain(cta.action)
      expect(text).not.toMatch(/now|today|hurry|streak|rank|than others|ready|mastered|expert/i)
    }
  })
})

describe('session mode configuration and validation (tests 1-6)', () => {
  it('requires a mode', () => {
    expect(validateSessionSetup({}).error).toBe('mode_required')
    expect(validateSessionSetup({ mode: 'guided_mode', category: 'case' }).error).toBe('mode_invalid')
  })

  it('requires an interview category', () => {
    expect(validateSessionSetup({ mode: 'full_mock_swap' }).error).toBe('category_required')
    expect(validateSessionSetup({ mode: 'full_mock_swap', category: 'technical' }).error).toBe('category_invalid')
  })

  it('requires exactly one valid skill for a Quick Skill Drill', () => {
    expect(validateSessionSetup({ mode: 'quick_skill_drill', category: 'case' }).error).toBe('skill_required')
    expect(validateSessionSetup({ mode: 'quick_skill_drill', category: 'case', skillFocus: 'structuring' }).ok).toBe(true)
  })

  it('rejects a Case skill on a Behavioural session and the reverse', () => {
    expect(validateSessionSetup({ mode: 'quick_skill_drill', category: 'behavioural', skillFocus: 'structuring' }).error)
      .toBe('skill_category_mismatch')
    expect(validateSessionSetup({ mode: 'quick_skill_drill', category: 'case', skillFocus: 'executive_presence' }).error)
      .toBe('skill_category_mismatch')
    // and the two rubrics never share a key
    const caseKeys = SKILLS_BY_CATEGORY.case.map((s) => s.key)
    const behKeys = SKILLS_BY_CATEGORY.behavioural.map((s) => s.key)
    expect(caseKeys.filter((k) => behKeys.includes(k))).toEqual([])
    expect(skillLabel('behavioural', 'structuring')).toBeNull()
  })

  it('lets a Full Mock Swap have no focus, and an optional valid one', () => {
    expect(validateSessionSetup({ mode: 'full_mock_swap', category: 'case' }).ok).toBe(true)
    expect(validateSessionSetup({ mode: 'full_mock_swap', category: 'case', skillFocus: 'synthesis' }).ok).toBe(true)
    expect(validateSessionSetup({ mode: 'full_mock_swap', category: 'case', skillFocus: 'concision' }).error)
      .toBe('skill_category_mismatch')
  })

  it('offers only the skills of the chosen category', () => {
    expect(skillsFor('case')).toHaveLength(8)
    expect(skillsFor('behavioural')).toHaveLength(8)
    expect(skillsFor('case').map((s) => s.label)).toContain('Exhibit interpretation')
    expect(skillsFor('behavioural').map((s) => s.label)).toContain('Executive presence')
    expect(skillsFor(undefined)).toEqual([])
  })

  it('describes a session identically for both participants (test 7)', () => {
    const s = { session_mode: 'quick_skill_drill', interview_category: 'case', skill_focus: 'final_recommendation' }
    const asProposer = describeSession(s)
    const asReceiver = describeSession({ ...s })
    expect(asProposer).toEqual(asReceiver)
    expect(asProposer.title).toBe('Quick Skill Drill')
    expect(asProposer.detail).toBe('Case interview · Final recommendation · About 30 min')
    expect(asProposer.agreement).toBe('You will each practise the selected skill and exchange feedback.')
    expect(describeSession({ session_mode: 'full_mock_swap', interview_category: 'case' }).detail)
      .toBe('Case interview · About 75 min')
  })

  it('marks an incomplete agreement as unacceptable (test 8)', () => {
    expect(isStructured({ session_mode: 'quick_skill_drill', interview_category: 'case' })).toBe(false)
    expect(isStructured({ session_mode: 'full_mock_swap', interview_category: 'case' })).toBe(true)
    expect(isStructured({})).toBe(false)
    expect(describeSession({}).structured).toBe(false)
    expect(describeSession({}).title).toBe('Not recorded')
  })

  it('uses duration language that promises nothing exact', () => {
    expect(SESSION_MODES.full_mock_swap.durationLabel).toBe('About 75 min')
    expect(SESSION_MODES.quick_skill_drill.durationLabel).toBe('About 30 min')
    for (const m of Object.values(SESSION_MODES)) {
      expect(m.description).not.toMatch(/ready|mastered|expert|guarantee/i)
    }
    expect(Object.values(INTERVIEW_CATEGORIES).map((c) => c.label))
      .toEqual(['Case interview', 'Behavioural interview'])
  })

  it('names the completion steps for the mode that was practised', () => {
    expect(confirmationCopy('quick_skill_drill').ownRound).toBe('I completed my skill exercise')
    expect(confirmationCopy('full_mock_swap').ownRound).toBe('I completed my mock interview round')
    // an unrecorded historical session still gets sane wording
    expect(confirmationCopy(null).ownRound).toBe('I completed my mock interview round')
  })
})
