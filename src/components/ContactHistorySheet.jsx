import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fetchPersonHistory, completeFollowup, dismissFollowup, addFollowup } from '../lib/eventMemory'

const C = {
  bg: '#F9F7F4', card: '#FFFFFF', ink: '#25231E', sub: '#6E675B', muted: '#9C9284',
  gold: '#B08D57', goldDeep: '#977540', goldSoft: '#F4EEE3', goldLine: '#E7D9C2',
  sage: '#5F7D63', sageBg: '#EAF0E4', border: '#ECE6DB', danger: '#B4553D', slate: '#5B6472', slateBg: '#EEF1F4',
}
const GRADS = [['#B49A78','#8C7050'],['#8FA6A0','#5F7D75'],['#B58C8C','#8A5E5E'],['#9AA488','#6F7E5A'],['#A896B0','#7C6A88']]
function initials(n){ const p=String(n||'').trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0]||'')+(p[1]?.[0]||'')).toUpperCase()||'·' }
function gradFor(s){ s=String(s||''); let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return GRADS[h%GRADS.length] }
function fmtDate(iso){ return iso ? new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '' }

/**
 * Unified contact history — a person's chronological relationship record:
 * when/where first met, events, topics, private notes, and follow-up
 * lifecycle (pending / completed / dismissed). Private notes are the user's
 * own (RLS). The event name opens that event's Recap.
 */
export default function ContactHistorySheet({ open, person, userId, onOpenEventRecap, onChanged, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [adding, setAdding] = useState(null)   // encounter id being given a follow-up
  const [addText, setAddText] = useState('')
  const [addDue, setAddDue] = useState('')

  const load = useCallback(async () => {
    if (!open || !person || !userId) return
    setLoading(true)
    const { data } = await fetchPersonHistory(userId, {
      encounteredUserId: person.encountered_user_id || null,
      personName: person.encountered_user_id ? null : (person.person_name || person.display_name),
    })
    setRows(data || [])
    setLoading(false)
  }, [open, person, userId])

  useEffect(() => { load() }, [load])

  if (!open || !person) return null

  const name = person.display_name || person.person_name || 'Someone'
  const sub = [person.program, rows[0]?.event_title ? `met at ${rows[0].event_title}` : null].filter(Boolean).join(' · ')
  const [a, b] = gradFor(name)

  const act = async (fn, id) => { setBusyId(id); await fn(id); setBusyId(null); await load(); onChanged?.() }
  const saveAdd = async (id) => {
    if (!addText.trim()) return
    setBusyId(id)
    await addFollowup(id, { nextAction: addText, dueAt: addDue ? new Date(`${addDue}T09:00:00`).toISOString() : null })
    setBusyId(null); setAdding(null); setAddText(''); setAddDue('')
    await load(); onChanged?.()
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: C.bg, borderRadius: '24px 24px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '4px 22px 16px', flexShrink: 0 }}>
          {person.avatar_url
            ? <img src={person.avatar_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} />
            : <span style={{ width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 18, background: `linear-gradient(135deg, ${a}, ${b})` }}>{initials(name)}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }}>{name}</h2>
            {sub && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>{sub}</p>}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Timeline */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px calc(20px + env(safe-area-inset-bottom))' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: C.muted, fontSize: 14, padding: '30px 0' }}>Loading…</p>
          ) : rows.length === 0 ? (
            <p style={{ textAlign: 'center', color: C.muted, fontSize: 14, padding: '30px 0' }}>No history yet.</p>
          ) : rows.map(r => {
            const state = r.followed_up_at ? 'completed' : r.followup_dismissed_at ? 'dismissed' : r.next_action ? 'pending' : 'none'
            return (
              <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 15, marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {fmtDate(r.event_start_at || r.created_at)}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 14.5, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Met at{' '}
                  {r.event_id
                    ? <button type="button" onClick={() => onOpenEventRecap?.(r.event_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.goldDeep, fontWeight: 700, fontSize: 14.5, textDecoration: 'underline', fontFamily: 'inherit' }}>{r.event_title || 'an event'}</button>
                    : <b>{r.event_title || 'an event'}</b>}
                </p>
                {r.topics?.length > 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}><b style={{ color: C.ink }}>Discussed:</b> {r.topics.join(', ')}</p>
                )}
                {r.private_note && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif', background: C.goldSoft, border: `1px solid ${C.goldLine}`, borderRadius: 10, padding: '8px 11px' }}><b style={{ color: C.goldDeep }}>Private note:</b> {r.private_note}</p>
                )}
                {r.commitment && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}><b style={{ color: C.ink }}>You promised:</b> {r.commitment}</p>
                )}

                {/* Follow-up lifecycle */}
                <div style={{ marginTop: 12 }}>
                  {state === 'completed' && <Chip label="✓ Follow-up completed" cls={{ color: C.sage, background: C.sageBg }} />}
                  {state === 'dismissed' && <Chip label="Follow-up dismissed" cls={{ color: C.slate, background: C.slateBg }} />}
                  {state === 'pending' && (
                    <div>
                      <p style={{ margin: '0 0 8px', fontSize: 13, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}><b>Next:</b> {r.next_action}{r.due_at ? ` · due ${fmtDate(r.due_at)}` : ''}</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" disabled={busyId === r.id} onClick={() => act(completeFollowup, r.id)} style={btnPrimary}>Complete</button>
                        <button type="button" disabled={busyId === r.id} onClick={() => act(dismissFollowup, r.id)} style={btnGhost}>Dismiss</button>
                      </div>
                    </div>
                  )}
                  {state === 'none' && (
                    adding === r.id ? (
                      <div>
                        <input value={addText} onChange={e => setAddText(e.target.value)} placeholder="Follow-up — e.g. Send the intro" style={inp} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <input type="date" value={addDue} min={new Date().toISOString().slice(0,10)} onChange={e => setAddDue(e.target.value)} style={{ ...inp, flex: 1 }} />
                          <button type="button" disabled={!addText.trim() || busyId === r.id} onClick={() => saveAdd(r.id)} style={btnPrimary}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setAdding(r.id); setAddText(''); setAddDue('') }} style={btnGhost}>+ Add follow-up</button>
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}

function Chip({ label, cls }) {
  return <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 99, ...cls, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</span>
}
const btnPrimary = { padding: '9px 16px', borderRadius: 11, border: 'none', background: `linear-gradient(180deg, #B08D57, #977540)`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }
const btnGhost = { padding: '9px 16px', borderRadius: 11, background: '#FFFFFF', border: `1.5px solid #ECE6DB`, color: '#25231E', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }
const inp = { width: '100%', padding: '10px 12px', borderRadius: 11, border: `1.5px solid #ECE6DB`, background: '#fff', fontSize: 14, color: '#25231E', fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', boxSizing: 'border-box' }
