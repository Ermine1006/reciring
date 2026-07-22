import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { TOPIC_CHIPS } from '../lib/eventEncounters'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#4B5563',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
  danger:    '#DC2626',
}

/**
 * EventMemoryModal — capture / edit conversation topics + a private
 * note for someone the user met at an event. Bottom-sheet on mobile,
 * respects safe-area padding.
 *
 * Props:
 *   open, onClose
 *   person       — { name, program, avatarUrl } — display only
 *   initialTopics, initialNote
 *   onSave       — async ({ topics, privateNote }) → { error? }
 *   onDelete     — async () → { error? }  optional; renders Undo button
 */
export default function EventMemoryModal({
  open, onClose, person = {},
  initialTopics = [], initialNote = '',
  onSave, onDelete,
}) {
  const [topics, setTopics] = useState(initialTopics)
  const [note,   setNote]   = useState(initialNote || '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  // Reset on open — otherwise stale state leaks between people.
  useEffect(() => {
    if (open) {
      setTopics(initialTopics || [])
      setNote(initialNote || '')
      setError(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTopic = (t) => {
    setTopics(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  const handleSave = async () => {
    setSaving(true); setError(null)
    const { error: err } = await onSave({ topics, privateNote: note.trim() || null })
    setSaving(false)
    if (err) { setError(err.message || 'Save failed'); return }
    onClose?.()
  }

  const handleUndo = async () => {
    if (!onDelete) return
    if (!window.confirm(`Remove ${person.name || 'this person'} from your event memory?`)) return
    setSaving(true); setError(null)
    const { error: err } = await onDelete()
    setSaving(false)
    if (err) { setError(err.message || 'Remove failed'); return }
    onClose?.()
  }

  // Rendered through a portal: EventDetailPage wraps its content in a
  // framer-motion container, and a transformed ancestor becomes the
  // containing block for absolute AND fixed descendants alike — which is
  // how the sheet's bottom edge ended up anchored below the visible fold,
  // with the submit button unreachable. Escaping to document.body makes
  // the viewport the anchor no matter what the page around it animates.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              // Fixed, not absolute: this sheet mounts inside the Events
              // page's scrollable content, so an absolute bottom: 0 anchors
              // to the bottom of the SCROLLED content — below the fold on a
              // phone, leaving the submit button unreachable. Fixed pins to
              // the visible viewport like every other dialog in the app.
              position: 'fixed', inset: 0, zIndex: 60,
              background: 'rgba(17,17,17,0.45)',
              backdropFilter: 'blur(4px)',
            }}
          />
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
              maxHeight: '90dvh',
              background: C.white,
              borderRadius: '24px 24px 0 0',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
            </div>

            {/* Header */}
            <div style={{ padding: '10px 24px 12px', flexShrink: 0 }}>
              <p style={{
                fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
                fontWeight: 700, color: C.gold, margin: 0,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Added to your event memory
              </p>
              <h2 style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 20, fontWeight: 600, color: C.text,
                margin: '6px 0 2px',
              }}>
                {person.name || 'Attendee'}
              </h2>
              {person.program && (
                <p style={{ fontSize: 12, color: C.textMuted, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {person.program}
                </p>
              )}
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 24px 16px' }}>
              <p style={{
                fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
                fontWeight: 600, color: C.textSub,
                fontFamily: 'Inter, system-ui, sans-serif',
                margin: '12px 0 8px',
              }}>
                What did you discuss?
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TOPIC_CHIPS.map(t => {
                  const active = topics.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTopic(t)}
                      className="transition-all active:scale-95"
                      style={{
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: active ? `1.5px solid ${C.gold}` : `1.5px solid ${C.border}`,
                        background: active ? C.goldBg : C.white,
                        color: active ? C.goldDark : C.textSub,
                        fontSize: 12, fontWeight: 600,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        cursor: 'pointer',
                        boxShadow: active ? '0 2px 6px rgba(200,169,106,0.18)' : 'none',
                      }}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>

              <p style={{
                fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
                fontWeight: 600, color: C.textSub,
                fontFamily: 'Inter, system-ui, sans-serif',
                margin: '20px 0 8px',
              }}>
                Private note
              </p>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value.slice(0, 400))}
                rows={3}
                placeholder="Only visible to you. E.g. 'Introduce her to Alex.'"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: `1.5px solid ${C.border}`,
                  background: '#FAFAFA',
                  color: C.text,
                  fontSize: 13.5,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  outline: 'none',
                  resize: 'vertical',
                  lineHeight: 1.5,
                }}
              />
              <div className="flex justify-between mt-1" style={{ fontSize: 10, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
                <span>Not shared with them.</span>
                <span>{note.length}/400</span>
              </div>

              {error && (
                <p className="mt-3 text-center" style={{ fontSize: 12, color: C.danger, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div style={{
              flexShrink: 0,
              padding: '12px 24px calc(20px + env(safe-area-inset-bottom))',
              borderTop: `1px solid ${C.border}`,
              background: C.white,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 6px 20px rgba(200,169,106,0.32)',
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save memory'}
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: C.danger,
                    cursor: saving ? 'default' : 'pointer',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                >
                  Undo — remove from memory
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
