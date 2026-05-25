import { motion, AnimatePresence } from 'framer-motion'
import AnonymousAvatar from './AnonymousAvatar'

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
  black:     '#111111',
}

const STATUS_LABEL = {
  active:    { text: 'Active match',    color: '#16A34A', bg: '#F0FDF4' },
  completed: { text: 'Completed',       color: '#15803D', bg: '#F0FDF4' },
  cancelled: { text: 'Cancelled',       color: '#B45309', bg: '#FEF3C7' },
  unmatched: { text: 'Unmatched',       color: '#9CA3AF', bg: '#F3F4F6' },
}

/**
 * Right-side slide-out card showing the peer's revealed identity.
 * Only renders when caller knows reveal status === 'accepted'.
 *
 * Props:
 *   open        — bool
 *   onClose     — close handler
 *   match       — UI match object (id, status, request)
 *   peerProfile — { id, name, email, avatar_url, program } | null
 */
export default function PeerProfileCard({ open, onClose, match, peerProfile }) {
  const status = STATUS_LABEL[match?.status] || STATUS_LABEL.active
  const avatarSeed = peerProfile?.avatar_url || match?.id || 'peer'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'absolute', inset: 0, zIndex: 90,
              background: 'rgba(17,17,17,0.4)',
              backdropFilter: 'blur(3px)',
            }}
          />
          {/* Slide-out panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            role="dialog"
            aria-modal="true"
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              zIndex: 91,
              width: 'min(86%, 320px)',
              background: C.white,
              borderLeft: `1px solid ${C.border}`,
              boxShadow: '-12px 0 40px rgba(0,0,0,0.16)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header — black bar with gold accent */}
            <div style={{
              background: C.black,
              padding: '18px 20px 20px',
              position: 'relative',
              borderBottom: `2px solid ${C.gold}`,
            }}>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close profile"
                style={{
                  position: 'absolute', top: 14, right: 14,
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.goldLight} strokeWidth={2.2} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <p style={{
                fontSize: 10, fontWeight: 600,
                letterSpacing: '0.22em', textTransform: 'uppercase',
                color: C.gold,
                fontFamily: 'Inter, system-ui, sans-serif',
                margin: 0,
              }}>
                Identity revealed
              </p>
              <p style={{
                fontSize: 12, color: 'rgba(255,255,255,0.55)',
                fontFamily: 'Inter, system-ui, sans-serif',
                marginTop: 6, lineHeight: 1.5,
              }}>
                Both of you agreed to share names.
              </p>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 22px 28px' }}>
              {/* Avatar + name */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 22 }}>
                <div style={{
                  padding: 3,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  boxShadow: '0 6px 20px rgba(200,169,106,0.25)',
                  marginBottom: 14,
                }}>
                  <div style={{
                    background: C.white,
                    borderRadius: '50%',
                    padding: 2,
                  }}>
                    <AnonymousAvatar seed={avatarSeed} size={72} />
                  </div>
                </div>

                <h2 style={{
                  fontSize: 20, fontWeight: 600, color: C.text,
                  fontFamily: 'Fraunces, Georgia, serif',
                  margin: 0, letterSpacing: '-0.01em',
                  textAlign: 'center',
                }}>
                  {peerProfile?.name || 'Peer'}
                </h2>
                {peerProfile?.program && (
                  <p style={{
                    fontSize: 12, color: C.textSub,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    margin: '4px 0 0',
                  }}>
                    {peerProfile.program}
                  </p>
                )}
              </div>

              {/* Info rows */}
              <div style={{
                background: C.goldBg,
                border: `1px solid ${C.goldLight}`,
                borderRadius: 16,
                padding: '4px 4px',
                marginBottom: 16,
              }}>
                <InfoRow label="School email" value={peerProfile?.email || '—'} copyable />
                <Divider />
                <InfoRow label="Program" value={peerProfile?.program || 'Not shared'} />
              </div>

              {/* Match status pill */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 12,
                background: status.bg,
                border: `1px solid ${status.color}30`,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: C.textSub,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  Match status
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600,
                  color: status.color,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: status.color,
                  }} />
                  {status.text}
                </span>
              </div>

              <p style={{
                marginTop: 18, fontSize: 11, color: C.textMuted,
                lineHeight: 1.55, textAlign: 'center',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Reach out respectfully. Identity reveal is a trust signal — keep it that way.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function InfoRow({ label, value, copyable }) {
  return (
    <div style={{
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <p style={{
        fontSize: 10, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: '#A88245',
        fontFamily: 'Inter, system-ui, sans-serif',
        margin: 0,
      }}>
        {label}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{
          fontSize: 13.5, fontWeight: 500, color: '#111',
          fontFamily: 'Inter, system-ui, sans-serif',
          margin: 0, wordBreak: 'break-all', lineHeight: 1.4,
        }}>
          {value}
        </p>
        {copyable && value && value !== '—' && (
          <button
            type="button"
            onClick={() => {
              try { navigator.clipboard?.writeText(value) } catch {}
            }}
            title="Copy"
            style={{
              flexShrink: 0,
              width: 28, height: 28, borderRadius: 8,
              background: '#FFFFFF',
              border: '1px solid #E6D3A3',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A88245" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15V5a2 2 0 012-2h10" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(200,169,106,0.25)', margin: '0 14px' }} />
}
