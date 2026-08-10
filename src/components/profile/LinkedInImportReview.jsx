import { useState } from 'react'
import { C } from './theme'

// "Review your LinkedIn information" — nothing is written until the user
// confirms. Shows only fields LinkedIn actually returned; each is editable and
// individually toggleable. Email is read-only context (never replaces the
// verified Mutu login email). The user may add a LinkedIn URL themselves.
export default function LinkedInImportReview({ claims = {}, rows = [], onUse, onDiscard }) {
  // Local editable copies + per-field "use" choices (default from the row).
  const [values, setValues] = useState(() => Object.fromEntries(rows.map(r => [r.key, r.imported])))
  const [choices, setChoices] = useState(() => Object.fromEntries(rows.map(r => [r.key, r.use])))
  const [url, setUrl] = useState('')

  const setVal = (k, v) => setValues(s => ({ ...s, [k]: v }))
  const toggle = (k) => setChoices(s => ({ ...s, [k]: !s[k] }))
  const photo = values.picture

  return (
    <div style={{ fontFamily: C.sans }}>
      <h2 style={{ fontFamily: C.serif, fontWeight: 600, color: C.title, fontSize: 24, margin: '0 0 6px' }}>Review your LinkedIn information</h2>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: C.sub, lineHeight: 1.5 }}>
        We only added information LinkedIn shared with your permission. Edit or remove anything before saving it to Mutu.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
        {photo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <img src={photo} alt="" width={56} height={56} style={{ borderRadius: '50%', objectFit: 'cover', border: `1px solid ${C.line}` }} />
            <ToggleTag on={choices.picture} onClick={() => toggle('picture')} label="Use this photo" />
          </div>
        )}

        {rows.filter(r => r.key !== 'picture').map(r => (
          <div key={r.key} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{r.label}</span>
              <ToggleTag on={choices[r.key]} onClick={() => toggle(r.key)} label="Use" />
            </div>
            <input value={values[r.key] || ''} onChange={e => setVal(r.key, e.target.value)} disabled={!choices[r.key]}
              style={{ ...input, opacity: choices[r.key] ? 1 : 0.55 }} />
            {r.conflict && <p style={hintErr}>Your current Mutu {r.label.toLowerCase()} is “{r.existing}”. Turning this on replaces it.</p>}
          </div>
        ))}

        {claims.email && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Email <span style={{ color: C.muted, fontWeight: 500 }}>· from LinkedIn, not saved</span></span>
            <input value={claims.email} readOnly style={{ ...input, background: '#F4F1EA', color: C.sub, marginTop: 6 }} />
          </div>
        )}

        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>LinkedIn URL <span style={{ color: C.muted, fontWeight: 500 }}>· optional</span></span>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.linkedin.com/in/…" style={{ ...input, marginTop: 6 }} />
        </div>
      </div>

      <button type="button"
        onClick={() => onUse?.(choices, { values, linkedinUrl: url.trim() })}
        style={{ width: '100%', marginTop: 16, background: C.green, color: '#fff', border: 'none', borderRadius: 13, padding: '15px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans }}>
        Use this information
      </button>
      <button type="button" onClick={onDiscard}
        style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none', color: C.sub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: C.sans, padding: '6px' }}>
        Discard imported information
      </button>
    </div>
  )
}

function ToggleTag({ on, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: on ? C.chipGoldBg : '#fff',
        border: `1.5px solid ${on ? C.goldMid : C.line}`, color: on ? C.chipGoldInk : C.muted,
        borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.sans }}>
      {on ? '✓' : '○'} {label}
    </button>
  )
}

const input = { width: '100%', fontFamily: C.sans, fontSize: 15, color: C.ink, background: '#FCFBF8', border: `1px solid ${C.line}`, borderRadius: 11, padding: '12px 13px', outline: 'none', boxSizing: 'border-box' }
const hintErr = { margin: '6px 0 0', fontSize: 12, color: '#9A6A2A', lineHeight: 1.4 }
