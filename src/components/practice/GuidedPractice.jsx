import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  guideAvailability, resolveGuide, guideStages, rolesForRound, ROLE_LABEL,
  stageInstructions, stageObservations, suggestedSeconds, nextPosition,
  loadGuideState, saveGuideState, clearGuideState, shouldClearGuideState,
  lobbySummary, GUIDE_UNAVAILABLE,
} from '../../lib/guidedPractice'
import { MATERIAL_NOTE } from '../../data/practiceGuides'
import MeetingDetails from './MeetingDetails'
import { formatSessionTime } from '../../lib/practiceMatching'
import { matchaCta } from '../../lib/matchaCta'
import { track } from '../../lib/analytics'

// ── Guided Practice ─────────────────────────────────────────────────
// Facilitates a scheduled session: who starts, what happens now,
// roughly how long, when to switch, when to finish.
//
// It decides NOTHING. The stage you are on and the timer live on this
// device only; the session, its confirmations, its verified status and
// its one shared Token stay exactly where they were. Finishing the
// guide routes to the existing confirmation flow and never submits it.
//
// There is no synchronisation contract, so the guide never suggests
// the partner's screen moves with yours.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
  matcha: '#6E7F4A', matchaSoft: '#EDF0E4',
}
const FONT = 'Inter, system-ui, sans-serif'
const TAP = { minHeight: 44, minWidth: 44 }

const mmss = (s) => {
  const v = Math.max(0, Math.round(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

/** Stage timer: a facilitation aid. It never advances or confirms. */
function StageTimer({ seconds, stageKey, reduced }) {
  const [left, setLeft] = useState(seconds || 0)
  const [running, setRunning] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const tick = useRef(null)

  useEffect(() => { setLeft(seconds || 0); setRunning(false); setConfirmReset(false) }, [seconds, stageKey])
  useEffect(() => {
    if (!running) return undefined
    tick.current = setInterval(() => setLeft((v) => v - 1), 1000)
    return () => clearInterval(tick.current)
  }, [running])

  if (!seconds) return null
  const over = left < 0
  const label = over ? `${mmss(-left)} over` : mmss(left)

  const btn = (onClick, text, primary) => (
    <button type="button" onClick={onClick}
      style={{
        ...TAP, border: `1px solid ${primary ? C.matcha : C.line}`,
        background: primary ? C.matchaSoft : C.white, color: primary ? C.matcha : C.ink2,
        borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 650,
        fontFamily: FONT, cursor: 'pointer',
      }}>
      {text}
    </button>
  )

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 14, padding: '9px 11px',
    }}>
      {/* time is text, never colour alone; announced politely */}
      <span aria-live="polite" style={{
        fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: over ? C.goldDark : C.ink, fontFamily: FONT, minWidth: 62,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 10.5, color: C.ink3, fontFamily: FONT }}>
        {over ? 'Suggested time passed. Take the time you need.' : 'Suggested'}
      </span>
      <span style={{ flex: 1 }} />
      {!running ? btn(() => setRunning(true), left === (seconds || 0) ? 'Start' : 'Resume', true)
        : btn(() => setRunning(false), 'Pause')}
      {confirmReset
        ? btn(() => { setLeft(seconds); setRunning(false); setConfirmReset(false) }, 'Reset?')
        : btn(() => setConfirmReset(true), 'Reset')}
      {reduced ? null : null}
    </div>
  )
}

const Bullets = ({ items, muted }) => (
  <ul style={{ margin: 0, padding: '0 0 0 17px', display: 'grid', gap: 6 }}>
    {items.map((t) => (
      <li key={t} style={{ fontSize: 13, lineHeight: 1.5, color: muted ? C.ink2 : C.ink, fontFamily: FONT }}>
        {t}
      </li>
    ))}
  </ul>
)

export default function GuidedPractice({
  session, pairing, userId, partnerName = 'your partner', onClose, onConfirmPractice,
}) {
  const availability = useMemo(
    () => guideAvailability({ session, pairing, userId }), [session, pairing, userId]
  )
  const guide = useMemo(() => resolveGuide(session), [session])
  const stages = useMemo(() => guideStages(guide), [guide])
  const summary = useMemo(() => lobbySummary(session), [session])
  const reduced = useMemo(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
  }, [])

  // ── local, non-authoritative position ──
  const [phase, setPhase] = useState('lobby')      // lobby | running | done
  const [round, setRound] = useState(1)
  const [stageIndex, setStageIndex] = useState(0)
  const [localFirst, setLocalFirst] = useState(null)
  const [resumeOffer, setResumeOffer] = useState(null)
  const sessionId = session?.id

  useEffect(() => {
    if (!sessionId || !userId) return
    if (shouldClearGuideState(session)) { clearGuideState({ userId, sessionId }); return }
    const saved = loadGuideState({ userId, sessionId })
    if (saved && (saved.round > 1 || saved.stageIndex > 0)) setResumeOffer(saved)
    else if (saved?.localFirst) setLocalFirst(saved.localFirst)
  }, [sessionId, userId, session])

  const persist = useCallback((next) => {
    if (!sessionId || !userId) return
    saveGuideState({ userId, sessionId, state: { round, stageIndex, localFirst, ...next } })
  }, [sessionId, userId, round, stageIndex, localFirst])

  const roles = rolesForRound({ session, userId, round, localFirst })
  const stage = stages[stageIndex] || null
  const seconds = suggestedSeconds(stage)

  if (!availability.ok) {
    return (
      <Shell onClose={onClose} title="Guided mock interview">
        <p style={{ margin: 0, fontSize: 13, color: C.ink2, lineHeight: 1.55, fontFamily: FONT }}>
          {availability.message || 'Guided mock interview is not available for this session.'}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
          Your chat and the completion steps are unchanged.
        </p>
      </Shell>
    )
  }

  // ── lobby ──
  if (phase === 'lobby') {
    const firstCandidateName = roles.resolved
      ? (roles.candidateUserId === userId ? 'You' : partnerName)
      : null
    return (
      <Shell onClose={onClose} title="Guided mock interview">
        <p style={{ margin: 0, fontSize: 15, fontWeight: 750, color: C.ink, fontFamily: FONT }}>
          {summary.title}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.ink2, fontFamily: FONT }}>
          {summary.detail}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.ink2, fontFamily: FONT }}>
          {formatSessionTime(session.scheduled_start, session.duration_minutes, session.timezone)}
        </p>

        {/* who starts */}
        <div style={{ marginTop: 12, background: C.white, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 13px' }}>
          {roles.resolved ? (
            <>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: FONT }}>Round 1</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
                {firstCandidateName} {firstCandidateName === 'You' ? 'practise' : 'practises'} as the candidate
                <br />
                {firstCandidateName === 'You' ? partnerName : 'You'} {firstCandidateName === 'You' ? 'acts' : 'act'} as interviewer
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: FONT }}>Round 2</p>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.ink2, fontFamily: FONT }}>Switch roles</p>
              {!roles.fromSession && (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: C.ink3, lineHeight: 1.45, fontFamily: FONT }}>
                  Chosen on this device for the guide only. It is not saved to the session.
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 12.5, color: C.ink, fontFamily: FONT, lineHeight: 1.5 }}>
                This session did not record who starts. Agree with {partnerName}, then choose here.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                {[{ id: userId, label: 'I start as candidate' },
                  { id: session.participant_a_user_id === userId ? session.participant_b_user_id : session.participant_a_user_id,
                    label: `${partnerName} starts` }].map((opt) => (
                  <button key={opt.label} type="button"
                    onClick={() => { setLocalFirst(opt.id); persist({ localFirst: opt.id }) }}
                    style={{
                      ...TAP, flex: 1, border: `1px solid ${C.line}`, background: C.white, color: C.ink2,
                      borderRadius: 11, padding: '9px 6px', fontSize: 12, fontWeight: 650,
                      fontFamily: FONT, cursor: 'pointer',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: C.ink3, lineHeight: 1.45, fontFamily: FONT }}>
                This choice stays on your device. Nothing is written to the session.
              </p>
            </>
          )}
        </div>

        {/* where you're meeting: opening the link starts nothing */}
        <div style={{ marginTop: 12, background: C.white, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 13px' }}>
          <p style={{ margin: '0 0 5px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: C.ink3, fontFamily: FONT }}>
            Where you’re meeting
          </p>
          <MeetingDetails session={session} compact />
        </div>

        {/* what to prepare */}
        <p style={{ margin: '13px 0 6px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: C.ink3, fontFamily: FONT }}>
          Prepare
        </p>
        <Bullets items={guide.prepare || [...(guide.setup || []), MATERIAL_NOTE]} muted />
        <p style={{ margin: '9px 0 0', fontSize: 11.5, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
          {MATERIAL_NOTE} Mutu does not provide cases or exhibits.
        </p>

        {resumeOffer && (
          <div style={{ marginTop: 13, background: C.goldBg, border: `1px solid ${C.goldLight}`, borderRadius: 12, padding: '10px 12px' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#8A6E1E', fontFamily: FONT, lineHeight: 1.5 }}>
              You left this guide at round {resumeOffer.round}, stage {resumeOffer.stageIndex + 1}.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button"
                onClick={() => {
                  setRound(resumeOffer.round); setStageIndex(resumeOffer.stageIndex)
                  if (resumeOffer.localFirst) setLocalFirst(resumeOffer.localFirst)
                  setResumeOffer(null); setPhase('running')
                  track('guided_practice_started', { resumed: true })
                }}
                style={{ ...TAP, flex: 1, border: `1px solid ${C.goldLight}`, background: C.white, color: C.goldDark, borderRadius: 10, padding: '9px 8px', fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' }}>
                Resume where I left off
              </button>
              <button type="button"
                onClick={() => { setResumeOffer(null); setRound(1); setStageIndex(0); persist({ round: 1, stageIndex: 0 }) }}
                style={{ ...TAP, flex: 1, border: `1px solid ${C.line}`, background: C.white, color: C.ink2, borderRadius: 10, padding: '9px 8px', fontSize: 12, fontWeight: 650, fontFamily: FONT, cursor: 'pointer' }}>
                Start guide again
              </button>
            </div>
          </div>
        )}

        <button type="button" disabled={!roles.resolved}
          onClick={() => {
            setPhase('running'); persist({ round, stageIndex })
            track('guided_practice_started', { resumed: false })
          }}
          style={{
            ...TAP, width: '100%', marginTop: 14, border: 'none', borderRadius: 12,
            padding: '13px 0', fontSize: 14, fontWeight: 700, fontFamily: FONT,
            cursor: roles.resolved ? 'pointer' : 'not-allowed',
            opacity: roles.resolved ? 1 : 0.55, ...matchaCta,
          }}>
          Start mock interview
        </button>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: C.ink3, textAlign: 'center', fontFamily: FONT, lineHeight: 1.45 }}>
          You can both open this guide. Each device moves at its own pace.
        </p>
      </Shell>
    )
  }

  // ── complete ──
  if (phase === 'done') {
    return (
      <Shell onClose={onClose} title="Guided mock interview">
        <p style={{ margin: 0, fontSize: 16, fontWeight: 750, color: C.ink, fontFamily: FONT }}>
          Guided mock interview complete
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.ink2, lineHeight: 1.55, fontFamily: FONT }}>
          When you are ready, confirm whether the agreed mock interview happened and both roles were completed.
        </p>
        {guide.completion && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.matcha, lineHeight: 1.5, fontFamily: FONT }}>
            {guide.completion}
          </p>
        )}
        <button type="button"
          onClick={() => { track('confirmation_flow_opened_from_guide'); onConfirmPractice?.() }}
          style={{
            ...TAP, width: '100%', marginTop: 14, border: 'none', borderRadius: 12,
            padding: '13px 0', fontSize: 14, fontWeight: 700, fontFamily: FONT,
            cursor: 'pointer', ...matchaCta,
          }}>
          Confirm mock interview
        </button>
        <button type="button" onClick={onClose}
          style={{
            ...TAP, width: '100%', marginTop: 8, border: `1px solid ${C.line}`, background: C.white,
            color: C.ink2, borderRadius: 12, padding: '11px 0', fontSize: 12.5, fontWeight: 650,
            fontFamily: FONT, cursor: 'pointer',
          }}>
          Close guide
        </button>
        <p style={{ margin: '9px 0 0', fontSize: 11, color: C.ink3, textAlign: 'center', lineHeight: 1.45, fontFamily: FONT }}>
          Nothing is confirmed until you both confirm it.
        </p>
      </Shell>
    )
  }

  // ── switch roles, between the two rounds ──
  if (phase === 'switch') {
    return (
      <Shell onClose={onClose} title={`${summary.title} · Round 2`}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 750, color: C.ink, fontFamily: FONT }}>
          Switch roles
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.ink2, lineHeight: 1.55, fontFamily: FONT }}>
          Round 1 is done. Swap seats and run the same guide the other way round.
        </p>
        <div style={{
          marginTop: 12, background: C.white, border: `1px solid ${C.line}`,
          borderRadius: 14, padding: '12px 13px',
        }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
            {ROLE_LABEL[roles.role]} now
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: C.ink2, lineHeight: 1.5, fontFamily: FONT }}>
            {roles.role === 'candidate'
              ? `${partnerName} interviews you this time.`
              : `${partnerName} practises as the candidate this time.`}
          </p>
        </div>
        <button type="button" onClick={() => setPhase('running')}
          style={{
            ...TAP, width: '100%', marginTop: 14, border: 'none', borderRadius: 12,
            padding: '13px 0', fontSize: 14, fontWeight: 700, fontFamily: FONT,
            cursor: 'pointer', ...matchaCta,
          }}>
          Start round 2
        </button>
        <button type="button" onClick={onClose}
          style={{
            ...TAP, display: 'block', margin: '10px auto 0', border: 'none', background: 'none',
            color: C.ink3, fontSize: 12.5, fontWeight: 650, fontFamily: FONT, cursor: 'pointer',
            textDecoration: 'underline',
          }}>
          Leave guide
        </button>
      </Shell>
    )
  }

  // ── one stage at a time ──
  const instructions = stageInstructions(stage, roles.role)
  const observations = stageObservations(stage, roles.role)
  const advance = (skipped) => {
    const next = nextPosition({ guide, round, stageIndex })
    if (next.done) {
      setPhase('done'); persist({ round, stageIndex })
      track('guided_practice_finished')
      return
    }
    if (next.switching) {
      track('guided_role_switched', { to_round: next.round })
      setPhase('switch')
    } else {
      track('guided_stage_advanced', { stage: stage?.key, skipped: Boolean(skipped) })
    }
    setRound(next.round); setStageIndex(next.stageIndex)
    persist({ round: next.round, stageIndex: next.stageIndex })
  }

  return (
    <Shell onClose={onClose} title={`${summary.title} · Round ${round}`}>
      {/* role + progress: words, never colour alone */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          border: `1px solid ${roles.role === 'candidate' ? C.matcha : C.goldLight}`,
          background: roles.role === 'candidate' ? C.matchaSoft : C.goldBg,
          color: roles.role === 'candidate' ? C.matcha : C.goldDark,
          borderRadius: 99, padding: '5px 12px', fontSize: 12, fontWeight: 700, fontFamily: FONT,
        }}>
          {ROLE_LABEL[roles.role]}
        </span>
        <span style={{ flex: 1 }} />
        <span aria-live="polite" style={{ fontSize: 11.5, color: C.ink3, fontFamily: FONT }}>
          {stageIndex + 1} of {stages.length}
        </span>
      </div>

      <h3 style={{ margin: '12px 0 2px', fontSize: 17, fontWeight: 750, color: C.ink, letterSpacing: '-0.015em', fontFamily: FONT }}>
        {stage.title}
      </h3>
      {stage.time && (
        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: C.ink3, fontFamily: FONT }}>
          Suggested {stage.time}
        </p>
      )}

      <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 13px' }}>
        <Bullets items={instructions} />
        {stage.note && (
          <p style={{ margin: '9px 0 0', fontSize: 11.5, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
            {stage.note}
          </p>
        )}
      </div>

      {observations.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{
            ...TAP, listStyle: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            fontSize: 12.5, fontWeight: 650, color: C.ink2, fontFamily: FONT, padding: '10px 0',
          }}>
            What to observe
          </summary>
          <div style={{ paddingTop: 4 }}>
            <Bullets items={observations} muted />
          </div>
        </details>
      )}

      {seconds && (
        <div style={{ marginTop: 12 }}>
          <StageTimer seconds={seconds} stageKey={`${round}:${stage.key}`} reduced={reduced} />
        </div>
      )}

      <button type="button" onClick={() => advance(false)}
        style={{
          ...TAP, width: '100%', marginTop: 14, border: 'none', borderRadius: 12,
          padding: '13px 0', fontSize: 14, fontWeight: 700, fontFamily: FONT,
          cursor: 'pointer', ...matchaCta,
        }}>
        {stage.cta
          || (stageIndex === stages.length - 1
              ? (round === 1 ? 'Switch roles' : 'Finish guided mock interview')
              : 'Next stage')}
      </button>
      {stage.skip && (
        <button type="button" onClick={() => advance(true)}
          style={{
            ...TAP, width: '100%', marginTop: 8, border: `1px solid ${C.line}`, background: C.white,
            color: C.ink2, borderRadius: 12, padding: '11px 0', fontSize: 12.5, fontWeight: 650,
            fontFamily: FONT, cursor: 'pointer',
          }}>
          {stage.skip}
        </button>
      )}
      <button type="button" onClick={onClose}
        style={{
          ...TAP, display: 'block', margin: '10px auto 0', border: 'none', background: 'none',
          color: C.ink3, fontSize: 12.5, fontWeight: 650, fontFamily: FONT, cursor: 'pointer',
          textDecoration: 'underline',
        }}>
        Leave guide
      </button>
    </Shell>
  )
}

function Shell({ title, onClose, children }) {
  return (
    <div style={{ padding: '2px 16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: C.ink3, fontFamily: FONT }}>
          {title}
        </h2>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onClose}
          style={{
            ...TAP, border: `1px solid ${C.line}`, background: C.white, color: C.ink2,
            borderRadius: 99, padding: '6px 13px', fontSize: 11.5, fontWeight: 650,
            fontFamily: FONT, cursor: 'pointer',
          }}>
          Close
        </button>
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  )
}
