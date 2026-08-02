import { motion } from 'framer-motion'
import EventCover from './EventCover'

// Palette — warm ivory / charcoal / muted gold / soft sage. High contrast text.
const C = {
  bg:      '#F6F3EC',
  card:    '#FFFFFF',
  ink:     '#25231E',   // charcoal headings
  sub:     '#6E675B',   // readable secondary (not low-contrast)
  gold:    '#B08D57',
  goldDeep:'#977540',
  sage:    '#7F9376',
  sageBg:  '#EAF0E4',
  border:  '#ECE6DB',
  danger:  '#C4553D',
}

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·'
}

function DateBadge({ iso }) {
  if (!iso) return null
  const d = new Date(iso)
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, background: '#FFFFFF',
      borderRadius: 12, padding: '5px 10px 6px', textAlign: 'center', minWidth: 44,
      boxShadow: '0 4px 12px rgba(30,22,10,0.18)',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>{MONTHS[d.getMonth()]}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1, fontFamily: 'Fraunces, Georgia, serif' }}>{d.getDate()}</div>
    </div>
  )
}

function timeLoc(iso, location) {
  const t = iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
  return [t, location].filter(Boolean).join('  ·  ')
}

/**
 * Discover event card — large host cover, category chip + date badge, title,
 * time · location, host + capacity row, and one primary action (View details).
 * Join/leave/cancel now live on the detail page, so the card stays clean.
 */
export default function EventCard({ event, joined, isHost, onOpen }) {
  const spotsLeft = Math.max(0, (event.max_attendees || 0) - (event.attendee_count || 0))
  const isCancelled = event.status === 'cancelled'
  const going = event.attendee_count || 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpen?.(event.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(event.id) }}
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 20,
        overflow: 'hidden', cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(30,22,10,0.04), 0 12px 28px -14px rgba(30,22,10,0.22)',
      }}
    >
      {/* Cover with category chip + date badge */}
      <div style={{ position: 'relative' }}>
        <EventCover event={event} aspectRatio="16 / 10" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 32%)' }} />
        <span style={{
          position: 'absolute', top: 12, left: 12,
          background: C.sageBg, color: '#4F6047',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '5px 11px', borderRadius: 8, fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          {event.category || 'Event'}
        </span>
        <DateBadge iso={event.start_at} />
        {isCancelled && (
          <span style={{ position: 'absolute', bottom: 12, left: 12, background: C.danger, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 8 }}>
            Cancelled
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '15px 17px 17px' }}>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: C.ink, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.22, letterSpacing: '-0.01em' }}>
          {event.title}
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {timeLoc(event.start_at, event.location)}
        </p>

        {/* Host + capacity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 13 }}>
          <span style={hostAvatar}>{initials(event.host_display_name)}</span>
          <span style={{ fontSize: 12.5, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Hosted by <strong style={{ color: C.ink, fontWeight: 600 }}>{event.host_display_name || 'a member'}</strong>
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: spotsLeft <= 3 && spotsLeft > 0 ? C.goldDeep : C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {isCancelled ? '' : spotsLeft === 0 ? 'Full' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`}
          </span>
        </div>

        {/* Primary action */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen?.(event.id) }}
          style={{
            width: '100%', marginTop: 15, padding: '13px', borderRadius: 13, border: 'none',
            background: isCancelled ? '#EFEAE0' : `linear-gradient(180deg, ${C.gold}, ${C.goldDeep})`,
            color: isCancelled ? C.sub : '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '0.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            boxShadow: isCancelled ? 'none' : '0 6px 16px -6px rgba(151,117,64,0.55)',
          }}
        >
          {joined ? 'View your event' : isHost ? 'Manage event' : 'View details'}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    </motion.div>
  )
}

const hostAvatar = {
  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
  display: 'grid', placeItems: 'center', color: '#fff', fontSize: 10, fontWeight: 700,
  background: 'linear-gradient(135deg, #B49A78, #8C7050)', fontFamily: 'Inter, system-ui, sans-serif',
}
