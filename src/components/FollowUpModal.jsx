import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { generateFollowUp } from '../lib/followUp'
import { saveMessageDraft, markMessageSent } from '../lib/eventMemory'
import { matchaCta } from '../lib/matchaCta'

const C = {
  gold:      '#C9A33B',
  goldDark:  '#A6822A',
  goldLight: '#E8D9A7',
  goldBg:    '#F8F3E5',
  text:      '#111111',
  textSub:   '#4B5563',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
  ok:        '#059669',
  okBg:      '#ECFDF5',
  okBorder:  '#A7F3D0',
}

/**
 * FollowUpModal — template-based follow-up message editor.
 *
 * Renders a draft filled from generateFollowUp() using event + topic
 * context. Private note is NEVER included by default (owner-only);
 * the user can explicitly opt in via a checkbox before copying.
 *
 * Actions: Edit inline, Copy to clipboard, Mark as followed-up.
 * "Send through Mutu chat" is deferred — the chat surface doesn't
 * yet expose a "compose to arbitrary user" affordance. When it
 * does, wire that up here.
 *
 * Props:
 *   open, onClose
 *   encounter       — the source event_encounters row
 *   person          — { name, program }
 *   eventTitle
 *   theirNeed, myOffer  — pre-computed strings, or null
 *   onFollowedUp    — callback fired after markEncounterFollowedUp
 */
export default function FollowUpModal({
  open, onClose, encounter, person, eventTitle,
  theirNeed = null, myOffer = null,
  onFollowedUp,
}) {
  const [includeNote, setIncludeNote] = useState(false)
  const [body, setBody]               = useState('')
  const [copied, setCopied]           = useState(false)
  const [marking, setMarking]         = useState(false)

  // Seed the draft when the modal opens (or its inputs change).
  const draft = useMemo(() => generateFollowUp({
    recipientName: person?.name,
    eventTitle,
    topics:        encounter?.topics || [],
    theirNeed,
    myOffer,
    privateNote:   encounter?.private_note,
    includeNote,
  }), [person?.name, eventTitle, encounter?.topics, encounter?.private_note, theirNeed, myOffer, includeNote])

  useEffect(() => {
    if (open) {
      // Prefer a previously saved draft; otherwise seed from the generator.
      setBody(encounter?.message_draft || draft.body)
      setCopied(false)
    }
  }, [open, draft.body, encounter?.message_draft])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea')
      ta.value = body
      ta.style.position = 'fixed'; ta.style.left = '-9999px'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000) }
      catch {}
      document.body.removeChild(ta)
    }
  }

  // Save the draft WITHOUT marking anything sent.
  const handleSaveDraft = async () => {
    if (!encounter?.id) return
    setMarking(true)
    const { error } = await saveMessageDraft(encounter.id, body)
    setMarking(false)
    if (error) { alert('Could not save: ' + (error.message || 'unknown')); return }
    onFollowedUp?.()
    onClose?.()
  }

  // Mark the message as sent (saves the current text as the sent message).
  const handleMarkSent = async () => {
    if (!encounter?.id) return
    setMarking(true)
    await saveMessageDraft(encounter.id, body)
    const { error } = await markMessageSent(encounter.id)
    setMarking(false)
    if (error) { alert('Could not mark sent: ' + (error.message || 'unknown')); return }
    onFollowedUp?.()
    onClose?.()
  }

  return (
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
              position: 'absolute', inset: 0, zIndex: 60,
              background: 'rgba(17,17,17,0.45)', backdropFilter: 'blur(4px)',
            }}
          />
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 61,
              maxHeight: '90dvh',
              background: C.white,
              borderRadius: '24px 24px 0 0',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
            </div>

            <div style={{ padding: '10px 24px 12px', flexShrink: 0 }}>
              <p style={{
                fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
                fontWeight: 700, color: C.gold, margin: 0,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Draft message
              </p>
              <h2 style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 20, fontWeight: 600, color: C.text,
                margin: '4px 0 2px',
              }}>
                Message {person?.name || 'them'}
              </h2>
              <p style={{ fontSize: 12, color: C.textMuted, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
                Edit before you send — nothing is sent automatically.
              </p>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 24px 16px' }}>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={10}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: `1.5px solid ${C.border}`,
                  background: '#FAFAFA',
                  color: C.text,
                  fontSize: 13.5,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  lineHeight: 1.55,
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: 220,
                }}
              />

              {encounter?.private_note && (
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  marginTop: 12, cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={includeNote}
                    onChange={e => setIncludeNote(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Include my private note as context in the message
                    <br />
                    <span style={{ fontSize: 11, color: C.textMuted }}>
                      Default: off. Your notes stay private unless you tick this.
                    </span>
                  </span>
                </label>
              )}
            </div>

            <div style={{
              flexShrink: 0,
              padding: '12px 24px calc(20px + env(safe-area-inset-bottom))',
              borderTop: `1px solid ${C.border}`,
              background: C.white,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <button
                type="button"
                onClick={handleCopy}
                className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide active:scale-[0.98]"
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  ...(copied
                    ? { background: `linear-gradient(135deg, ${C.ok}, #047857)`, color: '#fff', boxShadow: '0 6px 20px rgba(5,150,105,0.28)' }
                    : matchaCta),
                }}
              >
                {copied ? '✓ Copied to clipboard' : 'Copy message'}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={marking}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: C.white, color: C.goldDark, border: `1.5px solid ${C.goldLight}`, cursor: marking ? 'default' : 'pointer', opacity: marking ? 0.6 : 1, fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  onClick={handleMarkSent}
                  disabled={marking || encounter?.message_status === 'sent'}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ cursor: marking ? 'default' : 'pointer', opacity: marking ? 0.6 : 1, fontFamily: 'Inter, system-ui, sans-serif', ...(encounter?.message_status === 'sent' ? { background: C.white, color: C.textMuted, border: `1.5px solid ${C.goldLight}` } : { border: 'none', ...matchaCta }) }}
                >
                  {encounter?.message_status === 'sent' ? '✓ Sent' : (marking ? 'Saving…' : 'Mark as sent')}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
