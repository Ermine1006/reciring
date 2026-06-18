import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import {
  fetchEventById,
  fetchEventAttendees,
  fetchMyJoinedEventIds,
  joinEvent,
  leaveEvent,
  cancelEvent,
} from '../lib/events'
import {
  fetchEventMessages,
  sendEventMessage,
  subscribeEventMessages,
} from '../lib/eventMessages'
import { categoryEmoji } from '../data/eventCategories'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'

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
  success:   '#16A34A',
  danger:    '#DC2626',
}

function formatLongDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const HOST_TYPE_LABEL = {
  individual: '',
  club:       'Club',
  business:   'Sponsor',
}

/**
 * Full-screen Event Detail page. Mounted by App.jsx when an event card
 * is tapped. Self-contained: handles its own loads, realtime sub, join/
 * leave/cancel actions, group thread, and back navigation.
 */
export default function EventDetailPage({ eventId, onBack, onEdit }) {
  const { user } = useAuth()

  const [event, setEvent]       = useState(null)
  const [attendees, setAttendees] = useState([])
  const [joined, setJoined]     = useState(false)
  const [loading, setLoading]   = useState(true)
  const [joinPending, setJoinPending] = useState(false)
  const [toast, setToast]       = useState(null)

  // Chat
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatBottomRef = useRef(null)
  const chatSectionRef = useRef(null)

  const isHost = user && event && event.host_user_id === user.id
  const spotsLeft = event ? Math.max(0, (event.max_attendees || 0) - (event.attendee_count || 0)) : 0
  const isFull = event ? (spotsLeft === 0 && !joined) : false
  const isCancelled = event?.status === 'cancelled'
  const isCompleted = event?.status === 'completed'
  const sponsorBadge = event ? HOST_TYPE_LABEL[event.host_type] : ''

  // ── Initial load ──────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    const [
      { data: ev },
      { data: atts },
      { data: joinedSet },
      { data: msgs },
    ] = await Promise.all([
      fetchEventById(eventId),
      fetchEventAttendees(eventId),
      user ? fetchMyJoinedEventIds(user.id) : Promise.resolve({ data: new Set() }),
      fetchEventMessages(eventId),
    ])
    setEvent(ev)
    setAttendees(atts || [])
    setJoined(Boolean(user && joinedSet?.has?.(eventId)))
    setMessages(msgs || [])
    setLoading(false)
  }, [eventId, user?.id])

  useEffect(() => { refresh() }, [refresh])

  // ── Realtime chat subscription ────────────────────────────
  useEffect(() => {
    if (!eventId || !user) return
    const channel = subscribeEventMessages(eventId, async (row) => {
      // Skip if we already have it (our own optimistic add)
      setMessages(prev => {
        if (prev.some(m => m.id === row.id)) return prev
        // Synthesize a minimal sender object — the realtime payload
        // doesn't include the joined profile. UI will show "Member"
        // until a refresh; acceptable for now.
        return [
          ...prev,
          {
            id:         row.id,
            event_id:   row.event_id,
            sender_id:  row.sender_user_id,
            body:       row.body,
            created_at: row.created_at,
            sender_name:   row.sender_user_id === user.id ? 'You' : 'Member',
            sender_avatar: null,
          },
        ]
      })
    })
    return () => { if (channel) channel.unsubscribe() }
  }, [eventId, user?.id])

  // Auto-scroll to bottom of chat when messages change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // ── Actions ───────────────────────────────────────────────
  const handleJoin = async () => {
    if (!user || !event) return
    setJoinPending(true); setToast(null)
    // Optimistic
    setJoined(true)
    setEvent(prev => ({ ...prev, attendee_count: (prev.attendee_count || 0) + 1 }))
    const { error } = await joinEvent(event.id, user.id)
    setJoinPending(false)
    if (error) {
      setJoined(false)
      setEvent(prev => ({ ...prev, attendee_count: Math.max(0, (prev.attendee_count || 0) - 1) }))
      setToast({ type: 'err', msg: error.message || 'Could not join' })
      return
    }
    setToast({ type: 'ok', msg: "You're in. See you there." })
    // Pull the attendee row in so the list updates
    const { data: atts } = await fetchEventAttendees(event.id)
    setAttendees(atts || [])
  }

  const handleLeave = async () => {
    if (!user || !event) return
    if (!window.confirm(`Leave "${event.title}"?`)) return
    setJoinPending(true); setToast(null)
    setJoined(false)
    setEvent(prev => ({ ...prev, attendee_count: Math.max(0, (prev.attendee_count || 0) - 1) }))
    const { error } = await leaveEvent(event.id, user.id)
    setJoinPending(false)
    if (error) {
      setJoined(true)
      setEvent(prev => ({ ...prev, attendee_count: (prev.attendee_count || 0) + 1 }))
      setToast({ type: 'err', msg: error.message || 'Could not leave' })
      return
    }
    setToast({ type: 'ok', msg: 'Left event' })
    setAttendees(prev => prev.filter(a => a.user_id !== user.id))
  }

  const handleCancel = async () => {
    if (!event) return
    const reason = window.prompt('Reason for cancelling? (Weather / Low attendance / Personal emergency / Other)')
    if (reason === null) return // user dismissed prompt
    const { error } = await cancelEvent(event.id, reason || 'No reason provided')
    if (error) { setToast({ type: 'err', msg: error.message || 'Cancel failed' }); return }
    setToast({ type: 'ok', msg: 'Event cancelled — attendees notified' })
    setEvent(prev => ({ ...prev, status: 'cancelled', cancellation_reason: reason }))
  }

  const handleSendMessage = async () => {
    const body = chatInput.trim()
    if (!body || !user || !event) return
    setChatSending(true)
    setChatInput('')
    const { data, error } = await sendEventMessage(event.id, user.id, body)
    setChatSending(false)
    if (error) {
      setToast({ type: 'err', msg: error.message || 'Could not send' })
      setChatInput(body) // restore
      return
    }
    // Optimistic add — realtime will dedupe by id
    if (data) {
      setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data])
    }
  }

  const scrollToChat = () => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Loading event…
        </p>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4', padding: 24 }}>
        <button onClick={onBack} style={backButtonStyle}>← Back</button>
        <p style={{ textAlign: 'center', marginTop: 80, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Event not found or no longer available.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        style={{ padding: '14px 18px 32px' }}
      >
        {/* Back row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button onClick={onBack} style={backButtonStyle}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          {isCancelled && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: '#fff', background: C.danger,
              borderRadius: 99, padding: '5px 12px',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Cancelled
            </span>
          )}
          {isCompleted && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: C.textSub, background: '#F3F4F6',
              border: `1px solid ${C.border}`,
              borderRadius: 99, padding: '5px 12px',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Completed
            </span>
          )}
        </div>

        {/* Header card */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
            <span style={{ fontSize: 40, lineHeight: 1, flexShrink: 0 }}>
              {categoryEmoji(event.category)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                fontSize: 20, fontWeight: 700, color: C.text,
                fontFamily: 'Inter, system-ui, sans-serif',
                margin: '0 0 4px', lineHeight: 1.3,
              }}>
                {event.title}
              </h1>
              <p style={{
                fontSize: 13, color: C.gold, fontWeight: 600,
                fontFamily: 'Inter, system-ui, sans-serif',
                margin: 0,
              }}>
                {event.category}
              </p>
            </div>
          </div>

          {/* Meta rows */}
          <MetaRow icon={<CalendarIcon />} label={formatLongDate(event.start_at)} />
          {event.location && <MetaRow icon={<PinIcon />} label={event.location} />}
          <MetaRow
            icon={<UsersIcon />}
            label={isCancelled
              ? `Cancelled${event.cancellation_reason ? ` · ${event.cancellation_reason}` : ''}`
              : `${event.attendee_count || 0} / ${event.max_attendees} attending${isFull ? ' · Full' : ` · ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`}`}
            danger={isCancelled || isFull}
          />
        </section>

        {/* Host */}
        <section style={cardStyle}>
          <p style={sectionLabelStyle}>Hosted by</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: C.goldDark, flexShrink: 0,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              {(event.host_display_name || '?').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 14, fontWeight: 600, color: C.text,
                fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
              }}>
                {event.host_display_name}
              </p>
              {sponsorBadge && (
                <p style={{
                  fontSize: 11, color: C.goldDark, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif', margin: '2px 0 0',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {sponsorBadge}
                </p>
              )}
            </div>
          </div>

          {!isHost && !isCancelled && (
            <button
              type="button"
              onClick={scrollToChat}
              style={{
                width: '100%', padding: '11px 0',
                borderRadius: 10,
                background: C.white,
                color: C.goldDark,
                border: `1.5px solid ${C.goldLight}`,
                fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
                fontFamily: 'Inter, system-ui, sans-serif',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.96 9.96 0 01-4.418-1.026L3 20l1.026-4.418A8.964 8.964 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Message Host
            </button>
          )}
        </section>

        {/* Description */}
        {event.description && (
          <section style={cardStyle}>
            <p style={sectionLabelStyle}>About this event</p>
            <p style={{
              fontSize: 14, lineHeight: 1.6, color: C.text,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: 0, whiteSpace: 'pre-wrap',
            }}>
              {event.description}
            </p>
          </section>
        )}

        {/* Attendees */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ ...sectionLabelStyle, margin: 0 }}>
              Participants ({event.attendee_count || 0}/{event.max_attendees})
            </p>
            {!isCancelled && (
              <p style={{
                fontSize: 11, fontWeight: 600,
                color: isFull ? C.danger : C.textMuted,
                fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
              }}>
                {isFull ? 'Full' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`}
              </p>
            )}
          </div>
          {attendees.length === 0 ? (
            <p style={{
              fontSize: 13, color: C.textMuted, lineHeight: 1.55,
              fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
            }}>
              No one's joined yet — be the first.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {attendees.map(a => {
                const seed = resolveAvatarSeed(a.avatar_url) || a.user_id
                return (
                  <li key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AnonymousAvatar seed={seed} size={32} />
                    <p style={{
                      fontSize: 14, color: C.text, fontWeight: 500,
                      fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
                    }}>
                      {a.name}
                      {a.user_id === user?.id && (
                        <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>· You</span>
                      )}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Toast */}
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '10px 14px', borderRadius: 12,
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

        {/* Primary action — hidden for cancelled or completed events */}
        {!isCancelled && !isCompleted && (
          <div style={{ marginBottom: 16 }}>
            {isHost ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onEdit?.(event.id)}
                  style={{
                    flex: 1, padding: '14px 0',
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                    color: '#fff',
                    border: 'none',
                    fontSize: 14, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(200,169,106,0.32)',
                  }}
                >
                  Edit event
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    flex: 1, padding: '14px 0',
                    borderRadius: 12,
                    background: C.white, color: C.danger,
                    border: `1.5px solid ${C.danger}`,
                    fontSize: 14, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  Cancel event
                </button>
              </div>
            ) : joined ? (
              <button
                type="button"
                onClick={handleLeave}
                disabled={joinPending}
                style={{
                  width: '100%', padding: '14px 0',
                  borderRadius: 12,
                  background: C.success, color: '#fff',
                  border: 'none',
                  fontSize: 14, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: joinPending ? 'default' : 'pointer',
                  opacity: joinPending ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(22,163,74,0.28)',
                }}
              >
                ✓ Joined — tap to leave
              </button>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                disabled={joinPending || isFull}
                style={{
                  width: '100%', padding: '14px 0',
                  borderRadius: 12,
                  background: isFull ? '#F3F4F6' : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  color: isFull ? C.textMuted : '#fff',
                  border: 'none',
                  fontSize: 14, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: (joinPending || isFull) ? 'default' : 'pointer',
                  opacity: joinPending ? 0.7 : 1,
                  boxShadow: isFull ? 'none' : '0 8px 24px rgba(200,169,106,0.32)',
                }}
              >
                {isFull ? 'Event full' : joinPending ? 'Joining…' : 'Join event'}
              </button>
            )}
          </div>
        )}

        {/* Group thread */}
        <section ref={chatSectionRef} style={{ ...cardStyle, padding: 0 }}>
          <div style={{ padding: '18px 18px 10px' }}>
            <p style={sectionLabelStyle}>Discussion</p>
            <p style={{
              fontSize: 12, color: C.textMuted, lineHeight: 1.5,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '4px 0 0',
            }}>
              {joined || isHost
                ? 'Ask the host about meeting point, parking, what to bring. Visible to all attendees.'
                : 'Join the event to participate in the discussion.'}
            </p>
          </div>

          <div
            style={{
              maxHeight: 360, overflowY: 'auto',
              padding: '0 18px',
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
              background: '#FAFAF8',
            }}
          >
            {messages.length === 0 ? (
              <p style={{
                fontSize: 13, color: C.textMuted,
                fontFamily: 'Inter, system-ui, sans-serif',
                textAlign: 'center', padding: '24px 0',
              }}>
                No messages yet. {joined || isHost ? 'Start the discussion.' : ''}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: '14px 0', margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map(m => {
                  const isMe = m.sender_id === user?.id
                  const isHostMsg = event && m.sender_id === event.host_user_id
                  const avatarSeed = resolveAvatarSeed(m.sender_avatar) || m.sender_id
                  return (
                    <li key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0, marginTop: 2 }}>
                        <AnonymousAvatar seed={avatarSeed} size={28} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700, color: C.text,
                            fontFamily: 'Inter, system-ui, sans-serif',
                          }}>
                            {isMe ? 'You' : m.sender_name}
                          </span>
                          {isHostMsg && (
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              letterSpacing: '0.1em', textTransform: 'uppercase',
                              color: C.goldDark, background: C.goldBg,
                              border: `1px solid ${C.goldLight}`,
                              borderRadius: 4, padding: '1px 6px',
                              fontFamily: 'Inter, system-ui, sans-serif',
                            }}>
                              Host
                            </span>
                          )}
                          <span style={{
                            fontSize: 10, color: C.textMuted,
                            fontFamily: 'Inter, system-ui, sans-serif',
                          }}>
                            {formatTime(m.created_at)}
                          </span>
                        </div>
                        <p style={{
                          fontSize: 13.5, color: C.text, lineHeight: 1.5,
                          fontFamily: 'Inter, system-ui, sans-serif',
                          margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                        }}>
                          {m.body}
                        </p>
                      </div>
                    </li>
                  )
                })}
                <div ref={chatBottomRef} />
              </ul>
            )}
          </div>

          {(joined || isHost) && !isCancelled && !isCompleted && (
            <div style={{ display: 'flex', gap: 8, padding: '12px 14px' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }}
                placeholder="Message…"
                disabled={chatSending}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: `1.5px solid ${C.border}`,
                  background: '#FAFAFA',
                  fontSize: 14,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={chatSending || !chatInput.trim()}
                style={{
                  flexShrink: 0,
                  width: 44, height: 44, borderRadius: 12,
                  background: chatInput.trim() ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : '#E5E7EB',
                  color: chatInput.trim() ? '#fff' : C.textMuted,
                  border: 'none',
                  cursor: chatInput.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label="Send"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          )}
        </section>
      </motion.div>
    </div>
  )
}

// ── Small visual atoms ─────────────────────────────────────

const cardStyle = {
  background: '#FFFFFF',
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: 18,
  marginBottom: 12,
}

const sectionLabelStyle = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
  textTransform: 'uppercase', color: C.gold,
  fontFamily: 'Inter, system-ui, sans-serif',
  margin: '0 0 10px',
}

const backButtonStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'none', border: 'none', padding: 0,
  color: C.goldDark, cursor: 'pointer',
  fontSize: 13, fontWeight: 600,
  fontFamily: 'Inter, system-ui, sans-serif',
}

function MetaRow({ icon, label, danger }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 0',
    }}>
      <span style={{
        color: danger ? C.danger : C.gold,
        flexShrink: 0, display: 'flex',
      }}>{icon}</span>
      <p style={{
        fontSize: 13.5, fontWeight: 500,
        color: danger ? C.danger : C.text,
        fontFamily: 'Inter, system-ui, sans-serif',
        margin: 0, lineHeight: 1.4,
      }}>
        {label}
      </p>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}
