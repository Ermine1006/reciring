import { useState } from 'react'
import { motion } from 'framer-motion'
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

export default function RequestCard({ request, onDrag, onSwipeLeft, onSwipeRight, isTop }) {
  const [offset, setOffset] = useState(0)
  const rotate       = offset ? Math.min(Math.max(offset / 16, -ROTATION_RANGE), ROTATION_RANGE) : 0
  const matchOpacity = offset ? Math.min( offset / SWIPE_THRESHOLD, 1) : 0
  const passOpacity  = offset ? Math.min(-offset / SWIPE_THRESHOLD, 1) : 0

  const handleDrag = (_, info) => {
    if (!isTop) return
    setOffset(info.offset.x)
    onDrag?.(info.offset.x)
  }

  const handleDragEnd = (_, info) => {
    if (!isTop) return
    setOffset(0)
    onDrag?.(0)
    if (info.offset.x >  SWIPE_THRESHOLD) onSwipeRight()
    else if (info.offset.x < -SWIPE_THRESHOLD) onSwipeLeft()
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
        minHeight: 280,
        maxHeight: 'calc(100% - 112px)',
      }}
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

      {/* ── Swipe overlays ────────────────────────────── */}
      {isTop && (
        <>
          <div
            className="absolute inset-0 flex items-center justify-start pointer-events-none"
            style={{ opacity: matchOpacity, paddingLeft: 28 }}
          >
            <span
              style={{
                background: C.goldBg,
                border: `2.5px solid ${C.gold}`,
                color: C.goldDark,
                borderRadius: 99,
                padding: '8px 22px',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                boxShadow: '0 4px 16px rgba(200,169,106,0.3)',
              }}
            >
              Match!
            </span>
          </div>
          <div
            className="absolute inset-0 flex items-center justify-end pointer-events-none"
            style={{ opacity: passOpacity, paddingRight: 28 }}
          >
            <span
              style={{
                background: '#F3F4F6',
                border: '2.5px solid #D1D5DB',
                color: '#6B7280',
                borderRadius: 99,
                padding: '8px 22px',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Pass
            </span>
          </div>
        </>
      )}

      {/* ── Card body ─────────────────────────────────── */}
      <div style={{ padding: '28px 30px 24px' }}>

        {/* Category row */}
        <div className="flex items-center justify-between" style={{ marginBottom: 26 }}>
          <span
            style={{
              background: C.goldBg,
              border: `1px solid ${C.goldLight}`,
              color: C.goldDark,
              borderRadius: 99,
              padding: '5px 14px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            {request.category}
          </span>
          <span style={{
            fontSize: 12,
            color: C.textMuted,
            opacity: 0.55,
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: '0.02em',
          }}>
            {request.createdAt}
          </span>
        </div>

        {/* ── WHAT THEY NEED ─────────────────────────────── */}
        <div style={{ marginBottom: 26 }}>
          <div className="flex items-center" style={{ marginBottom: 12 }}>
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
              fontSize: 18,
              lineHeight: 1.45,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#111111',
              fontFamily: 'Inter, system-ui, sans-serif',
              paddingLeft: 13,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {request.needs}
          </p>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: 'linear-gradient(90deg, rgba(200,169,106,0.25), rgba(139,111,71,0.1), transparent)',
            marginBottom: 26,
          }}
        />

        {/* ── WHAT THEY OFFER ────────────────────────────── */}
        <div style={{ marginBottom: 26 }}>
          <div className="flex items-center" style={{ marginBottom: 12 }}>
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
              fontSize: 18,
              lineHeight: 1.45,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#333333',
              fontFamily: 'Inter, system-ui, sans-serif',
              paddingLeft: 13,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 4,
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
            paddingTop: 18,
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
          <div style={{ flex: 1 }} />
          <p style={{
            fontSize: 11,
            color: C.textMuted,
            opacity: 0.5,
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: '0.02em',
          }}>
            Swipe right if you can help
          </p>
        </div>

      </div>
    </motion.div>
  )
}
