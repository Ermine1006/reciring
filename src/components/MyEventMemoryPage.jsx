import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { listMyEventMemory } from '../lib/eventEncounters'
import { categoryEmoji } from '../data/eventCategories'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#4B5563',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
}

/**
 * MyEventMemoryPage — cross-event history.
 *
 * Grouped list of every event the user recorded encounters at,
 * newest first. Each row shows the per-event stats and clicking it
 * navigates to that event's detail page in Recap mode.
 *
 * Navigation: uses onOpenEvent(eventId) prop which the parent
 * (ProfilePage / AppShell) wires to the same event-detail state
 * that EventsList uses. This avoids duplicating routing state.
 */
export default function MyEventMemoryPage({ onOpenEvent }) {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    listMyEventMemory().then(({ data }) => {
      if (!mounted) return
      setRows(data || [])
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  return (
    <div style={{ background: '#F9F7F4' }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pt-5 pb-10"
      >
        <div style={{ marginBottom: 14 }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
            fontWeight: 700, color: C.gold, margin: 0,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            My Event Memory
          </p>
          <h2 style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 22, fontWeight: 600, color: C.text,
            margin: '4px 0 4px', letterSpacing: '-0.01em',
          }}>
            Every event you've logged
          </h2>
          <p style={{ fontSize: 12.5, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', margin: 0, lineHeight: 1.55 }}>
            Tap an event to reopen its recap, edit your notes, or follow up.
          </p>
        </div>

        {loading && (
          <p style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: '20px 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Loading…
          </p>
        )}

        {!loading && rows.length === 0 && (
          <div
            className="rounded-2xl p-5 text-center"
            style={{ background: C.white, border: `1px dashed ${C.border}` }}
          >
            <p style={{ fontSize: 24, margin: '0 0 6px' }}>🗒️</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 4px', fontFamily: 'Inter, system-ui, sans-serif' }}>
              No events yet
            </p>
            <p style={{ fontSize: 12.5, color: C.textSub, lineHeight: 1.55, fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }}>
              Open an event, tap <strong style={{ color: C.text }}>Event Mode</strong>, and log people you meet. Your recaps land here.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(({ event, encounters }) => {
            const followed  = encounters.filter(e => e.followed_up_at).length
            const confirmed = encounters.filter(e => e.status === 'mutually_confirmed').length
            const open      = encounters.length - followed
            const date = event.start_at ? new Date(event.start_at) : null
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onOpenEvent?.(event.id)}
                className="text-left rounded-2xl active:scale-[0.99]"
                style={{
                  padding: '14px 16px',
                  background: C.white, border: `1px solid ${C.border}`,
                  cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{categoryEmoji(event.category)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {event.title}
                    </p>
                    <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>
                      {date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      {event.status === 'cancelled' && ' · Cancelled'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <Stat label={`${encounters.length} met`}       tint="gold" />
                  <Stat label={`${followed} followed up`}         tint="green" />
                  <Stat label={`${open} to follow up`}            tint="neutral" muted={open === 0} />
                  {confirmed > 0 && <Stat label={`${confirmed} confirmed`} tint="green" />}
                </div>
              </button>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}

function Stat({ label, tint, muted }) {
  const palette = tint === 'gold'
    ? { bg: C.goldBg, fg: C.goldDark, border: C.goldLight }
    : tint === 'green'
    ? { bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0' }
    : { bg: '#F3F4F6', fg: muted ? C.textMuted : C.textSub, border: C.border }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '3px 9px', borderRadius: 99,
      background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}`,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {label}
    </span>
  )
}
