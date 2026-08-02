import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import EventCover from './EventCover'
import EventCaptureSheet from './EventCaptureSheet'
import { fetchEncounters, fetchFollowups, completeFollowup } from '../lib/eventMemory'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#111111', textSub: '#6B7280', textMuted: '#9CA3AF', white: '#FFFFFF',
  border: '#F0ECE4', green: '#16A34A', greenBg: '#F0FDF4',
}
const DAY = 86400000
const AVATAR_GRADS = [['#C58BA0','#8E5468'],['#6E92B8','#3F5F82'],['#87AE8C','#537E5C'],['#C9A66B','#9B7B3E'],['#9C89AD','#6E5A80']]

function fmtWhen(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '·'
}
function gradFor(seed) {
  const s = String(seed || '')
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_GRADS[h % AVATAR_GRADS.length]
}
// Chip for a follow-up, from its due date.
function dueChip(due_at) {
  if (!due_at) return null
  const days = Math.floor((new Date(due_at).getTime() - Date.now()) / DAY)
  if (days < 0)  return { label: 'Overdue',   cls: { color: '#B42318', background: '#FEECEB' } }
  if (days === 0) return { label: 'Due today', cls: { color: '#B42318', background: '#FEECEB' } }
  if (days <= 7) return { label: 'This week', cls: { color: C.goldDark, background: C.goldBg } }
  return { label: 'Upcoming', cls: { color: '#475569', background: '#F1F4F8' } }
}

/**
 * Event CRM home — "My Networking". Reads real registered events + logged
 * encounters (Phase 4): next event, people met, open follow-ups, and capture.
 */
export default function MyNetworkingDashboard({ userId, events = [], joinedIds = new Set(), onOpenEvent, onPrepare, onAskMutu }) {
  const [encounters, setEncounters] = useState([])
  const [followups, setFollowups]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [capture, setCapture]       = useState(null)   // { mode, initial }

  const registered = useMemo(() => {
    const now = Date.now()
    return events
      .filter(e => joinedIds.has(e.id) && e.start_at && new Date(e.start_at).getTime() > now && e.status !== 'cancelled')
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  }, [events, joinedIds])

  const nextEvent = registered[0] || null
  const eventTitleById = useMemo(() => {
    const m = {}
    for (const e of events) m[e.id] = e.title
    return m
  }, [events])

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const [{ data: enc }, { data: fu }] = await Promise.all([
      fetchEncounters(userId),
      fetchFollowups(userId),
    ])
    setEncounters(enc)
    setFollowups(fu)
    setLoading(false)
  }, [userId])

  useEffect(() => { setLoading(true); load() }, [load])

  const markDone = async (id) => {
    setFollowups(prev => prev.filter(f => f.id !== id))  // optimistic
    await completeFollowup(id)
    load()
  }

  const openCapture = (mode, initial = null) => setCapture({ mode, initial })

  if (loading) {
    return <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 14, padding: '40px 0' }}>Loading…</p>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      {/* A. This week */}
      <p style={sectionLabel}>This week</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <StatCard icon="📅" n={registered.length} label="Events" />
        <StatCard icon="🤝" n={encounters.length} label="People met" />
        <StatCard icon="✅" n={followups.length} label="Follow-ups" />
      </div>

      {/* B. Next event */}
      <p style={sectionLabel}>Next event</p>
      {nextEvent ? (
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <EventCover event={nextEvent} aspectRatio="16 / 7" />
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.25 }}>{nextEvent.title}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {fmtWhen(nextEvent.start_at)}{nextEvent.location ? ` · ${nextEvent.location}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => (onPrepare || onOpenEvent)?.(nextEvent.id)} style={prepareBtn}>Prepare</button>
          </div>
        </div>
      ) : (
        <div style={{ ...card, marginBottom: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
            No upcoming events yet. Register from <strong style={{ color: C.goldDark }}>Discover</strong> to start preparing.
          </p>
        </div>
      )}

      {/* C. Follow-ups */}
      <p style={sectionLabel}>Follow-ups</p>
      {followups.length === 0 ? (
        <div style={{ ...card, marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            No open follow-ups. Log who you meet below and set a next step — it'll show up here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {followups.slice(0, 4).map(f => {
            const chip = dueChip(f.due_at)
            return (
              <div key={f.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                <Avatar name={f.person_name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{f.person_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.next_action}</p>
                </div>
                {chip && <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 99, whiteSpace: 'nowrap', ...chip.cls }}>{chip.label}</span>}
                <button type="button" onClick={() => markDone(f.id)} title="Mark done" style={doneBtn}>✓</button>
              </div>
            )
          })}
        </div>
      )}

      {/* D. Recently met */}
      <p style={sectionLabel}>Recently met</p>
      {encounters.length === 0 ? (
        <div style={{ ...card, marginBottom: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            People you log at events appear here. Tap “Add person I met” after a good conversation.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {encounters.slice(0, 6).map(e => (
            <button key={e.id} type="button" onClick={() => openCapture('manual', e)}
              style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', padding: '12px 14px' }}>
              <Avatar name={e.person_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{e.person_name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[e.event_id ? `met at ${eventTitleById[e.event_id] || 'an event'}` : 'met', (e.topics || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>Edit</span>
            </button>
          ))}
        </div>
      )}

      {/* E. Capture */}
      <p style={sectionLabel}>Capture what happened</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button type="button" onClick={() => openCapture('manual')} style={captureBtn}>
          <span style={{ fontSize: 16 }}>➕</span> Add person I met
        </button>
      </div>
      <button type="button" onClick={() => openCapture('ai')} style={askMutu}>
        <span style={{ fontSize: 18 }}>✨</span>
        <span style={{ flex: 1, textAlign: 'left' }}>Tell Mutu what happened at your event…</span>
      </button>

      <EventCaptureSheet
        open={Boolean(capture)}
        mode={capture?.mode || 'manual'}
        initial={capture?.initial || null}
        events={registered}
        defaultEventId={nextEvent?.id || null}
        userId={userId}
        onSaved={load}
        onClose={() => setCapture(null)}
      />
    </motion.div>
  )
}

function Avatar({ name }) {
  const [a, b] = gradFor(name)
  return (
    <span style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'Fraunces, Georgia, serif', fontWeight: 600, fontSize: 13, background: `linear-gradient(135deg, ${a}, ${b})`, boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.28), inset 0 -2px 3px rgba(0,0,0,0.14)' }}>
      {initials(name)}
    </span>
  )
}
function StatCard({ icon, n, label }) {
  return (
    <div style={{ ...card, flex: 1, padding: '14px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 6 }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.goldDark, fontFamily: 'Fraunces, Georgia, serif' }}>{n}</p>
      <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</p>
    </div>
  )
}

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }
const sectionLabel = { fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', margin: '0 0 10px' }
const prepareBtn = { flexShrink: 0, padding: '10px 18px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(200,169,106,0.3)', fontFamily: 'Inter, system-ui, sans-serif' }
const doneBtn = { flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.white, color: C.green, fontSize: 14, fontWeight: 800, cursor: 'pointer' }
const captureBtn = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 14, background: C.white, border: `1.5px solid ${C.goldLight}`, color: C.goldDark, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }
const askMutu = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '15px 16px', borderRadius: 16, background: C.goldBg, border: `1.5px solid ${C.goldLight}`, color: C.goldDark, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }
