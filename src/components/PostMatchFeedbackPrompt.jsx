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
 * Two-step popup that fires ~24h after a match if the viewer hasn't reviewed yet.
 *
 * Step 1: "Did you connect with this peer?"  →  Yes / Not yet
 *   - "Yes" → opens the existing review flow (controlled by parent via onReview)
 *   - "Not yet" → snoozes for ~48h (parent persists snooze)
 *
 * Props:
 *   open       — bool, controls visibility
 *   match      — the UI match object ({ id, request, peerId, ... })
 *   onReview   — called when user picks "Yes, rate now" (parent navigates to RatingReview)
 *   onSnooze   — called when user EXPLICITLY picks "Remind me later" (parent persists 48h snooze)
 *   onDismiss  — called when user taps the backdrop. Closes the modal WITHOUT
 *                persisting a snooze, so an accidental tap-outside doesn't
 *                silence the reminder for two days.
 *   onUnmatch  — optional, called when user picks "Didn't happen — unmatch"
 */
export default function PostMatchFeedbackPrompt({ open, match, onReview, onSnooze, onDismiss, onUnmatch }) {
  const [step, setStep] = useState('ask') // 'ask' | 'no'

  if (!match) return null

  // Explicit "Remind me later" → snooze 48h via parent
  const handleSnooze = () => {
    setStep('ask')
    onSnooze?.()
  }

  // Backdrop tap → close without snoozing
  const handleDismiss = () => {
    setStep('ask')
    onDismiss?.()
  }

  return (
    <AnimatePresence onExitComplete={() => setStep('ask')}>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleDismiss}
            style={{
              position: 'fixed', inset: 0, zIndex: 70,
              background: 'rgba(17,17,17,0.45)',
              backdropFilter: 'blur(4px)',
            }}
          />
          {/* Card. Centred by this flex wrapper rather than by a translate on
              the card itself: the card animates scale/y, and Framer Motion
              writes the whole transform property, so a hand-written
              translate(-50%,-50%) there gets clobbered and the card lands with
              its top-left corner at the screen centre. */}
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 71,
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
              width: '100%', maxWidth: 340,
              pointerEvents: 'auto',
              background: C.white,
              borderRadius: 24,
              padding: '28px 24px 24px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(200,169,106,0.18)',
            }}
          >
            {/* Star ornament */}
            <div style={{
              width: 56, height: 56,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.goldBg}, ${C.goldLight})`,
              border: `1.5px solid ${C.gold}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 26,
              color: C.goldDark,
            }}>
              ★
            </div>

            {step === 'ask' && (
              <>
                <h3 style={{
                  textAlign: 'center',
                  fontSize: 18, fontWeight: 600, color: C.text,
                  fontFamily: 'Fraunces, Georgia, serif',
                  margin: '0 0 6px',
                }}>
                  Did you connect?
                </h3>
                <p style={{
                  textAlign: 'center',
                  fontSize: 13, color: C.textSub, lineHeight: 1.5,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  margin: '0 0 20px',
                }}>
                  {match.request?.needs
                    ? `Your match about "${match.request.needs.slice(0, 60)}${match.request.needs.length > 60 ? '…' : ''}"`
                    : 'How did your recent match go?'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => onReview?.(match.id)}
                    style={{
                      width: '100%', padding: '13px 16px',
                      borderRadius: 14, border: 'none',
                      background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                      color: '#fff',
                      fontSize: 14, fontWeight: 600,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      cursor: 'pointer',
                      boxShadow: '0 6px 18px rgba(200,169,106,0.32)',
                    }}
                  >
                    Yes — rate now
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('no')}
                    style={{
                      width: '100%', padding: '13px 16px',
                      borderRadius: 14,
                      background: C.white,
                      color: C.text,
                      border: `1.5px solid ${C.border}`,
                      fontSize: 14, fontWeight: 600,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      cursor: 'pointer',
                    }}
                  >
                    Not yet
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSnooze}
                  style={{
                    display: 'block', margin: '14px auto 0',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: C.textMuted,
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                >
                  Remind me later
                </button>
              </>
            )}

            {step === 'no' && (
              <>
                <h3 style={{
                  textAlign: 'center',
                  fontSize: 18, fontWeight: 600, color: C.text,
                  fontFamily: 'Fraunces, Georgia, serif',
                  margin: '0 0 6px',
                }}>
                  No worries
                </h3>
                <p style={{
                  textAlign: 'center',
                  fontSize: 13, color: C.textSub, lineHeight: 1.5,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  margin: '0 0 20px',
                }}>
                  We'll check back in a couple days. If it didn't work out, you can unmatch.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleSnooze}
                    style={{
                      width: '100%', padding: '13px 16px',
                      borderRadius: 14,
                      background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                      color: '#fff',
                      border: 'none',
                      fontSize: 14, fontWeight: 600,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      cursor: 'pointer',
                      boxShadow: '0 6px 18px rgba(200,169,106,0.32)',
                    }}
                  >
                    Remind me later
                  </button>
                  {onUnmatch && (
                    <button
                      type="button"
                      onClick={() => { onUnmatch(match.id); setStep('ask') }}
                      style={{
                        width: '100%', padding: '13px 16px',
                        borderRadius: 14,
                        background: C.white,
                        color: '#DC2626',
                        border: `1.5px solid #FECACA`,
                        fontSize: 14, fontWeight: 600,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        cursor: 'pointer',
                      }}
                    >
                      Unmatch
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
