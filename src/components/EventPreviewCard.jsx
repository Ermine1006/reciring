import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, MapPin, Users, ArrowRight } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'

// EventPreviewCard — a SIMPLIFIED promotional variant of a marketplace post,
// shown in the Discover deck to drive event acquisition. It is deliberately
// NOT the full in-event MarketplacePostCard: identity stays anonymised
// (program / headline / industry only, never a name), and the primary action
// is "View Event", not "connect". Connecting happens only after joining.
//
// Gestures mirror RequestCard: right swipe / CTA → open the event;
// left swipe → dismiss for this session. It never creates a match.

const SWIPE_THRESHOLD = 90
const ROTATION_RANGE  = 10

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  ink:       '#111111',
  sub:       '#4B5563',
  muted:     '#9CA3AF',
  white:     '#FFFFFF',
  line:      '#E5E7EB',
  indigo:    '#4F46E5',
  indigoBg:  '#EEF2FF',
}

function fmtEventDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// Anonymised identity line — mirrors the in-event marketplace ("Anonymous
// {program} member"), never a name. industry may be an array or string.
function anonIdentity(promo) {
  const program = promo.posterProgram
  const primary = program ? `Anonymous ${program} member` : 'Anonymous member'
  const ind = Array.isArray(promo.posterIndustry) ? promo.posterIndustry[0] : promo.posterIndustry
  const sub = [promo.posterHeadline, ind].filter(Boolean).join(' · ')
  return { primary, sub }
}

export default function EventPreviewCard({ promo, isTop, onDrag, onSwipeLeft, onSwipeRight, onTap }) {
  const [offset, setOffset] = useState(0)
  const [hasDragged, setHasDragged] = useState(false)
  const [dragging, setDragging] = useState(false)

  const rotate      = offset ? Math.min(Math.max(offset / 16, -ROTATION_RANGE), ROTATION_RANGE) : 0
  const openOpacity = offset ? Math.min( offset / (SWIPE_THRESHOLD * 0.45), 1) : 0
  const skipOpacity = offset ? Math.min(-offset / (SWIPE_THRESHOLD * 0.45), 1) : 0
  const stampTransition = dragging ? 'transform 0.05s' : 'opacity 0.9s ease-out, transform 0.4s ease-out'

  const handleDrag = (_, info) => {
    if (!isTop) return
    if (Math.abs(info.offset.x) > 4) { setHasDragged(true); setDragging(true) }
    setOffset(info.offset.x)
    onDrag?.(info.offset.x)
  }
  const handleDragEnd = (_, info) => {
    if (!isTop) return
    setDragging(false); setOffset(0); onDrag?.(0)
    if (info.offset.x >  SWIPE_THRESHOLD) onSwipeRight?.()
    else if (info.offset.x < -SWIPE_THRESHOLD) onSwipeLeft?.()
    setTimeout(() => setHasDragged(false), 0)
  }
  const handlePointerUp = () => {
    if (!isTop || hasDragged) return
    onTap?.(promo)
  }

  const isOffer = promo.type === 'offer'
  const typeLabel = isOffer ? 'Offering' : 'Looking for'
  const identity  = anonIdentity(promo)
  const ctaLabel  = promo.joined ? 'Open Event Marketplace' : 'View Event'

  // Capacity line: honour attendee_visibility — a private list still shows a
  // count (that's not identifying), which is exactly what non-attendees get.
  const capacity = promo.maxAttendees != null
    ? `${promo.attendeeCount} going · ${promo.spotsLeft} ${promo.spotsLeft === 1 ? 'spot' : 'spots'} left`
    : `${promo.attendeeCount} going`

  return (
    <motion.div
      layout
      className="absolute inset-x-4 top-4 touch-none"
      style={{
        borderRadius: 24,
        cursor: isTop ? 'grab' : 'default',
        zIndex: isTop ? 10 : 5,
        background: C.white,
        border: `1px solid ${C.goldLight}`,
        boxShadow: isTop
          ? '0 16px 50px rgba(0,0,0,0.08), 0 4px 16px rgba(200,169,106,0.12)'
          : '0 6px 20px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        height: 'auto',
        maxHeight: 'calc(100% - 24px)',
        display: 'flex', flexDirection: 'column',
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
      }}
      onPointerUp={handlePointerUp}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={1}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      animate={{ rotate, scale: isTop ? 1 : 0.94, y: isTop ? 0 : 16 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* ── "From an upcoming event" ribbon ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '9px 16px',
        background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
        color: '#fff',
      }}>
        <CalendarDays size={13} strokeWidth={2.4} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'Inter, system-ui, sans-serif' }}>
          From an upcoming event
        </span>
      </div>

      {/* ── Swipe stamps ── */}
      {isTop && (
        <>
          <div className="absolute pointer-events-none" style={{ top: 52, left: 20, zIndex: 20, opacity: openOpacity, transform: `scale(${0.7 + openOpacity * 0.3}) rotate(-12deg)`, transition: stampTransition }}>
            <div style={{ padding: '8px 18px', borderRadius: 12, border: `3px solid ${C.gold}`, background: 'rgba(251,246,236,0.92)', fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif' }}>
              VIEW
            </div>
          </div>
          <div className="absolute pointer-events-none" style={{ top: 52, right: 20, zIndex: 20, opacity: skipOpacity, transform: `scale(${0.7 + skipOpacity * 0.3}) rotate(12deg)`, transition: stampTransition }}>
            <div style={{ padding: '8px 18px', borderRadius: 12, border: `3px solid ${C.muted}`, background: 'rgba(249,250,251,0.92)', fontSize: 16, fontWeight: 800, letterSpacing: '0.12em', color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>
              SKIP
            </div>
          </div>
        </>
      )}

      <div style={{ padding: '16px 18px 18px', overflowY: 'auto' }}>
        {/* Event headline */}
        <h3 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 21, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.2 }}>
          {promo.eventTitle}
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>
            <CalendarDays size={13} color={C.goldDark} /> {fmtEventDate(promo.eventStartAt)}
          </span>
          {promo.eventLocation && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>
              <MapPin size={13} color={C.goldDark} /> {promo.eventLocation}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          {promo.eventCategory && (
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.goldDark, background: C.goldBg, border: `1px solid ${C.goldLight}`, borderRadius: 99, padding: '3px 10px', fontFamily: 'Inter, system-ui, sans-serif' }}>
              {promo.eventCategory}
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.muted, fontFamily: 'Inter, system-ui, sans-serif' }}>
            <Users size={13} /> {capacity}
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.line, margin: '14px 0' }} />

        {/* The ask/offer preview */}
        <span style={{
          display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 99, marginBottom: 8,
          color: isOffer ? '#047857' : C.indigo,
          background: isOffer ? '#ECFDF5' : C.indigoBg,
          border: `1px solid ${isOffer ? '#A7F3D0' : '#C7D2FE'}`,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          {typeLabel}
        </span>
        <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, margin: '0 0 4px', lineHeight: 1.35, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {promo.title}
        </p>
        {promo.preview && (
          <p style={{ fontSize: 13, color: C.sub, margin: 0, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {promo.preview}{promo.preview.length >= 240 ? '…' : ''}
          </p>
        )}
        {promo.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {promo.tags.slice(0, 4).map(t => (
              <span key={t} style={{ fontSize: 11, color: C.sub, background: '#F3F4F6', borderRadius: 99, padding: '3px 9px', fontFamily: 'Inter, system-ui, sans-serif' }}>{t}</span>
            ))}
          </div>
        )}

        {/* Anonymised attendee identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <AnonymousAvatar seed={promo.eventId + (promo.postId || '')} size={34} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>{identity.primary}</p>
            {identity.sub && <p style={{ fontSize: 11, color: C.muted, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>{identity.sub}</p>}
          </div>
        </div>
        <p style={{ fontSize: 10.5, color: C.muted, margin: '8px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Identity stays private until you join and connect.
        </p>

        {/* Primary CTA */}
        <button
          type="button"
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onSwipeRight?.() }}
          className="active:scale-[0.98]"
          style={{
            width: '100%', marginTop: 14, padding: '12px', borderRadius: 12,
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
            color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            boxShadow: '0 6px 20px rgba(200,169,106,0.28)',
          }}
        >
          {ctaLabel} <ArrowRight size={16} />
        </button>
      </div>
    </motion.div>
  )
}
