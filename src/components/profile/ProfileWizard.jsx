import { useState } from 'react'
import { C } from './theme'
import { TagSelect } from './TagSelect'
import {
  TOPICS, INDUSTRIES, INTEREST_GROUPS, ACTIVITIES, HELPING_PREFS,
  PROGRAMS, GRAD_YEAR_MIN,
} from '../../data/profileTaxonomy'

// ── Build your profile — the 4-step capture wizard (redesign) ──────────────
// Controlled by `value` + `onChange` (the parent owns the draft and autosaves).
// `onFinish` fires after step 4. This component is presentational + stateful
// for step navigation only; persistence is the parent's job so it can reuse
// the same wizard for onboarding and Edit-Profile.
//
// value shape (all optional):
//   { program, graduationYear, title, company, professionalHeadline,
//     industriesKnown[], industriesExploring[],
//     expertiseOffered[], helpWanted[], promptAskMe,
//     interests[], activities[], promptWeekend, promptSeeking,
//     helpingPreferences[] }
export default function ProfileWizard({ value = {}, onChange, onFinish, onBack }) {
  const [step, setStep] = useState(0)
  const v = value
  const set = (patch) => onChange({ ...v, ...patch })
  const arr = (k) => Array.isArray(v[k]) ? v[k] : []

  const STEPS = ['Professional', 'Exchange', 'Beyond work', 'Preferences']
  const years = Array.from({ length: 9 }, (_, i) => GRAD_YEAR_MIN + i + 2) // 2022…2030-ish window

  const next = () => step < 3 ? setStep(step + 1) : onFinish?.()
  const back = () => step > 0 ? setStep(step - 1) : onBack?.()

  return (
    <div style={{ background: C.page, minHeight: '100%', fontFamily: C.sans }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 18px 60px' }}>
        <p style={eyebrow}>Profile redesign</p>
        <h1 style={bigTitle}>Build your profile</h1>
        <p style={lede}>Professional value gets you introduced. Personal interests make the connection feel human.</p>

        <Stepper step={step} steps={STEPS} onJump={setStep} />

        <div style={card}>
          <p style={stepno}>Step {step + 1} of 4</p>

          {step === 0 && (<>
            <h2 style={cardTitle}>Professional snapshot</h2>
            <p style={cardSub}>Help people understand your experience — without turning your profile into a résumé.</p>
            <div style={rule} />
            <Field label="Program">
              <Select value={v.program || ''} onChange={x => set({ program: x })}
                options={[{ v: '', l: 'Select…' }, ...PROGRAMS.map(p => ({ v: p.label, l: p.label }))]} />
            </Field>
            <Field label="Graduation year">
              <Select value={v.graduationYear || ''} onChange={x => set({ graduationYear: x ? +x : null })}
                options={[{ v: '', l: 'Select…' }, ...years.map(y => ({ v: y, l: String(y) }))]} />
            </Field>
            <Field label="Current role / title">
              <Input value={v.title || ''} onChange={x => set({ title: x.slice(0, 80) })} placeholder="e.g. Founder" />
            </Field>
            <Field label="Company / organization">
              <Input value={v.company || ''} onChange={x => set({ company: x.slice(0, 80) })} placeholder="e.g. Mutu" />
            </Field>
            <Field label="Professional headline" hint="One line that connects your past experience with what you are doing now."
              count={`${(v.professionalHeadline || '').length} / 120`}>
              <textarea rows={2} value={v.professionalHeadline || ''} onChange={e => set({ professionalHeadline: e.target.value.slice(0, 120) })}
                placeholder="e.g. MBA '27 · Former PE investor · Building an AI networking startup" style={input} />
            </Field>
            <Field label="Industries I know" hint="Where do you have meaningful experience or knowledge?"
              count={`${arr('industriesKnown').length} / 3`}>
              <TagSelect options={INDUSTRIES} value={arr('industriesKnown')} onChange={x => set({ industriesKnown: x })} max={3} placeholder="Select industries or type your own…" />
            </Field>
            <Field label="Industries I'm exploring" hint="Where would you like to learn, contribute or build next?"
              count={`${arr('industriesExploring').length} / 3`}>
              <TagSelect options={INDUSTRIES} value={arr('industriesExploring')} onChange={x => set({ industriesExploring: x })} max={3} placeholder="Select industries or type your own…" />
            </Field>
          </>)}

          {step === 1 && (<>
            <h2 style={cardTitle}>Knowledge exchange</h2>
            <p style={cardSub}>Show what someone can genuinely ask you about, and where another person could help you.</p>
            <div style={rule} />
            <Callout icon="↔" title="Mutu matches directionally.">
              Your expertise can meet someone else's goal — and their expertise can meet yours.
            </Callout>
            <Field label="What I can help with" hint="What can someone genuinely come to you for?"
              count={`${arr('expertiseOffered').length} / 5`}>
              <TagSelect options={TOPICS} value={arr('expertiseOffered')} onChange={x => set({ expertiseOffered: x })} max={5} placeholder="Select topics or type your own…" />
            </Field>
            <Field label="What I'd like help with" hint="What are you currently trying to learn, solve or explore?"
              count={`${arr('helpWanted').length} / 5`}>
              <TagSelect options={TOPICS} value={arr('helpWanted')} onChange={x => set({ helpWanted: x })} max={5} placeholder="Select topics or type your own…" />
            </Field>
            <Field label="Ask me about…" hint="A memorable conversation starter — specific is better.">
              <Input value={v.promptAskMe || ''} onChange={x => set({ promptAskMe: x.slice(0, 240) })} placeholder="e.g. Building Mutu from 0 to 1" />
            </Field>
          </>)}

          {step === 2 && (<>
            <h2 style={cardTitle}>Life beyond work</h2>
            <p style={cardSub}>Shared interests create the personal spark that makes professional connections easier to start.</p>
            <div style={rule} />
            <Field label="Interests outside work" hint="What would you genuinely enjoy connecting over?"
              count={`${arr('interests').length} / 5`}>
              <TagSelect grouped options={INTEREST_GROUPS} value={arr('interests')} onChange={x => set({ interests: x })} max={5} placeholder="Select interests or type your own…" />
            </Field>
            <Field label="Things I'd be up for" hint="Interests are passive; this tells people what you would actually do together."
              count={`${arr('activities').length} / 5`}>
              <TagSelect options={ACTIVITIES} value={arr('activities')} onChange={x => set({ activities: x })} max={5} placeholder="Select activities or type your own…" />
            </Field>
            <Field label="Outside work, you'll usually find me…">
              <Input value={v.promptWeekend || ''} onChange={x => set({ promptWeekend: x.slice(0, 240) })} placeholder="e.g. On a volleyball court or at a comedy club" />
            </Field>
            <Field label="Something I'd love to find people for…">
              <Input value={v.promptSeeking || ''} onChange={x => set({ promptSeeking: x.slice(0, 240) })} placeholder="e.g. A weekend hiking group in Toronto" />
            </Field>
          </>)}

          {step === 3 && (<>
            <h2 style={cardTitle}>Connection preferences</h2>
            <p style={cardSub}>Set the kinds of interactions you are comfortable with. You can change these anytime.</p>
            <div style={rule} />
            <p style={{ ...flabel, marginBottom: 4 }}>How I'm open to helping</p>
            <p style={fhint}>Choose the interactions you are comfortable offering — this is separate from your expertise.</p>
            <div style={{ marginTop: 8 }}>
              <TagSelect options={HELPING_PREFS} value={arr('helpingPreferences')} onChange={x => set({ helpingPreferences: x })} placeholder="Select how you're open to helping…" />
            </div>
            <div style={privacy}>
              <span style={{ color: C.gold, fontSize: 18, flexShrink: 0 }}>◉</span>
              <div>
                <b style={{ fontSize: 14.5, color: C.ink }}>Your privacy stays in your control</b>
                <p style={{ margin: '4px 0 0', fontSize: 13.5, color: C.sub, lineHeight: 1.5 }}>
                  Professional fields help matching. Personal interests improve introductions, but never affect access or visibility.
                </p>
              </div>
            </div>
          </>)}

          <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
            <button type="button" onClick={back} style={btnGhost}>Back</button>
            <button type="button" onClick={next} style={step === 3 ? btnGreen : btnGold}>
              {step === 3 ? 'Save & preview profile →' : 'Continue →'}
            </button>
          </div>
          <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, marginTop: 16 }}>
            <span style={{ color: C.green }}>✓</span> Changes saved automatically
          </p>
        </div>
      </div>
    </div>
  )
}

// ── sub-components ──
function Stepper({ step, steps, onJump }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', margin: '0 4px 22px' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ position: 'absolute', top: 22, left: `${12 + i * 25}%`, right: `${63 - i * 25}%`, height: 2, background: i < step ? C.goldMid : C.line }} />
      ))}
      {steps.map((label, i) => {
        const active = i === step, done = i < step
        return (
          <button key={label} type="button" onClick={() => onJump(i)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, zIndex: 1, background: 'none', border: 'none', cursor: 'pointer' }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15,
              background: '#fff', border: `2px solid ${active || done ? C.goldMid : C.line}`, color: active || done ? C.gold : C.muted }}>
              {done ? '✓' : i + 1}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: active || done ? C.ink : C.muted }}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
function Field({ label, hint, count, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p style={flabel}>{label}{count && <span style={{ float: 'right', fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{count}</span>}</p>
      {hint && <p style={fhint}>{hint}</p>}
      {children}
    </div>
  )
}
function Callout({ icon, title, children }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: '#F5F1E9', border: `1px solid ${C.line}`, borderRadius: 16, padding: '16px 18px', marginBottom: 22 }}>
      <span style={{ width: 36, height: 36, borderRadius: '50%', background: C.themes.green.tile, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <div><b style={{ color: C.ink, fontSize: 15 }}>{title}</b>
        <p style={{ margin: '4px 0 0', color: C.sub, fontSize: 14, lineHeight: 1.5 }}>{children}</p></div>
    </div>
  )
}
function Input({ value, onChange, placeholder }) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={input} />
}
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...input, appearance: 'none',
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236C6559' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 15px center' }}>
      {options.map(o => <option key={String(o.v)} value={o.v}>{o.l}</option>)}
    </select>
  )
}

// ── styles ──
const eyebrow = { textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: C.gold, textTransform: 'uppercase', margin: '0 0 10px' }
const bigTitle = { textAlign: 'center', fontFamily: C.serif, fontWeight: 600, color: C.title, fontSize: 34, lineHeight: 1.1, margin: '0 0 12px' }
const lede = { textAlign: 'center', color: C.sub, fontSize: 15.5, lineHeight: 1.5, maxWidth: 440, margin: '0 auto 24px' }
const card = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 22, padding: '28px 24px' }
const stepno = { fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: C.gold, textTransform: 'uppercase', margin: '0 0 10px' }
const cardTitle = { fontFamily: C.serif, fontWeight: 600, color: C.title, fontSize: 30, lineHeight: 1.05, margin: '0 0 12px' }
const cardSub = { color: C.sub, fontSize: 15.5, lineHeight: 1.5, margin: '0 0 18px' }
const rule = { height: 1, background: C.line, margin: '22px 0' }
const flabel = { fontSize: 14, fontWeight: 700, color: C.ink, margin: '0 0 6px' }
const fhint = { fontSize: 13.5, color: C.sub, margin: '0 0 10px' }
const input = { width: '100%', fontFamily: C.sans, fontSize: 15.5, color: C.ink, background: '#FCFBF8', border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 15px', outline: 'none', boxSizing: 'border-box', resize: 'none', lineHeight: 1.5 }
const privacy = { display: 'flex', gap: 13, alignItems: 'flex-start', background: '#F5F1E9', border: `1px solid ${C.line}`, borderRadius: 16, padding: '16px 18px', marginTop: 22 }
const btnGhost = { background: '#fff', border: `1.5px solid ${C.line}`, color: C.sub, fontWeight: 700, fontSize: 15, borderRadius: 13, padding: '15px 22px', cursor: 'pointer', fontFamily: C.sans }
const btnGold = { flex: 1, background: C.goldMid, color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, borderRadius: 13, padding: '15px 22px', cursor: 'pointer', fontFamily: C.sans }
const btnGreen = { ...btnGold, background: C.green }
