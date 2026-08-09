import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { fetchEventById } from '../lib/events'
import { GOAL_OPTIONS, fetchEventGoals, saveEventGoals } from '../lib/eventPrep'
import { fetchMyMarketplacePosts, createMarketplacePost, updateMarketplacePost, deleteMarketplacePost } from '../lib/marketplace'
import { rewriteText } from '../lib/aiRewrite'

const C = {
  ground:'#FFFFFF', ivory:'#FBF8F3', ink:'#1A1712', ink2:'#5F584D', ink3:'#9A958B',
  line:'#ECE7DE', gold:'#A6822A', goldInk:'#7A5E17', goldBtn:'#C9A33B', goldBtnInk:'#2E2405',
  goldSoft:'#F8F3E5', goldLine:'#E8D9A7', slate:'#4B5A8A', sage:'#2F7A55',
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
  const [promoteHome, setPromoteHome] = useState(false)
  const [improving, setImproving] = useState(null)   // 'look' | 'offer' | null
  const [undo, setUndo] = useState(null)             // { field, prev }
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
      setPromoteHome(Boolean(need?.promote_to_discover || off?.promote_to_discover))
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
  const allowPromotion = Boolean(event?.allow_discover_promotion)

  const improve = async (field) => {
    const source = (field === 'look' ? look : offer).trim()
    if (!source || improving) return
    setImproving(field)
    const { text, error } = await rewriteText({ kind: field === 'look' ? 'event_need' : 'event_offer', text: source, maxChars: 600 })
    setImproving(null)
    if (error || !text) return
    setUndo({ field, prev: field === 'look' ? look : offer })
    ;(field === 'look' ? setLook : setOffer)(text)
  }

  const saveField = async (type, text, ex, promote) => {
    const t = text.trim()
    if (!t) { if (ex) await deleteMarketplacePost(ex.id); return }
    const payload = { title: headline(t), description: t.slice(0, 600), promoteToDiscover: promote }
    if (ex) return updateMarketplacePost(ex.id, payload)
    return createMarketplacePost({ eventId, userId, type, ...payload })
  }

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true); setErr(null)
    const promote = allowPromotion && promoteHome
    const r1 = await saveField('need',  look,  existing.need,  promote)
    const r2 = await saveField('offer', offer, existing.offer, promote)
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
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: `1.5px solid ${on ? C.goldBtn : C.line}`, background: C.ground, color: on ? C.gold : C.ink2, fontSize: 13.5, fontWeight: on ? 700 : 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                {g.label}{on && <span style={{ fontSize: 13, lineHeight: 1 }}>✓</span>}
              </button>
            )
          })}
        </div>

        {/* My event post — one combined contribution */}
        <div style={{ background: C.ground, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginTop: 20 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>My event post</p>

          <p style={{ ...fieldHead, marginTop: 14 }}>I'm looking for</p>
          <div style={{ position: 'relative' }}>
            <textarea value={look} onChange={e => setLook(e.target.value.slice(0, MAX))} rows={3} maxLength={MAX}
              placeholder="e.g. Introductions to AI infrastructure founders or operators." style={input} />
            <span style={counterStyle}>{look.length}/{MAX}</span>
          </div>
          <AiRow field="look" value={look} improving={improving} undo={undo} onImprove={improve} onUndo={() => { setLook(undo.prev); setUndo(null) }} />

          <p style={{ ...fieldHead, marginTop: 16 }}>I can offer</p>
          <div style={{ position: 'relative' }}>
            <textarea value={offer} onChange={e => setOffer(e.target.value.slice(0, MAX))} rows={3} maxLength={MAX}
              placeholder="e.g. VC interview coaching and fundraising feedback." style={input} />
            <span style={counterStyle}>{offer.length}/{MAX}</span>
          </div>
          <AiRow field="offer" value={offer} improving={improving} undo={undo} onImprove={improve} onUndo={() => { setOffer(undo.prev); setUndo(null) }} />

          <p style={{ margin: '14px 0 0', fontSize: 11.5, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>Fill in one or both. Shown on the Event Board; names stay hidden until someone connects.</p>
        </div>

        {/* Optionally surface this post on the Mutu home page (Discover) —
            only when the host has turned on home-page promotion. */}
        {allowPromotion && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={promoteHome} onChange={e => setPromoteHome(e.target.checked)}
              style={{ marginTop: 2, width: 18, height: 18, accentColor: C.gold, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
              <b style={{ fontWeight: 600 }}>Show this post on the home page</b>
              <br />
              <span style={{ fontSize: 12, color: C.ink3 }}>Appears as an anonymous preview in Discover to bring more people to this event. Your name stays hidden until someone connects.</span>
            </span>
          </label>
        )}

        {err && <p style={{ margin: '12px 2px 0', fontSize: 12.5, color: '#B4453A', fontFamily: 'Inter, system-ui, sans-serif' }}>{err}</p>}

        <button type="button" onClick={save} disabled={!canSave || saving}
          style={{ width: '100%', marginTop: 18, padding: '15px', borderRadius: 14, border: 'none', cursor: canSave && !saving ? 'pointer' : 'default', background: canSave ? '#C39A2B' : '#E5E1D8', color: canSave ? '#FFFFFF' : '#9B9384', fontSize: 15, fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif', boxShadow: canSave ? '0 2px 8px rgba(195,154,43,0.22)' : 'none' }}>
          {saving ? 'Saving…' : 'Save event post'}
        </button>
        <button type="button" onClick={onBack} style={{ width: '100%', marginTop: 8, padding: '11px', borderRadius: 12, background: 'transparent', border: 'none', color: C.ink2, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Not now
        </button>
      </motion.div>
    </div>
  )
}

// "Increase My Response Rate" — the same prominent AI rewrite the Post composer
// uses (a gold pill + sparkle + explicit "AI" badge), so testers recognise it
// as an AI feature.
function AiRow({ field, value, improving, undo, onImprove, onUndo }) {
  const busy = improving === field
  const can = value.trim() && !improving
  const showUndo = undo?.field === field
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap', minHeight: 22 }}>
      <button type="button" onClick={() => onImprove(field)} disabled={!can}
        className="inline-flex items-center gap-2 transition-all duration-150 active:scale-[0.98]"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 999,
          background: can ? C.goldSoft : '#F3F4F6',
          border: `1.5px solid ${can ? C.goldLine : C.line}`,
          cursor: can ? 'pointer' : 'default',
          color: can ? C.gold : '#B8B0A2',
          fontSize: 12.5, fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: can ? '0 2px 8px rgba(201,163,59,0.18)' : 'none',
        }}
        title="Let AI rewrite this to get more replies">
        {busy ? (
          <><span className="inline-block animate-spin" style={{ width: 13, height: 13, border: `1.5px solid ${C.goldLine}`, borderTopColor: C.goldInk, borderRadius: '50%' }} /> Improving with AI…</>
        ) : (
          <>
            <span style={{ fontSize: 14, lineHeight: 1 }}>✨</span>
            Increase My Response Rate
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: '#fff', background: can ? C.gold : '#B8B0A2', borderRadius: 5, padding: '2px 5px' }}>AI</span>
          </>
        )}
      </button>
      {showUndo && (
        <span style={{ fontSize: 11, color: C.ink2, fontFamily: 'Inter, system-ui, sans-serif' }}>
          ✓ Clearer ·{' '}
          <button type="button" onClick={onUndo} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.gold, fontWeight: 700, fontSize: 11 }}>Undo</button>
        </span>
      )}
    </div>
  )
}

const MAX = 150
const label = { fontSize: 16, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif', margin: '0 1px 12px' }
const fieldHead = { fontSize: 13, fontWeight: 600, color: C.ink, margin: '0 0 7px', fontFamily: 'Inter, system-ui, sans-serif' }
const input = { width: '100%', background: C.ground, border: `1px solid ${C.line}`, borderRadius: 11, padding: '11px 12px 24px', fontSize: 13.5, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', resize: 'none', lineHeight: 1.45 }
const counterStyle = { position: 'absolute', right: 12, bottom: 9, fontSize: 11, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif', pointerEvents: 'none' }
