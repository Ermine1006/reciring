import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#1A1712', textSub: '#6B6152', white: '#FFFFFF', border: '#E5E7EB',
}

/**
 * Shown when someone taps "Join event" — before they're registered they say
 * what they need and what they can offer AT THIS EVENT. These per-event
 * intentions are what the in-event matcher ranks attendees against each other
 * on, and they're deliberately separate from the global profile because people
 * want different things at different events.
 *
 * onConfirm({ needText, offerText }) performs the actual join; the parent keeps
 * the optimistic-update + error handling it already had.
 */
export default function EventJoinIntentModal({ open, eventTitle, prefill, onConfirm, onClose }) {
  const [need, setNeed]   = useState(prefill?.needText || '')
  const [offer, setOffer] = useState(prefill?.offerText || '')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    if (busy) return
    // Both optional — someone can join without stating intentions — but nudge:
    // an empty need AND empty offer means the matcher has nothing to work with.
    setBusy(true); setError(null)
    const { error: err } = await onConfirm({ needText: need, offerText: offer })
    setBusy(false)
    if (err) { setError(err.message || 'Could not join'); return }
    // Parent closes on success.
  }

  const field = {
    width: '100%', minHeight: 74, resize: 'vertical',
    background: '#FAFAFA', border: `1.5px solid ${C.border}`, borderRadius: 12,
    padding: '11px 13px', fontSize: 14, color: C.ink, lineHeight: 1.4,
    fontFamily: 'Inter, system-ui, sans-serif', outline: 'none',
  }
  const label = {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: C.goldDark,
    margin: '0 0 6px', fontFamily: 'Inter, system-ui, sans-serif',
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={busy ? undefined : onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 80,
              background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)',
            }}
          />
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 81,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              padding: 0, pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              role="dialog" aria-modal="true"
              style={{
                width: '100%', maxWidth: 460, pointerEvents: 'auto',
                background: C.white, borderRadius: '24px 24px 0 0',
                maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.14)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
                <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
              </div>

              <div style={{ padding: '8px 24px 24px', overflowY: 'auto' }}>
                <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: C.gold, margin: 0 }}>
                  Joining
                </p>
                <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, fontWeight: 600, color: C.ink, margin: '4px 0 4px' }}>
                  {eventTitle || 'this event'}
                </h2>
                <p style={{ fontSize: 13, color: C.textSub, margin: '0 0 18px', lineHeight: 1.5 }}>
                  Tell us what you're after here. We'll use it to suggest who to meet — and other attendees see it too.
                </p>

                <p style={label}>What do you need at this event?</p>
                <textarea
                  value={need} onChange={(e) => setNeed(e.target.value.slice(0, 600))}
                  placeholder="e.g. Intros to AI infra investors; feedback on my eval startup"
                  style={{ ...field, marginBottom: 16 }}
                />

                <p style={label}>What can you offer?</p>
                <textarea
                  value={offer} onChange={(e) => setOffer(e.target.value.slice(0, 600))}
                  placeholder="e.g. Happy to share hiring playbooks; intros to a16z network"
                  style={field}
                />

                {error && (
                  <p style={{ color: '#DC2626', fontSize: 12, margin: '12px 0 0', textAlign: 'center' }}>{error}</p>
                )}

                <button
                  type="button" onClick={handleSubmit} disabled={busy}
                  className="active:scale-[0.98]"
                  style={{
                    width: '100%', marginTop: 20, padding: '15px', borderRadius: 14, border: 'none',
                    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: C.white,
                    fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                >
                  {busy ? 'Joining…' : 'Join event'}
                </button>
                <button
                  type="button" onClick={busy ? undefined : onClose}
                  style={{
                    width: '100%', marginTop: 8, padding: '12px', background: 'transparent',
                    border: 'none', color: C.textSub, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
