import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
  danger:    '#DC2626',
}

const REASONS = [
  'Spam or scam',
  'Harassment or bullying',
  'Inappropriate content',
  'Impersonation',
  'Other',
]

/**
 * Generic report modal.
 * Props:
 *   type        — 'user' | 'post'
 *   targetId    — the reported_user_id or reported_post_id
 *   onSubmit    — async ({ reason, details }) => { error? }
 *   onClose     — close handler
 */
export default function ReportModal({ type = 'post', targetId, onSubmit, onClose }) {
  const [reason, setReason]   = useState('')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState(null)

  const handleSubmit = async () => {
    if (!reason) return
    setSending(true); setError(null)
    const result = await onSubmit({ reason, details: details.trim() || null })
    setSending(false)
    if (result?.error) {
      setError(result.error.message || 'Failed to submit report.')
    } else {
      setDone(true)
    }
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="report-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Sheet */}
      <motion.div
        key="report-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 61,
          background: C.white,
          borderRadius: '24px 24px 0 0',
          padding: '16px 24px 32px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>

        {done ? (
          /* ── Success state ─────────────────────────────── */
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#ECFDF5', border: '1.5px solid #A7F3D0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="22" height="22" fill="none" stroke="#059669" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>
              Report submitted
            </p>
            <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5, marginBottom: 20 }}>
              Thank you. Our team will review this report and take appropriate action.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 32px', borderRadius: 99, border: `1.5px solid ${C.border}`,
                background: C.white, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        ) : (
          /* ── Form ──────────────────────────────────────── */
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              Report {type === 'user' ? 'user' : 'post'}
            </h2>
            <p style={{ fontSize: 13, color: C.textSub, marginBottom: 16, lineHeight: 1.5 }}>
              Help us keep ReciRing safe. Select a reason below.
            </p>

            {/* Reason list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px', borderRadius: 12,
                    border: `1.5px solid ${reason === r ? C.gold : C.border}`,
                    background: reason === r ? '#FBF6EC' : C.white,
                    color: C.text, fontSize: 14, fontWeight: reason === r ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Optional details */}
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add details (optional)"
              rows={3}
              style={{
                width: '100%', borderRadius: 12, padding: '10px 14px',
                border: `1.5px solid ${C.border}`, background: '#FAFAFA',
                fontSize: 13, color: C.text, resize: 'none', outline: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />

            {error && (
              <p style={{ fontSize: 12, color: C.danger, marginTop: 8 }}>{error}</p>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 99,
                  border: `1.5px solid ${C.border}`, background: C.white,
                  color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!reason || sending}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 99,
                  border: 'none',
                  background: reason ? `linear-gradient(135deg, ${C.danger}, #B91C1C)` : '#E5E7EB',
                  color: reason ? '#fff' : C.textMuted,
                  fontSize: 14, fontWeight: 600, cursor: reason ? 'pointer' : 'not-allowed',
                  opacity: sending ? 0.6 : 1,
                }}
              >
                {sending ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
