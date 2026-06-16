import { motion } from 'framer-motion'
import { categoryEmoji } from '../data/eventCategories'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#F0ECE4',
  success:   '#16A34A',
  danger:    '#DC2626',
}

const HOST_TYPE_LABEL = {
  individual: '',
  club:       'Club',
  business:   'Sponsor',
}

function formatEventDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dateStr} · ${timeStr}`
}

export default function EventCard({ event, joined, joining, onJoin, isHost }) {
  const emoji = categoryEmoji(event.category)
  const spotsLeft = Math.max(0, (event.max_attendees || 0) - (event.attendee_count || 0))
  const isFull = spotsLeft === 0 && !joined
  const sponsorBadge = HOST_TYPE_LABEL[event.host_type]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}
    >
      {/* Top gold accent for sponsored events */}
      {event.is_sponsored && (
        <div style={{
          height: 3,
          background: `linear-gradient(90deg, ${C.goldLight}, ${C.gold}, ${C.goldDark})`,
        }} />
      )}

      <div style={{ padding: '16px 18px' }}>
        {/* Header row: category emoji + title + sponsor badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <span style={{
            fontSize: 28, lineHeight: 1, flexShrink: 0,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))',
          }}>
            {emoji}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              fontSize: 15, fontWeight: 700, color: C.text,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '0 0 3px',
              lineHeight: 1.35,
              wordBreak: 'break-word',
            }}>
              {event.title}
            </h3>
            <p style={{
              fontSize: 12, color: C.textSub,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: 0,
            }}>
              {formatEventDate(event.start_at)}
              {event.location && <span> · {event.location}</span>}
            </p>
          </div>
          {sponsorBadge && (
            <span style={{
              flexShrink: 0,
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: C.goldDark,
              background: C.goldBg,
              border: `1px solid ${C.goldLight}`,
              borderRadius: 99,
              padding: '3px 8px',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              {sponsorBadge}
            </span>
          )}
        </div>

        {/* Description — clamped to 2 lines */}
        {event.description && (
          <p style={{
            fontSize: 13, color: C.textSub, lineHeight: 1.5,
            fontFamily: 'Inter, system-ui, sans-serif',
            margin: '0 0 12px',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {event.description}
          </p>
        )}

        {/* Footer row: host + capacity + Join */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 11, color: C.textMuted,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: 0, lineHeight: 1.4,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              Hosted by <span style={{ color: C.text, fontWeight: 600 }}>{event.host_display_name}</span>
            </p>
            <p style={{
              fontSize: 11, color: isFull ? C.danger : C.textMuted,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '2px 0 0',
              fontWeight: isFull ? 600 : 500,
            }}>
              {isFull
                ? 'Full'
                : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`}
              {' '}· {event.attendee_count || 0}/{event.max_attendees}
            </p>
          </div>

          {isHost ? (
            <span style={{
              fontSize: 11, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: C.goldDark, background: C.goldBg,
              border: `1px solid ${C.goldLight}`,
              borderRadius: 10, padding: '8px 14px',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Your event
            </span>
          ) : joined ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 700,
              color: '#fff',
              background: C.success,
              borderRadius: 10, padding: '8px 14px',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              ✓ Joined
            </span>
          ) : (
            <button
              type="button"
              onClick={() => !joining && !isFull && onJoin?.(event.id)}
              disabled={joining || isFull}
              style={{
                padding: '8px 16px',
                borderRadius: 10,
                border: 'none',
                background: isFull
                  ? '#F3F4F6'
                  : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                color: isFull ? C.textMuted : '#fff',
                fontSize: 12, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                fontFamily: 'Inter, system-ui, sans-serif',
                cursor: (joining || isFull) ? 'default' : 'pointer',
                boxShadow: isFull ? 'none' : '0 4px 12px rgba(200,169,106,0.32)',
                opacity: joining ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              {joining ? '...' : isFull ? 'Full' : 'Join'}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
