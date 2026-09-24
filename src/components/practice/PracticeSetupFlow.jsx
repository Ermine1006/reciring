import PracticeDirectionPicker, { PracticeTypeChoices, useFinancePracticeSupport } from './PracticeDirectionPicker'
import { directionForTypes, isFinanceType, practiceTypeLabel } from '../../data/practiceDirections'
import PresetOption from './AvailabilityPresetOption'
import { useState } from 'react'
import {
  PILOT_PRACTICE_TYPES, PRACTICE_TYPE_LABELS, DURATION_OPTIONS,
  DEFAULT_DURATION_MINUTES, DEFAULT_TIMEZONE,
} from '../../data/practiceOptions'
import { wallTimeToUtc } from '../../lib/practiceMatching'
import { AVAILABILITY_PRESETS, presetToWindows, isPresetAutomatic } from '../../lib/practiceAvailability'
import { MATCHA_DEEP } from '../../lib/matchaCta'

// ── Two-step progressive setup ───────────────────────────────────
//   1 · What you practise and what you help with  (both required)
//   2 · When you are free                         (one tap)
//
// This was three steps, with the two practice questions on separate
// screens and three typed fields per availability window. Testers
// stalled: the questions read as one decision, and typing dates was
// the single slowest moment in the flow. Now they share a screen, and
// availability is a preset ("Weekday evenings this week") that expands
// into real windows, with the typed form kept behind "Pick exact times"
// for anyone who wants it.
//
// Focus text, help context and format still live behind "Add more
// details". Virtual is the default format. One sentence of anonymity
// copy, a labeled step header (no bare progress bar).

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: 'var(--mutu-surface, #FFFFFF)',
}
const FONT = 'Inter, system-ui, sans-serif'

const inputStyle = {
  width: '100%', border: `1px solid ${C.line}`, borderRadius: 10,
  padding: '10px 12px', fontSize: 13.5, fontFamily: FONT, color: C.ink,
  background: C.white, outline: 'none', boxSizing: 'border-box',
}

function isoToWall(iso, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  }
}


const LAST_STEP = 2


function MoreDetails({ open, onToggle, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <button type="button" onClick={onToggle}
        style={{
          border: 'none', background: 'none', padding: 0, cursor: 'pointer',
          fontSize: 12.5, fontWeight: 650, color: MATCHA_DEEP, fontFamily: FONT,
        }}>
        {open ? '− Hide details' : '+ Add more details (optional)'}
      </button>
      {open && <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
    </div>
  )
}

export default function PracticeSetupFlow({ existing, existingWindows = [], onSave, onCancel, saving, initialStep = 1 }) {
  const [direction, setDirection] = useState(directionForTypes(existing?.want_types))
  const finance = useFinancePracticeSupport()
  const tz = existing?.timezone || DEFAULT_TIMEZONE
  // Deep-linking into a step only makes sense when a request already
  // exists (e.g. "Add more times" → the availability step); first-timers
  // always start at 1. Callers still pass the old step-3 id for times,
  // so anything past the last step lands on it rather than nowhere.
  const [step, setStep] = useState(existing ? Math.min(Math.max(initialStep, 1), LAST_STEP) : 1)
  const [wantTypes, setWantTypes] = useState(existing?.want_types || [])
  const [wantFocus, setWantFocus] = useState(existing?.want_focus || '')
  const [helpTypes, setHelpTypes] = useState(existing?.help_types || [])
  const [helpFocus, setHelpFocus] = useState(existing?.help_focus || '')
  const [helpContext, setHelpContext] = useState(existing?.help_context || '')
  const [locationType, setLocationType] = useState(existing?.location_type || 'virtual')
  const [duration, setDuration] = useState(existing?.duration_minutes || DEFAULT_DURATION_MINUTES)
  const [windows, setWindows] = useState(() => {
    const ws = existingWindows.map((w) => {
      const s = isoToWall(w.starts_at, tz); const e = isoToWall(w.ends_at, tz)
      return { date: s.date, start: s.time, end: e.time }
    })
    return ws.length ? ws : [{ date: '', start: '', end: '' }]
  })
  const [more1, setMore1] = useState(Boolean(existing?.want_focus))
  const [more2, setMore2] = useState(Boolean(existing?.help_focus || existing?.help_context))
  const [more3, setMore3] = useState(false)
  // Someone who already typed windows keeps seeing them; a first-timer
  // gets the common answer pre-selected, and still has to press Publish
  // before any of it becomes real availability.
  const [preset, setPreset] = useState(existingWindows.length ? 'exact' : 'weekday_evenings')
  const [err, setErr] = useState(null)

  const toggle = (list, set) => (t) => set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t])
  const setWin = (i, key, val) => setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, [key]: val } : w)))

  const next = () => {
    setErr(null)
    if ([...wantTypes, ...helpTypes].some(isFinanceType) && !finance.supported) return setErr('Finance practice is not enabled yet. Please try again later.')
    if (wantTypes.length === 0) return setErr('Pick at least one thing you want to practise.')
    if (helpTypes.length === 0) return setErr('Pick at least one. Both people practise, both people help!')
    setStep(step + 1)
  }

  const submit = () => {
    setErr(null)
    if ([...wantTypes, ...helpTypes].some(isFinanceType) && !finance.supported) return setErr('Finance practice is not enabled yet. Please try again later.')
    // Times are OPTIONAL: matching works without them (they only let
    // partners book you instantly). The database has no requirement.
    // A preset expands into the same wall-time shape the typed form
    // produces, so everything below this line is unchanged by it.
    const source = isPresetAutomatic(preset) ? presetToWindows(preset, tz) : preset === 'exact' ? windows : []
    const valid = source.filter((w) => w.date && w.start && w.end)
    const converted = []
    for (const w of valid) {
      const starts_at = wallTimeToUtc(w.date, w.start, tz)
      const ends_at = wallTimeToUtc(w.date, w.end, tz)
      if (ends_at <= starts_at) return setErr('Each window must end after it starts.')
      converted.push({ starts_at, ends_at })
    }
    onSave({
      wantTypes, wantFocus, helpTypes, helpFocus, helpContext,
      locationType, durationMinutes: duration, timezone: tz, windows: converted,
    })
  }

  const tzLabel = tz.replace('America/', '').replace(/_/g, ' ')
  const TITLES = {
    1: 'What would you like to practise?',
    2: 'When could you practise?',
  }
  const SUBS = {
    1: 'One round for you, one round for them. Both answers help us find your match.',
    2: `Pick what suits you. You and your partner settle the exact time together (${tzLabel} time).`,
  }

  return (
    <div className="flex-1 phone-scroll practice-ui practice-setup" style={{ background: 'var(--mutu-canvas, #F9F7F4)' }}>
      <div style={{ padding: '10px 20px 28px', maxWidth: 560, margin: '0 auto' }}>

        {/* Labeled step header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <button type="button" aria-label="Back"
            onClick={() => (step === 1 ? onCancel?.() : setStep(step - 1))}
            style={{ border: 'none', background: 'none', padding: '6px 6px 6px 0', cursor: 'pointer' }}>
            <svg width="18" height="18" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, fontFamily: FONT }}>
            Step {step} of {LAST_STEP}
          </span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.ink, margin: '0 0 4px', letterSpacing: '-0.01em', fontFamily: FONT }}>
          {TITLES[step]}
        </h2>
        <p style={{ fontSize: 13, color: C.ink2, margin: '0 0 18px', lineHeight: 1.5, fontFamily: FONT }}>
          {SUBS[step]}
        </p>

        {step === 1 && (
          <div className="practice-setup-cards">
            <PracticeDirectionPicker value={direction} onChange={setDirection} finance={finance} disabled={saving} />
            <p className="quest-setup-preference-status">Selected: practise {wantTypes.map(practiceTypeLabel).join(', ') || 'not chosen'} · help with {helpTypes.map(practiceTypeLabel).join(', ') || 'not chosen'}</p>
            <section className="practice-paper">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: '0 0 4px', fontFamily: FONT }}>
              I want to practise
            </h3>
            <p style={{ fontSize: 12.5, color: C.ink2, margin: '0 0 10px', fontFamily: FONT }}>
              Your partner runs this round for you.
            </p>
            <PracticeTypeChoices direction={direction} disabled={saving || (direction === 'finance' && !finance.supported)} label="You want to practise" selected={wantTypes} onToggle={toggle(wantTypes, setWantTypes)} />
            <MoreDetails open={more1} onToggle={() => setMore1(!more1)}>
              <input style={inputStyle} value={wantFocus} maxLength={140}
                onChange={(e) => setWantFocus(e.target.value)}
                placeholder="Your target, like MBB first rounds" />
            </MoreDetails>

            </section>
            <section className="practice-paper">

            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: '0 0 4px', fontFamily: FONT }}>
              I can help with
            </h3>
            <p style={{ fontSize: 12.5, color: C.ink2, margin: '0 0 10px', fontFamily: FONT }}>
              You run your partner&rsquo;s round and give feedback.
            </p>
            <PracticeTypeChoices direction={direction} disabled={saving || (direction === 'finance' && !finance.supported)} label="You can run a round on" selected={helpTypes} onToggle={toggle(helpTypes, setHelpTypes)} />
            <MoreDetails open={more2} onToggle={() => setMore2(!more2)}>
              <input style={inputStyle} value={helpFocus} maxLength={140}
                onChange={(e) => setHelpFocus(e.target.value)}
                placeholder="Where you give great feedback, like consulting fit" />
              <input style={inputStyle} value={helpContext} maxLength={180}
                onChange={(e) => setHelpContext(e.target.value)}
                placeholder="A little context, like 2 yrs consulting pre-MBA (no names)" />
            </MoreDetails>
            </section>
          </div>
        )}

        {step === 2 && (
          <>
            <div role="radiogroup" aria-label="When you are free"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {AVAILABILITY_PRESETS.map((p) => (
                <PresetOption key={p.id} preset={p} tzLabel={tzLabel}
                  selected={preset === p.id} onSelect={setPreset} />
              ))}
            </div>

            {isPresetAutomatic(preset) && (
              <p style={{ fontSize: 12.5, color: C.ink2, margin: '0 0 4px', lineHeight: 1.5, fontFamily: FONT }}>
                Upcoming dates: {presetToWindows(preset, tz).map(w => w.date).join(', ')}. You can change them any time.
              </p>
            )}

            {preset === 'exact' && (
          <>
            {windows.map((w, i) => (
              <div key={i} style={{
                background: C.white, border: `1px solid ${C.line}`, borderRadius: 14,
                padding: 10, marginBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <input type="date" style={{ ...inputStyle, flex: 1 }} value={w.date}
                    onChange={(e) => setWin(i, 'date', e.target.value)} />
                  {windows.length > 1 && (
                    <button type="button" aria-label="Remove window"
                      onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'none', color: C.ink3, fontSize: 17, cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="time" style={{ ...inputStyle, flex: 1, minWidth: 0 }} value={w.start}
                    onChange={(e) => setWin(i, 'start', e.target.value)} />
                  <span style={{ color: C.ink3, fontSize: 13, flexShrink: 0 }}>to</span>
                  <input type="time" style={{ ...inputStyle, flex: 1, minWidth: 0 }} value={w.end}
                    onChange={(e) => setWin(i, 'end', e.target.value)} />
                </div>
              </div>
            ))}
                <button data-mutu-glass="" type="button"
                  onClick={() => setWindows((ws) => [...ws, { date: '', start: '', end: '' }])}
                  style={{
                    alignSelf: 'flex-start', border: `1px dashed ${C.goldLight}`, background: C.goldBg,
                    color: C.goldDark, borderRadius: 10, padding: '8px 14px',
                    fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
                  }}>
                  + Add another window
                </button>
              </>
            )}

            <MoreDetails open={more3} onToggle={() => setMore3(!more3)}>
              <div style={{ display: 'flex', gap: 8 }}>
                <select style={{ ...inputStyle, flex: 1 }} value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                  <option value="virtual">Virtual (default)</option>
                  <option value="in_person">In person</option>
                  <option value="either">Either</option>
                </select>
                <select style={{ ...inputStyle, flex: 1 }} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            </MoreDetails>
          </>
        )}

        {err && <p role="alert" style={{ margin: '14px 0 0', fontSize: 12.5, color: '#B4232A', fontFamily: FONT }}>{err}</p>}

        <button data-mutu-glass="" type="button" disabled={saving}
          onClick={step === LAST_STEP ? submit : next}
          className="active:scale-[0.98] transition-all"
          style={{
            width: '100%', marginTop: 20, border: 'none', borderRadius: 14,
            padding: '14px 0', fontSize: 14.5, fontWeight: 700, fontFamily: FONT,
            background: MATCHA_DEEP, color: '#FFFFFF',
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            boxShadow: '0 2px 10px rgba(92,106,62,0.30)',
          }}>
          {step === LAST_STEP
            ? (saving ? 'Publishing…' : existing ? 'Save changes' : 'Publish and find partners')
            : <>Continue <span style={{ color: C.goldLight }}>→</span></>}
        </button>

        <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12, color: C.ink3, fontFamily: FONT }}>
          🔒 You stay anonymous until you and a partner both accept.
        </p>
      </div>
    </div>
  )
}
