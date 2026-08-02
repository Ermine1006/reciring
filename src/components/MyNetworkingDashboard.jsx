import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import AnonymousAvatar from './AnonymousAvatar'
import { categoryEmoji } from '../data/eventCategories'
import { fetchMyMatches, matchToUI, fetchPeerProfile } from '../lib/matches'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#111111', textSub: '#6B7280', textMuted: '#9CA3AF', white: '#FFFFFF',
  border: '#F0ECE4', green: '#16A34A', greenBg: '#F0FDF4',
}

const DAY = 86400000

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

/**
 * The Event CRM home — "My Networking". Answers, at a glance: my next event,
 * who I recently met, who I owe a follow-up, and what to do next.
 *
 * Phase 1 reuses existing data: registered events (props) + event-based
 * matches (marketplace connections). Follow-ups get their own store in a later
 * phase; for now the section shows a calm empty state.
 */
export default function MyNetworkingDashboard({ userId, events = [], joinedIds = new Set(), onOpenEvent, onOpenMatch, onAskMutu }) {
  const [met, setMet] = useState([])          // [{ matchId, name, program, eventTitle, createdAt }]
  const [loadingMet, setLoadingMet] = useState(true)

  // Registered, still-upcoming events (soonest first).
  const registered = useMemo(() => {
    const now = Date.now()
    return events
      .filter(e => joinedIds.has(e.id) && e.start_at && new Date(e.start_at).getTime() > now && e.status !== 'cancelled')
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  }, [events, joinedIds])

  const nextEvent = registered[0] || null
  const eventsThisWeek = useMemo(() => {
    const now = Date.now()
    return registered.filter(e => new Date(e.start_at).getTime() <= now + 7 * DAY).length
  }, [registered])

  // People met = accepted event connections (marketplace matches).
  useEffect(() => {
    let alive = true
    if (!userId) { setMet([]); setLoadingMet(false); return }
    ;(async () => {
      const { data } = await fetchMyMatches(userId)
      if (!alive) return
      const eventMatches = (data || [])
        .map(r => matchToUI(r, userId))
        .filter(m => m.isMarketplace && m.status !== 'unmatched')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6)
      // Names are revealed for accepted connections — fetch them.
      const withNames = await Promise.all(eventMatches.map(async m => {
        const { data: p } = await fetchPeerProfile(m.peerId).catch(() => ({ data: null }))
        return {
          matchId:    m.id,
          name:       firstName(p?.name) || 'Peer',
          program:    p?.program || null,
          eventTitle: m.eventTitle || 'an event',
          createdAt:  m.createdAt,
        }
      }))
      if (alive) { setMet(withNames); setLoadingMet(false) }
    })()
    return () => { alive = false }
  }, [userId])

  const followups = []  // Phase 4 store — empty for now.

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      {/* ── A. This week ─────────────────────────────── */}
      <p style={sectionLabel}>This week</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <StatCard icon="📅" n={registered.length} label="Events" />
        <StatCard icon="🤝" n={met.length} label="People met" />
        <StatCard icon="✅" n={followups.length} label="Follow-ups" />
      </div>

      {/* ── B. Next event ────────────────────────────── */}
      <p style={sectionLabel}>Next event</p>
      {nextEvent ? (
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          {nextEvent.image_url ? (
            <div style={{ width: '100%', aspectRatio: '16 / 7', overflow: 'hidden', background: C.goldBg }}>
              <img src={nextEvent.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          ) : (
            <div style={{ height: 6, background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight} 60%, transparent)` }} />
          )}
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            {!nextEvent.image_url && (
              <div style={{ fontSize: 34, lineHeight: 1 }}>{categoryEmoji(nextEvent.category)}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.25 }}>
                {nextEvent.title}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {fmtWhen(nextEvent.start_at)}{nextEvent.location ? ` · ${nextEvent.location}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => onOpenEvent?.(nextEvent.id)} style={prepareBtn}>
              Prepare
            </button>
          </div>
        </div>
      ) : (
        <div style={{ ...card, marginBottom: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
            No upcoming events yet. Register from <strong style={{ color: C.goldDark }}>Discover</strong> to start preparing.
          </p>
        </div>
      )}

      {/* ── C. Follow-ups ────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <p style={sectionLabel}>Follow-ups</p>
        {followups.length > 0 && <span style={viewAll}>View all</span>}
      </div>
      {followups.length === 0 ? (
        <div style={{ ...card, marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Follow-ups show up here after you meet people at an event. You'll be able to log who you met and what you promised.
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>{/* Phase 4: follow-up rows */}</div>
      )}

      {/* ── D. Recently met ──────────────────────────── */}
      <p style={sectionLabel}>Recently met</p>
      {loadingMet ? (
        <div style={{ ...card, marginBottom: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: C.textMuted }}>Loading…</p>
        </div>
      ) : met.length === 0 ? (
        <div style={{ ...card, marginBottom: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            People you connect with at events will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {met.map(m => (
            <button
              key={m.matchId}
              type="button"
              onClick={() => onOpenMatch?.(m.matchId)}
              style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', border: `1px solid ${C.border}` }}
            >
              <AnonymousAvatar seed={m.matchId} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{m.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {[m.program, `met at ${m.eventTitle}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>Chat →</span>
            </button>
          ))}
        </div>
      )}

      {/* ── E. Ask Mutu ──────────────────────────────── */}
      <button type="button" onClick={onAskMutu} style={askMutu}>
        <span style={{ fontSize: 18 }}>✨</span>
        <span style={{ flex: 1, textAlign: 'left' }}>Tell Mutu what happened at your event…</span>
      </button>
    </motion.div>
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
const viewAll = { fontSize: 12, fontWeight: 600, color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer' }
const prepareBtn = { flexShrink: 0, padding: '10px 18px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(200,169,106,0.3)', fontFamily: 'Inter, system-ui, sans-serif' }
const askMutu = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '15px 16px', borderRadius: 16, background: C.goldBg, border: `1.5px solid ${C.goldLight}`, color: C.goldDark, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }
