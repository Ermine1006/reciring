import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { fetchEventById } from '../lib/events'
import { GOAL_OPTIONS, fetchEventGoals, saveEventGoals } from '../lib/eventPrep'
import { fetchMyMarketplacePosts, createMarketplacePost, updateMarketplacePost, deleteMarketplacePost } from '../lib/marketplace'

const C = {
  ground:'#FFFFFF', ivory:'#FBF8F3', ink:'#1A1712', ink2:'#5F584D', ink3:'#9A958B',
  line:'#ECE7DE', gold:'#A67C33', goldInk:'#7A5A22', goldBtn:'#C6A25A', goldBtnInk:'#241B0C',
  goldSoft:'#FBF6EC', goldLine:'#EBDBAE', slate:'#4B5A8A', sage:'#2F7A55',
}

function fmtWhen(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const headline = (t) => String(t || '').trim().split('\n')[0].slice(0, 120)

/**
 * Prepare for event — a focused page: set a private goal, then write ONE
 * combined Event Post (looking-for + can-offer). It no longer shows other
 * attendees / the Board / host stats. Saving writes the two marketplace
 * rows (need/offer) that the Board groups into one card.
 */
export default function EventPreparePage({ eventId, userId, onBack, onSaved }) {
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState([])
  const [look, setLook] = useState('')
  const [offer, setOffer] = useState('')
  const [existing, setExisting] = useState({ need: null, offer: null })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: ev }, { goals: g }, { data: posts }] = await Promise.all([
        fetchEventById(eventId),
        fetchEventGoals(eventId, userId),
        fetchMyMarketplacePosts(eventId, userId),
      ])
      if (!alive) return
      setEvent(ev); setGoals(g)
      const need = (posts || []).find(p => p.type === 'need') || null
      const off  = (posts || []).find(p => p.type === 'offer') || null
      setExisting({ need, offer: off })
      setLook(need?.description || need?.title || '')
      setOffer(off?.description || off?.title || '')
      setLoading(false)
    })()
    return () => { alive = false }
  }, [eventId, userId])

  const toggleGoal = async (id) => {
    const next = goals.includes(id) ? goals.filter(g => g !== id) : [...goals, id]
    setGoals(next)
    saveEventGoals(eventId, userId, next)
  }

  const canSave = look.trim() || offer.trim()

  const saveField = async (type, text, ex) => {
    const t = text.trim()
    if (!t) { if (ex) await deleteMarketplacePost(ex.id); return }
    const payload = { title: headline(t), description: t.slice(0, 600) }
    if (ex) return updateMarketplacePost(ex.id, payload)
    return createMarketplacePost({ eventId, userId, type, ...payload })
  }

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true); setErr(null)
    const r1 = await saveField('need',  look,  existing.need)
    const r2 = await saveField('offer', offer, existing.offer)
    setSaving(false)
    const e = r1?.error || r2?.error
    if (e) { setErr(e.message || 'Could not save your event post'); return }
    if (onSaved) onSaved(); else onBack?.()
  }

  if (loading) {
    return <div className="flex-1 phone-scroll" style={{ background: C.ground, padding: 24, textAlign: 'center' }}>
      <p style={{ color: C.ink3, fontSize: 14, marginTop: 40 }}>Loading…</p>
    </div>
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: C.ground }}>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} style={{ padding: '12px 18px 34px', maxWidth: 560, margin: '0 auto' }}>
        {/* Compact header — no full event cover repeated here */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: C.ink, display: 'flex' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.1} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 650, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>Prepare for event</p>
            <p style={{ margin: '1px 0 0', fontSize: 11, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>{event?.title} · {fmtWhen(event?.start_at)}</p>
          </div>
          <span style={{ width: 20 }} />
        </div>

        {/* My goal */}
        <p style={label}>My goal</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {GOAL_OPTIONS.map(g => {
            const on = goals.includes(g.id)
            return (
              <button key={g.id} type="button" onClick={() => toggleGoal(g.id)}
                style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${on ? C.goldLine : C.line}`, background: on ? C.goldSoft : C.ground, color: on ? C.goldInk : C.ink2, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                {on ? '✓ ' : ''}{g.label}
              </button>
            )
          })}
        </div>

        {/* My event post — one combined contribution */}
        <div style={{ background: C.ivory, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginTop: 20 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>My event post</p>
          <p style={{ ...fieldLabel, color: C.slate, marginTop: 12 }}>I'm looking for</p>
          <textarea value={look} onChange={e => setLook(e.target.value.slice(0, 600))} rows={3}
            placeholder="e.g. Introductions to AI infrastructure founders or operators." style={input} />
          <p style={{ ...fieldLabel, color: C.sage, marginTop: 12 }}>I can offer</p>
          <textarea value={offer} onChange={e => setOffer(e.target.value.slice(0, 600))} rows={3}
            placeholder="e.g. VC interview coaching and fundraising feedback." style={input} />
          <p style={{ margin: '9px 0 0', fontSize: 11.5, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>Fill in one or both. Shown on the Event Board; names stay hidden until someone connects.</p>
        </div>

        {err && <p style={{ margin: '12px 2px 0', fontSize: 12.5, color: '#B4453A', fontFamily: 'Inter, system-ui, sans-serif' }}>{err}</p>}

        <button type="button" onClick={save} disabled={!canSave || saving}
          style={{ width: '100%', marginTop: 18, padding: '13px', borderRadius: 12, border: 'none', cursor: canSave && !saving ? 'pointer' : 'default', background: canSave ? C.goldBtn : '#E5E1D8', color: canSave ? C.goldBtnInk : '#9B9384', fontSize: 14, fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {saving ? 'Saving…' : 'Save event post'}
        </button>
        <button type="button" onClick={onBack} style={{ width: '100%', marginTop: 8, padding: '11px', borderRadius: 12, background: 'transparent', border: 'none', color: C.ink2, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Not now
        </button>
      </motion.div>
    </div>
  )
}

const label = { fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif', margin: '0 1px 8px' }
const fieldLabel = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', margin: '0 0 6px', fontFamily: 'Inter, system-ui, sans-serif' }
const input = { width: '100%', background: C.ground, border: `1px solid ${C.line}`, borderRadius: 11, padding: '11px 12px', fontSize: 13.5, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', resize: 'vertical', lineHeight: 1.45 }
