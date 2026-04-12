import { useState } from 'react'
import { motion } from 'framer-motion'
import { Handshake, X } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'

const SWIPE_THRESHOLD = 80
const ROTATION_RANGE  = 10

const C = {
  gold:       '#C8A96A',
  goldDark:   '#A88245',
  goldLight:  '#E6D3A3',
  goldBg:     '#FBF6EC',
  warm:       '#8B6F47',
  warmDark:   '#3D3020',
  warmBg:     '#FAF6F0',
  warmBorder: '#E8DDD0',
  text:       '#111111',
  textSub:    '#4B5563',
  textMuted:  '#9CA3AF',
  white:      '#FFFFFF',
}

/* ── Urgency indicator config ────────────────────────────────────── */
const URGENCY = {
  urgent: { label: 'Urgent',    bg: '#FEF2F2', border: '#FECACA', color: '#991B1B', dot: '#EF4444' },
  soon:   { label: 'This week', bg: '#FFF8EB', border: '#FDE68A', color: '#92400E', dot: '#F59E0B' },
}

export default function RequestCard({ request, onDrag, onSwipeLeft, onSwipeRight, isTop, matchReason, onTap }) {
  const [offset, setOffset] = useState(0)
  const [hasDragged, setHasDragged] = useState(false)
  const rotate       = offset ? Math.min(Math.max(offset / 16, -ROTATION_RANGE), ROTATION_RANGE) : 0
  const matchOpacity = offset ? Math.min( offset / SWIPE_THRESHOLD, 1) : 0
  const passOpacity  = offset ? Math.min(-offset / SWIPE_THRESHOLD, 1) : 0

  const handleDrag = (_, info) => {
    if (!isTop) return
    if (Math.abs(info.offset.x) > 4) setHasDragged(true)
    setOffset(info.offset.x)
    onDrag?.(info.offset.x)
  }

  const handleDragEnd = (_, info) => {
    if (!isTop) return
    setOffset(0)
    onDrag?.(0)
    if (info.offset.x >  SWIPE_THRESHOLD) onSwipeRight()
    else if (info.offset.x < -SWIPE_THRESHOLD) onSwipeLeft()
    // Reset after a tick so the pointerUp handler can read it
    setTimeout(() => setHasDragged(false), 0)
  }

  const handlePointerUp = () => {
    if (!isTop || hasDragged) return
    onTap?.(request)
  }

  return (
    <motion.div
      layout
      className="absolute inset-x-4 top-4 touch-none"
      style={{
        borderRadius: 24,
        cursor: isTop ? 'grab' : 'default',
        zIndex: isTop ? 10 : 5,
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF8F2 100%)',
        border: `1px solid ${C.goldLight}`,
        boxShadow: isTop
          ? '0 16px 50px rgba(0,0,0,0.08), 0 4px 16px rgba(200,169,106,0.12)'
          : '0 6px 20px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        height: 'auto',
        maxHeight: 'calc(100% - 24px)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onPointerUp={handlePointerUp}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      animate={{
        rotate,
        scale: isTop ? 1 : 0.94,
        y:     isTop ? 0 : 16,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* ── Top accent stripe ─────────────────────────── */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg,
            transparent 0%,
            ${C.goldLight} 15%,
            ${C.gold}     40%,
            ${C.warmBorder} 65%,
            ${C.warm}     85%,
            transparent  100%)`,
        }}
      />

      {/* ── Swipe overlays (Tinder/Hinge style stamps) ── */}
      {isTop && (
        <>
          {/* CONNECT — top-left stamp on right swipe */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 28, left: 20, zIndex: 20,
              opacity: matchOpacity,
              transform: `scale(${0.7 + matchOpacity * 0.3}) rotate(-12deg)`,
              transition: 'transform 0.05s',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              border: `3px solid ${C.gold}`,
              background: 'rgba(251,246,236,0.92)',
              boxShadow: '0 4px 20px rgba(200,169,106,0.35)',
            }}>
              <Handshake size={22} stroke={C.goldDark} strokeWidth={2.2} />
              <span style={{
                fontSize: 18, fontWeight: 800, letterSpacing: '0.12em',
                color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                CONNECT
              </span>
            </div>
          </div>

          {/* PASS — top-right stamp on left swipe */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 28, right: 20, zIndex: 20,
              opacity: passOpacity,
              transform: `scale(${0.7 + passOpacity * 0.3}) rotate(12deg)`,
              transition: 'transform 0.05s',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              border: '3px solid #9CA3AF',
              background: 'rgba(243,244,246,0.92)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}>
              <X size={22} stroke="#6B7280" strokeWidth={2.6} />
              <span style={{
                fontSize: 18, fontWeight: 800, letterSpacing: '0.12em',
                color: '#6B7280', fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                PASS
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Card body ─────────────────────────────────── */}
      <div style={{ padding: '28px 30px 24px', flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* ── Scannable meta bar — the 1-second decision row ────── */}
        {(() => {
          const urg = request.urgency ? URGENCY[request.urgency] : null
          return (
            <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 20 }}>
              {/* Category — filled, high-contrast */}
              <span style={{
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                color: '#FFFFFF',
                borderRadius: 99, padding: '5px 14px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                fontFamily: 'Inter, system-ui, sans-serif',
                boxShadow: '0 2px 6px rgba(200,169,106,0.25)',
              }}>
                {request.category}
              </span>
              {/* Time — filled dark chip */}
              {request.time && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: '#1A1A1A', color: '#FFFFFF',
                  borderRadius: 99, padding: '5px 12px',
                  fontSize: 11, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M12 6v6l4 2" />
                  </svg>
                  {request.time}
                </span>
              )}
              {/* Urgency — bold color-coded */}
              {urg && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: urg.color, color: '#FFFFFF',
                  borderRadius: 99, padding: '5px 12px',
                  fontSize: 11, fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif',
                  boxShadow: `0 2px 8px ${urg.dot}44`,
                }}>
                  {urg.label}
                </span>
              )}
              {/* Timestamp — right-aligned, quiet */}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.textMuted, opacity: 0.55, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {request.createdAt}
              </span>
            </div>
          )
        })()}

        {/* ── WHAT THEY NEED ─────────────────────────────── */}
        <div style={{ marginBottom: 22 }}>
          <div className="flex items-center" style={{ marginBottom: 10 }}>
            <div style={{ width: 2.5, height: 14, background: C.gold, borderRadius: 99, marginRight: 10, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#8C6B3F',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              What they need
            </span>
          </div>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.45,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#111111',
              fontFamily: 'Inter, system-ui, sans-serif',
              paddingLeft: 13,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {request.needs}
          </p>
        </div>

        {/* ── Tags ────────────────────────────────────── */}
        {request.tags?.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 18, paddingLeft: 13 }}>
            {request.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
                  color: C.textSub, background: '#F5F3F0', border: '1px solid #EDE9E3',
                  borderRadius: 99, padding: '3px 10px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: 'linear-gradient(90deg, rgba(200,169,106,0.25), rgba(139,111,71,0.1), transparent)',
            marginBottom: 22,
          }}
        />

        {/* ── WHAT THEY OFFER ────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <div className="flex items-center" style={{ marginBottom: 10 }}>
            <div style={{ width: 2.5, height: 14, background: C.warm, borderRadius: 99, marginRight: 10, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: C.warmDark,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              What they offer
            </span>
          </div>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.45,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#333333',
              fontFamily: 'Inter, system-ui, sans-serif',
              paddingLeft: 13,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {request.offers}
          </p>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2"
          style={{
            paddingTop: 14,
            borderTop: '1px solid rgba(0,0,0,0.05)',
          }}
        >
          {/* Avatar with soft shadow */}
          <div style={{
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            flexShrink: 0,
          }}>
            <AnonymousAvatar seed={request.id} size={36} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 500,
              color: C.textMuted,
              opacity: 0.6,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Anonymous · Rotman Peer
            </p>
            {matchReason && (
              <p style={{
                fontSize: 11,
                color: C.warm,
                fontWeight: 500,
                fontFamily: 'Inter, system-ui, sans-serif',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {matchReason}
              </p>
            )}
          </div>

          {/* Tap hint */}
          {isTop && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              color: C.textMuted, opacity: 0.5, flexShrink: 0,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 500, fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Details
              </span>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </div>

      </div>
    </motion.div>
  )
}
