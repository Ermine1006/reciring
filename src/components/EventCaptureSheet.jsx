import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createEncounter, updateEncounter } from '../lib/eventMemory'
import { extractCapture } from '../lib/eventMemory'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#14110C', sub: '#6B6152', muted: '#9C9789', white: '#FFFFFF', border: '#E5E7EB', danger: '#DC2626',
}

// Best-effort: turn a suggested phrase ("Tomorrow", "This week") into a date.
function phraseToDate(phrase) {
  const p = String(phrase || '').toLowerCase()
  const d = new Date()
  if (p.includes('today')) {}
  else if (p.includes('tomorrow')) d.setDate(d.getDate() + 1)
  else if (p.includes('next week')) d.setDate(d.getDate() + 7)
  else if (p.includes('this week') || p.includes('few days')) d.setDate(d.getDate() + 4)
  else if (p.includes('month')) d.setDate(d.getDate() + 30)
  else return ''
  return d.toISOString().slice(0, 10)
}

/**
 * Capture a person you met. Two modes:
 *  - 'ai'     → "Tell Mutu what happened": free text → AI structured draft → confirm.
 *  - 'manual' → "Add person I met": a blank form.
 * Either way the user reviews/edits before saving (createEncounter).
 * Also edits an existing encounter when `initial` is passed.
 */
export default function EventCaptureSheet({ open, mode = 'manual', initial = null, events = [], defaultEventId = null, userId, onSaved, onClose }) {
  const isEdit = Boolean(initial)
  const [phase, setPhase] = useState('form')       // 'input' (ai) | 'form'
  const [raw, setRaw] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState(null)

  const [personName, setPersonName] = useState('')
  const [eventId, setEventId] = useState(defaultEventId || '')
  const [topicsText, setTopicsText] = useState('')
  const [note, setNote] = useState('')
  const [commitment, setCommitment] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)

  useEffect(() => {
    if (!open) return
    setAiErr(null); setSaveErr(null); setRaw('')
    setPhase(mode === 'ai' && !isEdit ? 'input' : 'form')
    setPersonName(initial?.person_name || initial?.display_name || '')
    setEventId(initial?.event_id || defaultEventId || '')
    setTopicsText((initial?.topics || []).join(', '))
    setNote(initial?.private_note || '')
    setCommitment(initial?.commitment || '')
    setNextAction(initial?.next_action || '')
    setDueOn(initial?.due_at ? new Date(initial.due_at).toISOString().slice(0, 10) : '')
  }, [open, mode, initial, defaultEventId, isEdit])

  if (!open) return null

  const eventTitle = events.find(e => e.id === eventId)?.title

  const runExtract = async () => {
    if (!raw.trim() || aiBusy) return
    setAiBusy(true); setAiErr(null)
    const { capture, error } = await extractCapture(raw, { eventTitle })
    setAiBusy(false)
    if (error || !capture) { setAiErr(error?.message || 'Could not read that — try adding a bit more detail.'); return }
    setPersonName(capture.person || '')
    setNote([capture.context, capture.need ? `Looking for: ${capture.need}` : ''].filter(Boolean).join('\n'))
    setCommitment(capture.commitment || '')
    setNextAction(capture.next_action || '')
    setDueOn(phraseToDate(capture.due))
    setPhase('form')
  }

  const save = async () => {
    if (!personName.trim() || saving) return
    setSaving(true); setSaveErr(null)
    const topics = topicsText.split(',').map(s => s.trim()).filter(Boolean)
    const dueAt = dueOn ? new Date(`${dueOn}T09:00:00`).toISOString() : null
    const payload = { person_name: personName.trim(), event_id: eventId || null, topics, private_note: note, commitment, next_action: nextAction, due_at: dueAt }
    const { error } = isEdit
      ? await updateEncounter(initial.id, payload)
      : await createEncounter({ userId, eventId, personName, topics, privateNote: note, commitment, nextAction, dueAt })
    setSaving(false)
    if (error) { setSaveErr(error.message || 'Could not save'); return }
    onSaved?.()
    onClose?.()
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: '#F9F7F4', borderRadius: '24px 24px 0 0', padding: '10px 22px calc(20px + env(safe-area-inset-bottom))', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>

        {phase === 'input' ? (
          <>
            <p style={eyebrow}>✨ Tell Mutu what happened</p>
            <h2 style={title}>Just describe it</h2>
            <p style={{ ...help, marginBottom: 12 }}>Write naturally — who you met, what they need, what you promised. Mutu drafts a follow-up you can edit before saving.</p>
            <textarea
              value={raw}
              onChange={e => setRaw(e.target.value.slice(0, 1000))}
              rows={5}
              placeholder="I met Sarah at the event. She's building a health-tech startup and looking for a technical co-founder. I promised to introduce her to David."
              style={{ ...input, resize: 'vertical', minHeight: 120 }}
            />
            {aiErr && <p style={errStyle}>{aiErr}</p>}
            <button type="button" onClick={runExtract} disabled={!raw.trim() || aiBusy} style={primary(!raw.trim() || aiBusy)}>
              {aiBusy ? 'Reading…' : 'Draft with Mutu'}
            </button>
            <button type="button" onClick={() => setPhase('form')} style={ghost}>Enter manually instead</button>
          </>
        ) : (
          <>
            <p style={eyebrow}>{isEdit ? 'Edit' : mode === 'ai' ? '✨ Review draft' : 'Add person I met'}</p>
            <h2 style={title}>{isEdit ? personName || 'Encounter' : mode === 'ai' ? 'Confirm before saving' : 'Who did you meet?'}</h2>
            {mode === 'ai' && !isEdit && <p style={{ ...help, marginBottom: 12 }}>Mutu filled this in from your note — tweak anything, then save.</p>}

            <label style={label}>Name <span style={{ color: C.danger }}>*</span></label>
            <input value={personName} onChange={e => setPersonName(e.target.value)} placeholder="e.g. Sarah Chen" style={input} />

            {events.length > 0 && (
              <>
                <label style={{ ...label, marginTop: 12 }}>Event</label>
                <select value={eventId} onChange={e => setEventId(e.target.value)} style={input}>
                  <option value="">— Not tied to an event —</option>
                  {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </>
            )}

            <label style={{ ...label, marginTop: 12 }}>Topics <span style={{ color: C.sub, fontWeight: 400 }}>· comma-separated</span></label>
            <input value={topicsText} onChange={e => setTopicsText(e.target.value)} placeholder="health-tech, hiring, fundraising" style={input} />

            <label style={{ ...label, marginTop: 12 }}>Private note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Only you can see this." style={{ ...input, resize: 'vertical', minHeight: 56 }} />

            <label style={{ ...label, marginTop: 12 }}>My commitment</label>
            <input value={commitment} onChange={e => setCommitment(e.target.value)} placeholder="What you promised — e.g. Introduce her to David" style={input} />

            <label style={{ ...label, marginTop: 12 }}>Next action</label>
            <input value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Your next action — e.g. Send the intro" style={input} />

            <label style={{ ...label, marginTop: 12 }}>Due</label>
            <input type="date" value={dueOn} min={new Date().toISOString().slice(0, 10)} onChange={e => setDueOn(e.target.value)} style={input} />

            {saveErr && <p style={errStyle}>{saveErr}</p>}
            <button type="button" onClick={save} disabled={!personName.trim() || saving} style={primary(!personName.trim() || saving)}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save to my network'}
            </button>
            <button type="button" onClick={onClose} style={ghost}>Cancel</button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

const eyebrow = { margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif' }
const title = { margin: '4px 0 14px', fontSize: 20, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }
const help = { margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }
const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4B4437', margin: '0 0 6px', fontFamily: 'Inter, system-ui, sans-serif' }
const input = { width: '100%', padding: '11px 13px', borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 14.5, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' }
const errStyle = { margin: '12px 0 0', fontSize: 13, color: C.danger }
const ghost = { width: '100%', marginTop: 8, padding: '12px', borderRadius: 14, background: 'transparent', border: 'none', color: C.sub, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }
function primary(disabled) {
  return { width: '100%', marginTop: 16, padding: '15px', borderRadius: 14, border: 'none', background: disabled ? '#E5E1D8' : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: disabled ? '#9B9384' : '#fff', fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }
}
