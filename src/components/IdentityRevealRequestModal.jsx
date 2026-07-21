import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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
}

/**
 * Modal shown to the recipient of an identity-reveal request.
 *
 * Props:
 *   open       — bool
 *   onAccept   — async () => {}  // returns when DB update completes
 *   onDecline  — async () => {}
 *   onClose    — close without responding (defers, equivalent to "later")
 */
export default function IdentityRevealRequestModal({ open, onAccept, onDecline, onClose }) {
  const [busy, setBusy] = useState(null) // 'accept' | 'decline' | null

  const handleAccept = async () => {
    setBusy('accept')
    await onAccept?.()
    setBusy(null)
  }
  const handleDecline = async () => {
    setBusy('decline')
    await onDecline?.()
    setBusy(null)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 80,
              background: 'rgba(17,17,17,0.5)',
              backdropFilter: 'blur(4px)',
            }}
          />
          {/* Flex wrapper does the centring — see PostMatchFeedbackPrompt:
              Framer Motion owns the transform property on an animating card,
              so a translate(-50%,-50%) in its style is silently overwritten. */}
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 81,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
              pointerEvents: 'none',
            }}
          >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            role="dialog"
            aria-modal="true"
            style={{
              width: '100%', maxWidth: 360,
              pointerEvents: 'auto',
              background: C.white,
              borderRadius: 24,
              padding: '32px 26px 26px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(200,169,106,0.18)',
            }}
          >
            {/* Lock-key ornament */}
            <div style={{
              width: 60, height: 60,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.goldBg}, ${C.goldLight})`,
              border: `1.5px solid ${C.gold}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
              color: C.goldDark,
            }}>
              <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path strokeLinecap="round" d="M8 11V8a4 4 0 018 0v3" />
                <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </div>

            <h3 style={{
              textAlign: 'center',
              fontSize: 19, fontWeight: 600, color: C.text,
              fontFamily: 'Fraunces, Georgia, serif',
              margin: '0 0 6px',
            }}>
              Reveal identities?
            </h3>
            <p style={{
              textAlign: 'center',
              fontSize: 13, color: C.textSub, lineHeight: 1.55,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '0 0 22px',
            }}>
              Your anonymous peer is asking to reveal real identities.
              If you accept, you'll both see each other's <strong style={{ color: C.text }}>name</strong> and <strong style={{ color: C.text }}>school email</strong>.
            </p>

            {/* Gold info card */}
            <div style={{
              background: C.goldBg,
              border: `1px solid ${C.goldLight}`,
              borderRadius: 14,
              padding: '12px 14px',
              marginBottom: 20,
              display: 'flex', gap: 10,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1.2 }}>🤝</span>
              <p style={{
                fontSize: 12, color: C.goldDark, lineHeight: 1.5,
                fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
              }}>
                Both sides must agree. You can decline and keep chatting anonymously.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!!busy}
                style={{
                  width: '100%', padding: '14px 16px',
                  borderRadius: 14, border: 'none',
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  color: '#fff',
                  fontSize: 14, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: busy ? 'default' : 'pointer',
                  boxShadow: '0 6px 18px rgba(200,169,106,0.32)',
                  opacity: busy === 'decline' ? 0.5 : 1,
                }}
              >
                {busy === 'accept' ? 'Accepting…' : 'Accept — reveal identities'}
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={!!busy}
                style={{
                  width: '100%', padding: '14px 16px',
                  borderRadius: 14,
                  background: C.white,
                  color: C.text,
                  border: `1.5px solid ${C.border}`,
                  fontSize: 14, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy === 'accept' ? 0.5 : 1,
                }}
              >
                {busy === 'decline' ? 'Declining…' : 'Decline — stay anonymous'}
              </button>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={!!busy}
                style={{
                  display: 'block', margin: '14px auto 0',
                  background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer',
                  fontSize: 12, color: C.textMuted,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                Decide later
              </button>
            )}
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
