import { useMemo, useState } from 'react'
import { matchaCta } from '../../lib/matchaCta'
import {
  ANSWERS, ANSWER_KEYS, DID_NOT_HAPPEN_REASONS,
  roleLabels, buildSubmission, reviewLines, validateFeedback,
} from '../../lib/practiceConfirmation'
import {
  FEEDBACK_FRAMING, FEEDBACK_QUESTION, NOTE_LABEL, NOTE_MAX, suggestionsFor,
} from '../../data/practiceFeedback'

// ── Completion confirmation ─────────────────────────────────────────
// Three short screens, about fifteen to thirty seconds:
//   1. did this practice happen
//   2. were both agreed roles completed  (only after "yes")
//   3. one private suggestion for your partner  (optional)
// then a review, because the confirmation is immutable.
//
// The database stays authoritative: this card never mints a Token,
// never marks anything verified, and never infers completion from the
// guide, the timer or the clock. It submits only what the person
// explicitly stated, through the existing RPC.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
  matcha: '#6E7F4A', matchaSoft: '#EDF0E4',
}
const FONT = 'Inter, system-ui, sans-serif'
const TAP = { minHeight: 44 }

const Choice = ({ selected, onClick, children, sub }) => (
  <button type="button" onClick={onClick} aria-pressed={selected}
    style={{
      ...TAP, width: '100%', textAlign: 'left', display: 'block',
      background: selected ? C.matchaSoft : C.white,
      border: `1.5px solid ${selected ? C.matcha : C.line}`,
      borderRadius: 13, padding: '11px 13px', marginBottom: 8,
      fontFamily: FONT, cursor: 'pointer',
    }}>
    <span style={{ display: 'block', fontSize: 13, fontWeight: 650, color: selected ? C.matcha : C.ink }}>
      {children}
    </span>
    {sub && (
      <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: C.ink3, lineHeight: 1.45 }}>
        {sub}
      </span>
    )}
  </button>
)

const CheckRow = ({ checked, onChange, label }) => (
  <label style={{
    ...TAP, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
    background: C.white, border: `1.5px solid ${checked ? C.matcha : C.line}`,
    borderRadius: 13, padding: '11px 13px', marginBottom: 8,
  }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
      style={{ width: 20, height: 20, accentColor: C.matcha, flexShrink: 0 }} />
    <span style={{ fontSize: 13, color: C.ink, fontFamily: FONT, lineHeight: 1.45 }}>{label}</span>
  </label>
)

export default function SessionConfirmCard({
  partnerName = 'your partner', myUserId, partnerUserId, busy, onSubmit, session = null,
  feedbackSupported = false,
}) {
  const [step, setStep] = useState('happened')     // happened | roles | feedback | review
  const [answer, setAnswer] = useState(null)       // nothing preselected
  const [ownRound, setOwnRound] = useState(false)
  const [partnerRound, setPartnerRound] = useState(false)
  const [reasonCode, setReasonCode] = useState(null)
  const [suggestionCode, setSuggestionCode] = useState(null)
  const [note, setNote] = useState('')

  const labels = roleLabels(session)
  const options = useMemo(
    () => suggestionsFor({
      interviewCategory: session?.interview_category,
      skillFocus: session?.skill_focus,
    }),
    [session]
  )
  const submission = buildSubmission({
    answer, ownRound, partnerRound, reasonCode,
    partnerUserId, myUserId, suggestionCode, note,
  })
  const feedbackCheck = validateFeedback({
    interviewCategory: session?.interview_category, suggestionCode, note,
  })

  const Frame = ({ children }) => (
    <div style={{
      margin: '0 16px 16px', background: '#FBFAF7', border: `1px solid ${C.line}`,
      borderRadius: 16, padding: '14px 16px 16px',
    }}>
      <p style={{ margin: '0 0 10px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: C.gold, fontFamily: FONT }}>
        Confirm your session
      </p>
      {children}
    </div>
  )

  const Primary = ({ onClick, disabled, children }) => (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className="active:scale-[0.98] transition-all"
      style={{
        ...TAP, width: '100%', border: 'none', borderRadius: 12, padding: '13px 0',
        fontSize: 14, fontWeight: 700, fontFamily: FONT,
        cursor: disabled || busy ? 'not-allowed' : 'pointer',
        opacity: disabled || busy ? 0.55 : 1, ...matchaCta,
      }}>
      {children}
    </button>
  )

  const Back = ({ to }) => (
    <button type="button" onClick={() => setStep(to)}
      style={{
        ...TAP, display: 'block', margin: '9px auto 0', border: 'none', background: 'none',
        color: C.ink3, fontSize: 12.5, fontWeight: 650, fontFamily: FONT,
        cursor: 'pointer', textDecoration: 'underline',
      }}>
      Back
    </button>
  )

  // ── 1. did it happen ──
  if (step === 'happened') {
    const ready = answer && (answer !== 'did_not_happen' || reasonCode)
    return (
      <Frame>
        <p style={{ margin: '0 0 11px', fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: FONT, lineHeight: 1.4 }}>
          Did this mock interview happen as planned?
        </p>
        {ANSWER_KEYS.map((k) => (
          <Choice key={k} selected={answer === k} onClick={() => setAnswer(k)} sub={ANSWERS[k].note}>
            {ANSWERS[k].label}
          </Choice>
        ))}
        {answer === 'did_not_happen' && (
          <div style={{ margin: '4px 0 10px' }}>
            <p style={{ margin: '0 0 7px', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
              What happened? This stays private and affects no score.
            </p>
            {DID_NOT_HAPPEN_REASONS.map((r) => (
              <Choice key={r.code} selected={reasonCode === r.code} onClick={() => setReasonCode(r.code)}>
                {r.label}
              </Choice>
            ))}
          </div>
        )}
        <Primary disabled={!ready}
          onClick={() => setStep(answer === 'completed' ? 'roles' : 'review')}>
          Continue
        </Primary>
      </Frame>
    )
  }

  // ── 2. the agreed roles ──
  if (step === 'roles') {
    return (
      <Frame>
        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: FONT, lineHeight: 1.4 }}>
          Confirm the agreed roles
        </p>
        <p style={{ margin: '0 0 11px', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
          Tick both only if they actually happened.
        </p>
        <CheckRow checked={ownRound} onChange={setOwnRound} label={labels.own} />
        <CheckRow checked={partnerRound} onChange={setPartnerRound} label={labels.partner} />
        <Primary disabled={!ownRound || !partnerRound}
          onClick={() => setStep(feedbackSupported ? 'feedback' : 'review')}>
          Continue
        </Primary>
        <Back to="happened" />
      </Frame>
    )
  }

  // ── 3. one private suggestion ──
  if (step === 'feedback') {
    return (
      <Frame>
        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: FONT, lineHeight: 1.4 }}>
          {FEEDBACK_QUESTION}
        </p>
        <p style={{ margin: '0 0 11px', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
          {FEEDBACK_FRAMING} Only {partnerName} sees it.
        </p>
        {options.map((o) => (
          <Choice key={o.code} selected={suggestionCode === o.code}
            onClick={() => setSuggestionCode(suggestionCode === o.code ? null : o.code)}>
            {o.label}
          </Choice>
        ))}
        <label htmlFor="feedback-note"
          style={{ display: 'block', margin: '4px 0 5px', fontSize: 12, fontWeight: 650, color: C.ink2, fontFamily: FONT }}>
          {NOTE_LABEL} <span style={{ fontWeight: 500, color: C.ink3 }}>optional</span>
        </label>
        <textarea id="feedback-note" value={note} rows={3}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          placeholder="For example: the recommendation came after the analysis, try leading with it."
          style={{
            width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`,
            borderRadius: 12, padding: '10px 12px', fontSize: 13, lineHeight: 1.5,
            color: C.ink, fontFamily: FONT, resize: 'vertical', background: C.white,
          }} />
        <p aria-live="polite" style={{ margin: '4px 0 10px', fontSize: 11.5, color: C.ink3, fontFamily: FONT, textAlign: 'right' }}>
          {note.length} of {NOTE_MAX} characters
        </p>
        <Primary disabled={!feedbackCheck.ok} onClick={() => setStep('review')}>
          {suggestionCode ? 'Continue' : 'Skip and continue'}
        </Primary>
        <Back to="roles" />
      </Frame>
    )
  }

  // ── review, then an immutable submission ──
  const lines = reviewLines({ session, answer, suggestionCode, note, reasonCode })
  return (
    <Frame>
      <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
        You are confirming:
      </p>
      <ul style={{ margin: '0 0 10px', padding: '0 0 0 18px', display: 'grid', gap: 5 }}>
        {lines.map((l) => (
          <li key={l} style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, fontFamily: FONT }}>{l}</li>
        ))}
      </ul>
      <p style={{ margin: '0 0 11px', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
        You cannot edit this confirmation after submitting.
      </p>
      <Primary disabled={!submission} onClick={() => onSubmit?.(submission)}>
        {busy ? 'Submitting…' : 'Submit confirmation'}
      </Primary>
      <Back to={answer === 'completed' ? (feedbackSupported ? 'feedback' : 'roles') : 'happened'} />
    </Frame>
  )
}
