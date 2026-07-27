import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { rewriteText } from '../lib/aiRewrite'

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
    // Mandatory: both need and offer are required to join. The whole point of
    // the event is the matching, and the matcher has nothing to work with if
    // people join blank — so we gate registration on stating intentions.
    if (!need.trim() || !offer.trim()) {
      setError('Please fill in both — what you need and what you can offer.')
      return
    }
    setBusy(true); setError(null)
    const { error: err } = await onConfirm({ needText: need, offerText: offer })
    setBusy(false)
    if (err) { setError(err.message || 'Could not join'); return }
    // Parent closes on success.
  }

  const canSubmit = need.trim() && offer.trim() && !busy

  /* ── "Increase My Response Rate" — AI rewrite of either field ── */
  const [improvingField, setImprovingField] = useState(null) // 'need' | 'offer' | null
  const [undoState, setUndoState] = useState(null)           // { field, prev }

  const improveField = async (which) => {
    const source = (which === 'need' ? need : offer).trim()
    if (!source || improvingField || busy) return
    setImprovingField(which); setError(null)
    const { text, error: err } = await rewriteText({
      kind: which === 'need' ? 'event_need' : 'event_offer',
      text: source,
      maxChars: 600,
      // Give each rewrite the sibling field so it stays coherent with it.
      context: which === 'need'
        ? { title: eventTitle, offer: offer.trim() }
        : { title: eventTitle, need: need.trim() },
    })
    setImprovingField(null)
    if (err || !text) { setError("Couldn't improve it just now — your text is unchanged."); return }
    setUndoState({ field: which, prev: which === 'need' ? need : offer })
    ;(which === 'need' ? setNeed : setOffer)(text)
  }

  const undoImprove = () => {
    if (undoState) (undoState.field === 'need' ? setNeed : setOffer)(undoState.prev)
    setUndoState(null)
  }

  // Auto-dismiss the "improved" confirmation.
  useEffect(() => {
    if (!undoState) return
    const t = setTimeout(() => setUndoState(null), 6000)
    return () => clearTimeout(t)
  }, [undoState])

  // Subtle rewrite button + inline Undo for a given field ('need' | 'offer').
  const improveRow = (which) => {
    const source = which === 'need' ? need : offer
    const busyThis = improvingField === which
    const canDo = source.trim() && !improvingField && !busy
    const showUndo = undoState?.field === which
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 26, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => improveField(which)}
          disabled={!canDo}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 2px', background: 'transparent', border: 'none',
            cursor: canDo ? 'pointer' : 'default',
            color: canDo ? C.goldDark : '#B8B0A2',
            fontSize: 12, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {busyThis ? (
            <>
              <span className="inline-block animate-spin" style={{ width: 11, height: 11, border: `1.5px solid ${C.goldLight}`, borderTopColor: C.goldDark, borderRadius: '50%' }} />
              Improving…
            </>
          ) : (
            <>✨ Increase My Response Rate</>
          )}
        </button>
        {showUndo && (
          <span style={{ fontSize: 11, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
            ✓ Clearer now ·{' '}
            <button type="button" onClick={undoImprove} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.goldDark, fontWeight: 700, fontSize: 11 }}>
              Undo
            </button>
          </span>
        )}
      </div>
    )
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

                <p style={label}>What do you need at this event? <span style={{ color: '#DC2626' }}>*</span></p>
                <textarea
                  value={need} onChange={(e) => setNeed(e.target.value.slice(0, 600))}
                  placeholder="e.g. Intros to AI infra investors; feedback on my eval startup"
                  style={{ ...field, marginBottom: 6 }}
                />

                {/* Subtle AI rewrite of the need — same reusable service as the composer. */}
                {improveRow('need')}

                <p style={label}>What can you offer? <span style={{ color: '#DC2626' }}>*</span></p>
                <textarea
                  value={offer} onChange={(e) => setOffer(e.target.value.slice(0, 600))}
                  placeholder="e.g. Happy to share hiring playbooks; intros to a16z network"
                  style={{ ...field, marginBottom: 6 }}
                />

                {/* Same rewrite for the offer — a clearer offer matches more needs. */}
                {improveRow('offer')}

                {error && (
                  <p style={{ color: '#DC2626', fontSize: 12, margin: '12px 0 0', textAlign: 'center' }}>{error}</p>
                )}

                <button
                  type="button" onClick={handleSubmit} disabled={!canSubmit}
                  className="active:scale-[0.98]"
                  style={{
                    width: '100%', marginTop: 20, padding: '15px', borderRadius: 14, border: 'none',
                    background: canSubmit ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : '#E5E7EB',
                    color: canSubmit ? C.white : '#9CA3AF',
                    fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
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
