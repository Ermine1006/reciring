import { C } from './theme'
import { TagPicker } from './Pickers'
import { TOPICS, INTEREST_GROUPS, PROGRAMS } from '../../data/profileTaxonomy'

// ── Lean onboarding — one screen, only the fields that drive matching ──────
// Program + can-help + want-help + interests. Everything else (role, company,
// headline, industries, activities, prompts, connection prefs) is available in
// the full Edit-profile wizard afterwards, so onboarding stays fast.
//
// Controlled by value/onChange (parent owns the draft + autosave); onDone fires
// on "Done".
export default function ProfileQuickStart({ value = {}, onChange, onDone }) {
  const v = value
  const set = (patch) => onChange({ ...v, ...patch })
  const arr = (k) => Array.isArray(v[k]) ? v[k] : []

  return (
    <div style={{ background: C.page, minHeight: '100%', fontFamily: C.sans }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '34px 18px 60px' }}>
        <p style={eyebrow}>Welcome to Mutu</p>
        <h1 style={bigTitle}>Set up your profile</h1>
        <p style={lede}>Just the essentials — this is what powers your matches. You can add more anytime.</p>

        <div style={card}>
          <div style={field}>
            <p style={flabel}>Program</p>
            <select value={v.program || ''} onChange={e => set({ program: e.target.value })}
              style={{ ...input, appearance: 'none',
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236C6559' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 15px center' }}>
              <option value="">Select…</option>
              {PROGRAMS.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
            </select>
          </div>

          <div style={field}>
            <p style={flabel}>What I can help with <Count n={arr('expertiseOffered').length} max={5} /></p>
            <p style={fhint}>What can someone genuinely come to you for?</p>
            <TagPicker options={TOPICS} value={arr('expertiseOffered')} onChange={x => set({ expertiseOffered: x })} max={5} allowCustom />
          </div>

          <div style={field}>
            <p style={flabel}>What I want help with <Count n={arr('helpWanted').length} max={5} /></p>
            <p style={fhint}>What are you trying to learn, solve or explore?</p>
            <TagPicker options={TOPICS} value={arr('helpWanted')} onChange={x => set({ helpWanted: x })} max={5} allowCustom />
          </div>

          <div style={field}>
            <p style={flabel}>Interests <Count n={arr('interests').length} max={5} /></p>
            <p style={fhint}>What would you genuinely enjoy connecting over?</p>
            <TagPicker grouped options={INTEREST_GROUPS} value={arr('interests')} onChange={x => set({ interests: x })} max={5} allowCustom />
          </div>

          <button type="button" onClick={onDone} style={btnGreen}>Done →</button>
          <p style={{ textAlign: 'center', color: C.muted, fontSize: 12.5, marginTop: 12 }}>
            You can add your role, industries and more later in <b style={{ color: C.sub }}>Edit profile</b>.
          </p>
        </div>
      </div>
    </div>
  )
}

function Count({ n, max }) {
  return <span style={{ float: 'right', fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{n} / {max}</span>
}

const eyebrow = { textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: C.gold, textTransform: 'uppercase', margin: '0 0 10px' }
const bigTitle = { textAlign: 'center', fontFamily: C.serif, fontWeight: 600, color: C.title, fontSize: 34, lineHeight: 1.1, margin: '0 0 12px' }
const lede = { textAlign: 'center', color: C.sub, fontSize: 15.5, lineHeight: 1.5, maxWidth: 460, margin: '0 auto 24px' }
const card = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 22, padding: '26px 22px' }
const field = { marginBottom: 24 }
const flabel = { fontSize: 14, fontWeight: 700, color: C.ink, margin: '0 0 6px' }
const fhint = { fontSize: 13.5, color: C.sub, margin: '0 0 10px' }
const input = { width: '100%', fontFamily: C.sans, fontSize: 15.5, color: C.ink, background: '#FCFBF8', border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 15px', outline: 'none', boxSizing: 'border-box' }
const btnGreen = { width: '100%', marginTop: 4, background: C.green, color: '#fff', border: 'none', borderRadius: 13, padding: '16px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: C.sans }
