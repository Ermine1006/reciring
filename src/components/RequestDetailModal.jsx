import { motion, AnimatePresence } from 'framer-motion'
import { Handshake } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'

const C = {
  gold:       '#C8A96A',
  goldDark:   '#A88245',
  goldLight:  '#E6D3A3',
  goldBg:     '#FBF6EC',
  warm:       '#8B6F47',
  warmDark:   '#3D3020',
  warmBorder: '#E8DDD0',
  text:       '#111111',
  textSub:    '#4B5563',
  textMuted:  '#9CA3AF',
  white:      '#FFFFFF',
}

const URGENCY = {
  urgent: { label: 'Urgent',    color: '#991B1B', dot: '#EF4444' },
  soon:   { label: 'This week', color: '#92400E', dot: '#F59E0B' },
}

export default function RequestDetailModal({ request, matchReason, onClose, onMatch }) {
  if (!request) return null

  const urg = request.urgency ? URGENCY[request.urgency] : null

  return (
    <AnimatePresence>
      <motion.div
        key="detail-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
        }}
      />

      <motion.div
        key="detail-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 51,
          maxHeight: '88%',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF8F2 100%)',
          borderRadius: '24px 24px 0 0',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
        }}
      >
        {/* ── Drag handle ─────────────────────────────────── */}
        <div
          style={{
            display: 'flex', justifyContent: 'center',
            paddingTop: 12, paddingBottom: 4, flexShrink: 0,
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>

        {/* ── Scrollable content ──────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 28px 0' }}>

          {/* Top accent stripe */}
          <div
            style={{
              height: 3, borderRadius: 99, marginBottom: 20,
              background: `linear-gradient(90deg,
                transparent 0%,
                ${C.goldLight} 15%,
                ${C.gold}     40%,
                ${C.warmBorder} 65%,
                ${C.warm}     85%,
                transparent  100%)`,
            }}
          />

          {/* ── Meta bar ──────────────────────────────────── */}
          <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 22 }}>
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
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: C.textMuted, opacity: 0.55, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {request.createdAt}
            </span>
          </div>

          {/* ── WHAT THEY NEED (full) ─────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div className="flex items-center" style={{ marginBottom: 10 }}>
              <div style={{ width: 2.5, height: 14, background: C.gold, borderRadius: 99, marginRight: 10, flexShrink: 0 }} />
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: '#8C6B3F', fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                What they need
              </span>
            </div>
            <p style={{
              fontSize: 16, lineHeight: 1.55, fontWeight: 600, color: C.text,
              fontFamily: 'Inter, system-ui, sans-serif', paddingLeft: 13,
            }}>
              {request.needs}
            </p>
          </div>

          {/* ── Tags ──────────────────────────────────────── */}
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
          <div style={{
            height: 1, marginBottom: 22,
            background: 'linear-gradient(90deg, rgba(200,169,106,0.25), rgba(139,111,71,0.1), transparent)',
          }} />

          {/* ── WHAT THEY OFFER (full) ────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div className="flex items-center" style={{ marginBottom: 10 }}>
              <div style={{ width: 2.5, height: 14, background: C.warm, borderRadius: 99, marginRight: 10, flexShrink: 0 }} />
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: C.warmDark, fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                What they offer
              </span>
            </div>
            <p style={{
              fontSize: 16, lineHeight: 1.55, fontWeight: 600, color: '#333333',
              fontFamily: 'Inter, system-ui, sans-serif', paddingLeft: 13,
            }}>
              {request.offers}
            </p>
          </div>

          {/* ── Footer identity ───────────────────────────── */}
          <div
            className="flex items-center gap-2"
            style={{ paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.05)', marginBottom: 8 }}
          >
            <div style={{ borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', flexShrink: 0 }}>
              <AnonymousAvatar seed={request.id} size={36} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                fontWeight: 500, color: C.textMuted, opacity: 0.6,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Anonymous · Rotman Peer
              </p>
              {matchReason && (
                <p style={{
                  fontSize: 11, color: C.warm, fontWeight: 500,
                  fontFamily: 'Inter, system-ui, sans-serif', marginTop: 3,
                }}>
                  {matchReason}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Sticky CTA ─────────────────────────────────── */}
        <div style={{
          flexShrink: 0, padding: '16px 28px 24px',
          borderTop: '1px solid rgba(200,169,106,0.15)',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
        }}>
          <button
            type="button"
            onClick={() => { onMatch(request); onClose() }}
            style={{
              width: '100%', padding: '14px 0',
              borderRadius: 99, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldDark} 100%)`,
              boxShadow: '0 6px 24px rgba(200,169,106,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontSize: 15, fontWeight: 700, color: '#FFFFFF',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '0.02em',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)' }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <Handshake size={20} strokeWidth={2} />
            I can help
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
