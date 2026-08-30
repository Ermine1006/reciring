import { useState } from 'react'
import { PILOT_PRACTICE_TYPES, PRACTICE_TYPE_SHORT } from '../../data/practiceOptions'
import { wallTimeToUtc } from '../../lib/practiceMatching'
import { MATCHA_DEEP, MATCHA_SOFT } from '../../lib/matchaCta'

// One-card setup: two questions, one CTA, under 15 seconds.
//   I want to practise · I can help with → [ Show me partners ]
// Preferred times are OPTIONAL (they never block matching — the
// database has no availability requirement). Format, duration, and
// context use sensible defaults and live under Edit preferences.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

const inputStyle = {
  border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px',
  fontSize: 13, fontFamily: FONT, color: C.ink, background: C.white,
  outline: 'none', boxSizing: 'border-box', minWidth: 0,
}

function TypeRow({ label, selected, onToggle }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ margin: '0 0 7px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: C.ink3, fontFamily: FONT }}>
        {label}
      </p>
      <div style={{ display: 'flex', gap: 9 }}>
        {PILOT_PRACTICE_TYPES.map((t) => {
          const on = selected.includes(t)
          return (
            <button key={t} type="button" onClick={() => onToggle(t)}
              className="active:scale-95 transition-all"
              style={{
                flex: 1, border: `1.5px solid ${on ? MATCHA_DEEP : C.line}`, borderRadius: 13,
                padding: '13px 0', fontSize: 14.5, fontWeight: 700, fontFamily: FONT,
                background: on ? MATCHA_SOFT : C.white, color: on ? MATCHA_DEEP : C.ink2, cursor: 'pointer',
              }}>
              {on ? '✓ ' : ''}{PRACTICE_TYPE_SHORT[t]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function QuickSetupCard({ saving, onPublish }) {
  const [want, setWant] = useState([])
  const [help, setHelp] = useState([])
  const [showTimes, setShowTimes] = useState(false)
  const [windows, setWindows] = useState([])
  const [err, setErr] = useState(null)

  const toggle = (list, set) => (t) => set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t])
  const setWin = (i, k, v) => setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, [k]: v } : w)))
  const ready = want.length > 0 && help.length > 0

  const publish = () => {
    setErr(null)
    const converted = []
    for (const w of windows.filter((x) => x.date && x.start && x.end)) {
      const starts_at = wallTimeToUtc(w.date, w.start, 'America/Toronto')
      const ends_at = wallTimeToUtc(w.date, w.end, 'America/Toronto')
      if (ends_at <= starts_at) return setErr('Each time must end after it starts.')
      converted.push({ starts_at, ends_at })
    }
    onPublish({ wantTypes: want, helpTypes: help, windows: converted })
  }

  return (
    <div style={{
      background: C.white, borderRadius: 18, border: `1px solid ${C.line}`,
      padding: '18px 18px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}>
      <p style={{ margin: '0 0 3px', fontSize: 16, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
        Find a mock interview partner
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: C.ink2, lineHeight: 1.5, fontFamily: FONT }}>
        You practise one round, they practise one round. Anonymous until you both accept.
      </p>

      <TypeRow label="I want to practise" selected={want} onToggle={toggle(want, setWant)} />
      <TypeRow label="I can help with" selected={help} onToggle={toggle(help, setHelp)} />

      {/* Optional preferred times — never required for matching */}
      <button type="button" onClick={() => { setShowTimes(!showTimes); if (!showTimes && windows.length === 0) setWindows([{ date: '', start: '', end: '' }]) }}
        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: MATCHA_DEEP, fontFamily: FONT }}>
        {showTimes ? '− Preferred times' : '+ Add preferred times (optional)'}
      </button>
      {showTimes && (
        <div style={{ marginTop: 9 }}>
          {windows.map((w, i) => (
            <div key={i} style={{ background: '#FAF9F5', border: `1px solid ${C.line}`, borderRadius: 12, padding: 8, marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <input type="date" style={{ ...inputStyle, flex: 1 }} value={w.date} onChange={(e) => setWin(i, 'date', e.target.value)} />
                <button type="button" aria-label="Remove time"
                  onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}
                  style={{ border: 'none', background: 'none', color: C.ink3, fontSize: 16, cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>×</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <input type="time" style={{ ...inputStyle, flex: 1 }} value={w.start} onChange={(e) => setWin(i, 'start', e.target.value)} />
                <span style={{ color: C.ink3, fontSize: 12, flexShrink: 0 }}>to</span>
                <input type="time" style={{ ...inputStyle, flex: 1 }} value={w.end} onChange={(e) => setWin(i, 'end', e.target.value)} />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setWindows((ws) => [...ws, { date: '', start: '', end: '' }])}
            style={{ border: `1px dashed ${C.goldLight}`, background: C.goldBg, color: C.goldDark, borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
            + Another time
          </button>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: C.ink3, fontFamily: FONT }}>
            Toronto time. Times help partners book you instantly, but matching works without them.
          </p>
        </div>
      )}

      {err && <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, color: '#B4232A', fontFamily: FONT }}>{err}</p>}

      <button type="button" disabled={!ready || saving} onClick={publish}
        className="active:scale-[0.98] transition-all"
        style={{
          width: '100%', marginTop: 14, border: 'none', borderRadius: 14,
          padding: '14px 0', fontSize: 15, fontWeight: 750, fontFamily: FONT,
          background: MATCHA_DEEP, color: '#fff',
          cursor: !ready || saving ? 'default' : 'pointer', opacity: !ready ? 0.55 : saving ? 0.75 : 1,
          boxShadow: '0 2px 10px rgba(92,106,62,0.28)',
        }}>
        {saving ? 'Finding partners…' : 'Show me partners'}
      </button>
    </div>
  )
}
