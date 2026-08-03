import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Join Event sheet — attendance only. Need/Offer are captured later in
// Prepare, so joining is a single clear decision (no auto-created posts).
// After joining, a compact "You're going." confirmation nudges Prepare.

const C = {
  ground:'#FFFFFF', ivory:'#FBF8F3', ink:'#1A1712', ink2:'#5F584D', ink3:'#9A958B',
  line:'#ECE7DE', gold:'#A67C33', goldBtn:'#C6A25A', goldBtnInk:'#241B0C',
  sage:'#2F7A55', sageBg:'#EEF5F0', sageLine:'#CFE4D6',
}

/**
 * @param {string} eventTitle
 * @param {string} eventWhen        e.g. "Sun, Aug 9 · 9:00 AM · Trinity Bellwoods"
 * @param {string} identityLabel    how the user appears on the attendee list
 * @param {() => Promise<{error}>} onConfirm   performs the join
 * @param {() => void} onPrepare    open Prepare (after joining)
 * @param {() => void} onClose
 */
export default function EventJoinIntentModal({ open, eventTitle, eventWhen, identityLabel, onConfirm, onPrepare, onClose }) {
  const [view, setView] = useState('confirm')   // 'confirm' | 'joined'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { if (open) { setView('confirm'); setBusy(false); setError(null) } }, [open])

  const join = async () => {
    if (busy) return
    setBusy(true); setError(null)
    const { error: err } = await onConfirm()
    setBusy(false)
    if (err) { setError(err.message || 'Could not join'); return }
    setView('joined')
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={view === 'confirm' ? onClose : undefined}
            style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(17,17,17,0.45)', backdropFilter: 'blur(4px)' }} />
          <motion.div key="sh" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 81, background: C.ground, borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.14)', padding: '10px 20px calc(20px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 12px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D9D3C7' }} />
            </div>

            {view === 'confirm' ? (
              <>
                <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: C.gold, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>Joining</p>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: C.ink, margin: '5px 0 3px', fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '-0.01em' }}>{eventTitle || 'this event'}</h2>
                {eventWhen && <p style={{ fontSize: 12.5, color: C.ink2, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>{eventWhen}</p>}
                <div style={{ background: C.ivory, border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 13px', marginTop: 14 }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: C.ink2, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    You'll appear on the attendee list as <b style={{ color: C.ink }}>{identityLabel || 'yourself'}</b>. Your event post stays hidden until you choose to share it.
                  </p>
                </div>
                {error && <p style={{ color: '#B4453A', fontSize: 12.5, margin: '12px 0 0', textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>{error}</p>}
                <button type="button" onClick={join} disabled={busy}
                  style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 12, border: 'none', background: C.goldBtn, color: C.goldBtnInk, fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {busy ? 'Joining…' : 'Join event'}
                </button>
                <button type="button" onClick={busy ? undefined : onClose}
                  style={{ width: '100%', marginTop: 8, padding: '11px', background: 'transparent', border: 'none', color: C.ink2, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Cancel
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '4px 0 6px' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.sageBg, border: `1px solid ${C.sageLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.sage} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <p style={{ fontSize: 18, fontWeight: 700, color: C.ink, margin: '12px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>You're going.</p>
                <p style={{ fontSize: 12.5, color: C.ink2, margin: '6px 18px 0', lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Add what you're looking for and what you can offer so relevant attendees can find you.
                </p>
                <button type="button" onClick={() => { onClose?.(); onPrepare?.() }}
                  style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 12, border: 'none', background: C.goldBtn, color: C.goldBtnInk, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Prepare for event
                </button>
                <button type="button" onClick={onClose}
                  style={{ width: '100%', marginTop: 8, padding: '11px', background: 'transparent', border: 'none', color: C.ink2, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Maybe later
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
