import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { fetchUpcomingEvents, fetchMyJoinedEventIds, joinEvent, leaveEvent, cancelEvent } from '../lib/events'
import EventCard from './EventCard'

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

export default function EventsList({ onCreateEvent }) {
  const { user } = useAuth()

  const [events, setEvents]         = useState([])
  const [joinedIds, setJoinedIds]   = useState(new Set())
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('upcoming') // 'upcoming' | 'joined'
  const [joiningId, setJoiningId]   = useState(null)
  const [leaveTarget, setLeaveTarget]   = useState(null)  // event being left (pre-confirm)
  const [cancelTarget, setCancelTarget] = useState(null)  // event being cancelled (pre-confirm)
  const [actionSaving, setActionSaving] = useState(false)
  const [toast, setToast]           = useState(null)
  // Local optimistic attendance counts so the UI updates instantly on
  // join without waiting for the next refetch.
  const optimisticAdds = useRef(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    const [{ data: eventsData }, { data: joined }] = await Promise.all([
      fetchUpcomingEvents(),
      user ? fetchMyJoinedEventIds(user.id) : Promise.resolve({ data: new Set() }),
    ])
    setEvents(eventsData || [])
    setJoinedIds(joined || new Set())
    optimisticAdds.current.clear()
    setLoading(false)
  }, [user?.id])

  useEffect(() => { refresh() }, [refresh])

  const handleJoin = async (eventId) => {
    if (!user) return
    setJoiningId(eventId)
    setToast(null)

    // Optimistic: mark joined locally + bump count
    setJoinedIds(prev => new Set([...prev, eventId]))
    optimisticAdds.current.add(eventId)
    setEvents(prev => prev.map(e =>
      e.id === eventId ? { ...e, attendee_count: (e.attendee_count || 0) + 1 } : e,
    ))

    const { error } = await joinEvent(eventId, user.id)
    setJoiningId(null)
    if (error) {
      // Rollback
      setJoinedIds(prev => {
        const next = new Set(prev); next.delete(eventId); return next
      })
      optimisticAdds.current.delete(eventId)
      setEvents(prev => prev.map(e =>
        e.id === eventId ? { ...e, attendee_count: Math.max(0, (e.attendee_count || 0) - 1) } : e,
      ))
      setToast({ type: 'err', msg: error.message || 'Could not join event' })
      return
    }
    setToast({ type: 'ok', msg: 'Joined — see you there!' })
  }

  // Leave flow — opens a confirmation modal first.
  const requestLeave = (eventId) => {
    const ev = events.find(e => e.id === eventId)
    if (ev) setLeaveTarget(ev)
  }

  const confirmLeave = async () => {
    if (!user || !leaveTarget) return
    setActionSaving(true); setToast(null)
    const ev = leaveTarget

    // Optimistic: remove from joined set, decrement counter
    setJoinedIds(prev => { const next = new Set(prev); next.delete(ev.id); return next })
    setEvents(prev => prev.map(e =>
      e.id === ev.id ? { ...e, attendee_count: Math.max(0, (e.attendee_count || 0) - 1) } : e,
    ))

    const { error } = await leaveEvent(ev.id, user.id)
    setActionSaving(false)
    setLeaveTarget(null)

    if (error) {
      // Rollback
      setJoinedIds(prev => new Set([...prev, ev.id]))
      setEvents(prev => prev.map(e =>
        e.id === ev.id ? { ...e, attendee_count: (e.attendee_count || 0) + 1 } : e,
      ))
      setToast({ type: 'err', msg: error.message || 'Could not leave event' })
      return
    }
    setToast({ type: 'ok', msg: 'Left event' })
  }

  // Cancel flow — host only. Opens a reason picker modal first.
  const requestCancel = (eventId) => {
    const ev = events.find(e => e.id === eventId)
    if (ev) setCancelTarget(ev)
  }

  const confirmCancel = async (reason) => {
    if (!cancelTarget) return
    setActionSaving(true); setToast(null)
    const ev = cancelTarget

    const { error } = await cancelEvent(ev.id, reason)
    setActionSaving(false)
    setCancelTarget(null)

    if (error) {
      setToast({ type: 'err', msg: error.message || 'Could not cancel event' })
      return
    }
    // Drop the cancelled event from the local list (fetchUpcomingEvents
    // filters it out anyway, but refresh would be a roundtrip away)
    setEvents(prev => prev.filter(e => e.id !== ev.id))
    setToast({ type: 'ok', msg: 'Event cancelled — attendees notified' })
  }

  const visible = useMemo(() => {
    if (filter === 'joined') return events.filter(e => joinedIds.has(e.id))
    return events
  }, [events, joinedIds, filter])

  return (
    <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pt-6 pb-10"
      >
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
            fontWeight: 600, color: C.gold, margin: 0,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            Community
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h1 className="font-display" style={{
              fontSize: 24, fontWeight: 600, color: C.text,
              margin: '4px 0 0',
              letterSpacing: '-0.02em',
            }}>
              Events
            </h1>
            <button
              type="button"
              onClick={onCreateEvent}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                borderRadius: 99,
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                color: '#fff',
                border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                fontFamily: 'Inter, system-ui, sans-serif',
                boxShadow: '0 4px 14px rgba(200,169,106,0.32)',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create
            </button>
          </div>
          <p style={{
            fontSize: 13, color: C.textSub, lineHeight: 1.5,
            fontFamily: 'Inter, system-ui, sans-serif',
            margin: '6px 0 0',
          }}>
            Real-life meetups for the Reciring community.
          </p>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'upcoming', label: 'Upcoming',    count: events.length },
            { id: 'joined',   label: 'My events',   count: events.filter(e => joinedIds.has(e.id)).length },
          ].map(f => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 99,
                  background: active ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : C.white,
                  color: active ? '#fff' : C.textSub,
                  border: `1px solid ${active ? C.gold : C.border}`,
                  fontSize: 12, fontWeight: 600,
                  letterSpacing: '0.04em',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: 'pointer',
                  boxShadow: active ? '0 2px 8px rgba(200,169,106,0.25)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {f.label}
                {typeof f.count === 'number' && f.count > 0 && (
                  <span style={{
                    marginLeft: 6,
                    opacity: active ? 0.85 : 0.6,
                    fontSize: 11,
                  }}>
                    {f.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Toast */}
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: toast.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${toast.type === 'ok' ? '#BBF7D0' : '#FECACA'}`,
              fontSize: 13, fontWeight: 500,
              color: toast.type === 'ok' ? '#166534' : '#991B1B',
              fontFamily: 'Inter, system-ui, sans-serif',
              marginBottom: 14,
            }}
          >
            {toast.type === 'ok' ? '✓ ' : '⚠ '}{toast.msg}
          </motion.div>
        )}

        {/* List */}
        {loading ? (
          <p style={{ textAlign: 'center', fontSize: 13, color: C.textMuted, padding: '40px 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Loading events…
          </p>
        ) : visible.length === 0 ? (
          <EmptyState filter={filter} onCreateEvent={onCreateEvent} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visible.map(ev => (
              <EventCard
                key={ev.id}
                event={ev}
                joined={joinedIds.has(ev.id)}
                joining={joiningId === ev.id}
                isHost={user && ev.host_user_id === user.id}
                onJoin={handleJoin}
                onLeave={requestLeave}
                onCancel={requestCancel}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* Leave confirmation */}
      <ConfirmModal
        open={!!leaveTarget}
        title="Leave this event?"
        body={leaveTarget ? `You'll be removed from "${leaveTarget.title}" and a spot will open up for someone else.` : ''}
        confirmLabel={actionSaving ? 'Leaving…' : 'Leave Event'}
        confirmIntent="danger"
        busy={actionSaving}
        onCancel={() => !actionSaving && setLeaveTarget(null)}
        onConfirm={confirmLeave}
      />

      {/* Cancel host confirmation with reason picker */}
      <CancelEventModal
        open={!!cancelTarget}
        event={cancelTarget}
        busy={actionSaving}
        onCancel={() => !actionSaving && setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
    </div>
  )
}

// ── Generic two-button confirm modal ───────────────────────
function ConfirmModal({ open, title, body, confirmLabel, confirmIntent, busy, onCancel, onConfirm }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onCancel}
            style={{
              position: 'fixed', inset: 0, zIndex: 80,
              background: 'rgba(17,17,17,0.5)',
              backdropFilter: 'blur(4px)',
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 81,
              width: 'calc(100% - 32px)', maxWidth: 340,
              background: C.white,
              borderRadius: 22,
              padding: '26px 22px 22px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
            }}
          >
            <h3 style={{
              fontSize: 18, fontWeight: 600, color: C.text,
              fontFamily: 'Fraunces, Georgia, serif',
              margin: '0 0 8px', textAlign: 'center',
            }}>
              {title}
            </h3>
            <p style={{
              fontSize: 13, color: C.textSub, lineHeight: 1.55,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '0 0 20px', textAlign: 'center',
            }}>
              {body}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                style={{
                  width: '100%', padding: '13px 0',
                  borderRadius: 12, border: 'none',
                  background: confirmIntent === 'danger' ? '#DC2626' : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  color: '#fff',
                  fontSize: 14, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  boxShadow: confirmIntent === 'danger' ? '0 4px 14px rgba(220,38,38,0.32)' : '0 4px 14px rgba(200,169,106,0.32)',
                }}
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                style={{
                  width: '100%', padding: '13px 0',
                  borderRadius: 12,
                  background: C.white,
                  color: C.text,
                  border: `1.5px solid #F0ECE4`,
                  fontSize: 14, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Cancel event modal — reason picker + free-text "Other" ─
function CancelEventModal({ open, event, busy, onCancel, onConfirm }) {
  const PRESET_REASONS = ['Weather', 'Low attendance', 'Personal emergency', 'Other']
  const [selected, setSelected] = useState(PRESET_REASONS[0])
  const [otherText, setOtherText] = useState('')

  // Reset state each time the modal opens for a new event.
  useEffect(() => {
    if (open) { setSelected(PRESET_REASONS[0]); setOtherText('') }
  }, [open, event?.id])

  const finalReason = selected === 'Other' ? otherText.trim() : selected
  const canConfirm = !busy && (selected !== 'Other' || otherText.trim().length > 0)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onCancel}
            style={{
              position: 'fixed', inset: 0, zIndex: 80,
              background: 'rgba(17,17,17,0.5)',
              backdropFilter: 'blur(4px)',
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 81,
              width: 'calc(100% - 32px)', maxWidth: 360,
              background: C.white,
              borderRadius: 22,
              padding: '26px 22px 22px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
            }}
          >
            <h3 style={{
              fontSize: 18, fontWeight: 600, color: C.text,
              fontFamily: 'Fraunces, Georgia, serif',
              margin: '0 0 6px', textAlign: 'center',
            }}>
              Cancel "{event?.title}"?
            </h3>
            <p style={{
              fontSize: 13, color: C.textSub, lineHeight: 1.55,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '0 0 18px', textAlign: 'center',
            }}>
              All {event?.attendee_count || 0} attendees will be notified.
            </p>

            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: C.textSub,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '0 0 10px',
            }}>
              Reason
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {PRESET_REASONS.map(r => {
                const isSelected = selected === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelected(r)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 99,
                      background: isSelected ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : C.white,
                      color: isSelected ? '#fff' : C.textSub,
                      border: `1.5px solid ${isSelected ? C.gold : C.border}`,
                      fontSize: 12, fontWeight: 600,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {r}
                  </button>
                )
              })}
            </div>

            {selected === 'Other' && (
              <textarea
                value={otherText}
                onChange={(e) => setOtherText(e.target.value.slice(0, 200))}
                placeholder="Tell attendees what happened…"
                rows={3}
                autoFocus
                style={{
                  width: '100%', resize: 'vertical',
                  padding: '10px 12px', borderRadius: 12,
                  border: `1.5px solid ${C.border}`,
                  background: '#FAFAFA',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 13, lineHeight: 1.5,
                  outline: 'none',
                  marginBottom: 14,
                  minHeight: 64,
                }}
              />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => canConfirm && onConfirm(finalReason)}
                disabled={!canConfirm}
                style={{
                  width: '100%', padding: '13px 0',
                  borderRadius: 12, border: 'none',
                  background: canConfirm ? '#DC2626' : '#F3F4F6',
                  color: canConfirm ? '#fff' : C.textMuted,
                  fontSize: 14, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: canConfirm ? 'pointer' : 'default',
                  boxShadow: canConfirm ? '0 4px 14px rgba(220,38,38,0.32)' : 'none',
                }}
              >
                {busy ? 'Cancelling…' : 'Cancel event'}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                style={{
                  width: '100%', padding: '13px 0',
                  borderRadius: 12,
                  background: C.white,
                  color: C.text,
                  border: `1.5px solid ${C.border}`,
                  fontSize: 14, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                Keep event
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function EmptyState({ filter, onCreateEvent }) {
  // "My events" — quieter empty state since nothing for the user
  // to act on directly. Point them back to Upcoming.
  if (filter === 'joined') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 16px 40px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px', fontSize: 28,
        }}>
          🎟️
        </div>
        <p style={{
          fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6,
          fontFamily: 'Fraunces, Georgia, serif',
        }}>
          Nothing on your calendar yet
        </p>
        <p style={{
          fontSize: 13, color: C.textMuted, lineHeight: 1.55,
          fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 280, margin: '0 auto',
        }}>
          Join an event from <strong style={{ color: C.goldDark }}>Upcoming</strong> and it'll show up here.
        </p>
      </div>
    )
  }

  // "Upcoming" — primary empty state. Hero cluster + value copy +
  // example chips + prominent CTA. Designed to make the surface
  // feel alive even with zero events.
  return (
    <div style={{ padding: '4px 4px 32px' }}>
      {/* Hero icon cluster */}
      <div style={{
        position: 'relative',
        margin: '0 auto 18px',
        width: 160, height: 140,
      }}>
        {/* Soft radial glow background */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at center, rgba(200,169,106,0.20) 0%, rgba(200,169,106,0.04) 55%, transparent 75%)',
        }} />
        {/* Center hero */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 78, height: 78, borderRadius: '50%',
          background: `linear-gradient(135deg, ${C.goldBg}, #F7EBCF)`,
          border: `2px solid ${C.goldLight}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 38, lineHeight: 1,
          boxShadow: '0 8px 24px rgba(200,169,106,0.28), inset 0 1px 0 rgba(255,255,255,0.6)',
        }}>
          🤝
        </div>
        {/* Decorative satellite emojis — give a sense of what events are */}
        <span style={{
          position: 'absolute', top: 4, right: 14, fontSize: 26,
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.1))',
          transform: 'rotate(-8deg)',
        }}>🏐</span>
        <span style={{
          position: 'absolute', bottom: 8, left: 6, fontSize: 24,
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.1))',
          transform: 'rotate(10deg)',
        }}>🧘</span>
        <span style={{
          position: 'absolute', bottom: 14, right: 2, fontSize: 24,
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.1))',
          transform: 'rotate(6deg)',
        }}>☕</span>
        <span style={{
          position: 'absolute', top: 10, left: 0, fontSize: 22,
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.1))',
          transform: 'rotate(-12deg)',
        }}>📚</span>
      </div>

      {/* Heading */}
      <h2 style={{
        fontSize: 20, fontWeight: 600, color: C.text,
        fontFamily: 'Fraunces, Georgia, serif',
        textAlign: 'center', margin: '0 0 8px',
        letterSpacing: '-0.01em',
      }}>
        Bring the community offline
      </h2>
      <p style={{
        fontSize: 13.5, color: C.textSub, lineHeight: 1.6,
        fontFamily: 'Inter, system-ui, sans-serif',
        textAlign: 'center', maxWidth: 300, margin: '0 auto 18px',
      }}>
        Real-life meetups are how Reciring becomes lasting friendships, partnerships, and trusted intros. Anyone can host.
      </p>

      {/* Example chips */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        justifyContent: 'center', marginBottom: 22,
        padding: '0 8px',
      }}>
        {[
          '🏐 Pickup sports',
          '☕ Coffee chats',
          '🧘 Yoga session',
          '📚 Study group',
          '🚀 Founder mixer',
        ].map(label => (
          <span
            key={label}
            style={{
              fontSize: 11, fontWeight: 600,
              color: C.goldDark,
              background: C.white,
              border: `1px solid ${C.goldLight}`,
              borderRadius: 99,
              padding: '5px 11px',
              fontFamily: 'Inter, system-ui, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Prominent CTA */}
      <button
        type="button"
        onClick={onCreateEvent}
        className="active:scale-[0.98]"
        style={{
          display: 'block',
          width: '100%',
          maxWidth: 320, margin: '0 auto',
          padding: '14px 0',
          borderRadius: 14,
          background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
          color: '#fff', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: '0 8px 24px rgba(200,169,106,0.40)',
          transition: 'transform 0.12s ease',
        }}
      >
        Host the first event
      </button>

      <p style={{
        fontSize: 11, color: C.textMuted, marginTop: 12,
        textAlign: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        Takes under a minute. Free for everyone.
      </p>
    </div>
  )
}
