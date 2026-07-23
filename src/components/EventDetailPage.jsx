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
import { WEB_ORIGIN } from '../lib/platform'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'
import { sendEventRegistrationEmail, sendEventUnregisterEmail, notifyEventCancellation } from '../lib/email'
import EventModeSection from './EventModeSection'
import EventRecapPage from './EventRecapPage'
import PendingConfirmationsBanner from './PendingConfirmationsBanner'
import { listEncountersForEvent } from '../lib/eventEncounters'

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

// Relative join time for the host's participants list. Shows "just now"
// under a minute, otherwise "3h ago" / "2d ago" / an absolute date past
// a week — the host mostly cares about who signed up recently.
function formatJoinedTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  const [copiedEmails, setCopiedEmails] = useState(false)
  // 'overview' (default) | 'event_mode' | 'recap'
  //   • event_mode: attendee list with "I met this person" flow.
  //   • recap:      post-event summary + opportunity recall.
  // The toggle is only visible when useful — see canEnterEventMode
  // and canOpenRecap below.
  const [viewMode, setViewMode] = useState('overview')
  const [myEncounters, setMyEncounters] = useState([])

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
    // Fetch the event first so we can decide whether to include
    // participant contact info (host-only) in the attendees select.
    // Loading everything else is still parallel.
    const [
      { data: ev },
      { data: joinedSet },
      { data: msgs },
    ] = await Promise.all([
      fetchEventById(eventId),
      user ? fetchMyJoinedEventIds(user.id) : Promise.resolve({ data: new Set() }),
      fetchEventMessages(eventId),
    ])
    const includeContact = Boolean(user && ev && ev.host_user_id === user.id)
    const { data: atts } = await fetchEventAttendees(eventId, { includeContact })
    setEvent(ev)
    setAttendees(atts || [])
    setJoined(Boolean(user && joinedSet?.has?.(eventId)))
    setMessages(msgs || [])

    // Encounters for the Event Networking Memory feature. RLS-scoped
    // to the current user — no host/attendee peeks at private notes.
    if (user) {
      const { data: encs } = await listEncountersForEvent(eventId)
      setMyEncounters(encs || [])
    } else {
      setMyEncounters([])
    }

    setLoading(false)
  }, [eventId, user?.id])

  // Local reload used by Event Mode after "I met" / edit / undo.
  async function reloadEncounters() {
    if (!eventId || !user) return
    const { data: encs } = await listEncountersForEvent(eventId)
    setMyEncounters(encs || [])
  }

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
    // Fire-and-forget registration confirmation email — server loads
    // the event, resolves the caller's email, and renders the template.
    sendEventRegistrationEmail({ eventId: event.id })
      .catch(err => console.warn('[ReciRing] registration email failed:', err?.message))
    // Pull the attendee row in so the list updates. The joiner is not
    // the host (they're joining someone else's event), so contact is
    // never included here.
    const { data: atts } = await fetchEventAttendees(event.id, { includeContact: isHost })
    setAttendees(atts || [])
  }

  // Share the event via the system share sheet (beta fb8 — testers wanted
  // to send events over Messages / WhatsApp / Instagram). navigator.share
  // opens the native sheet in both mobile Safari and the Capacitor webview;
  // desktop browsers without it fall back to copying the link. The
  // ?event= deep link is the same one the reminder emails already use.
  const handleShare = async () => {
    if (!event) return
    const url = `${WEB_ORIGIN}/?event=${event.id}`
    if (navigator.share) {
      // A rejected promise here usually just means the user closed the sheet.
      try { await navigator.share({ title: event.title, text: `${event.title} — join me on Mutu`, url }) } catch {}
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setToast({ type: 'ok', msg: 'Event link copied' })
    } catch {
      setToast({ type: 'err', msg: url })
    }
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
    sendEventUnregisterEmail({ eventId: event.id })
      .catch(err => console.warn('[ReciRing] unregister email failed:', err?.message))
    setAttendees(prev => prev.filter(a => a.user_id !== user.id))
  }

  const handleCopyEmails = async () => {
    const emails = attendees.map(a => a.email).filter(Boolean).join(', ')
    if (!emails) return
    try {
      await navigator.clipboard.writeText(emails)
      setCopiedEmails(true)
      setTimeout(() => setCopiedEmails(false), 2000)
    } catch {
      // Fallback: legacy execCommand for older iOS Safari + insecure origins
      const ta = document.createElement('textarea')
      ta.value = emails
      ta.style.position = 'fixed'; ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setCopiedEmails(true); setTimeout(() => setCopiedEmails(false), 2000) }
      catch { setToast({ type: 'err', msg: 'Copy failed — select emails manually' }) }
      document.body.removeChild(ta)
    }
  }

  const handleCancel = async () => {
    if (!event) return
    const reason = window.prompt('Reason for cancelling? (Weather / Low attendance / Personal emergency / Other)')
    if (reason === null) return // user dismissed prompt
    const { error } = await cancelEvent(event.id, reason || 'No reason provided')
    if (error) { setToast({ type: 'err', msg: error.message || 'Cancel failed' }); return }
    setToast({ type: 'ok', msg: 'Event cancelled — attendees notified' })
    setEvent(prev => ({ ...prev, status: 'cancelled', cancellation_reason: reason }))
    // Fan out the cancellation email to remaining attendees. The DB
    // trigger already delivered an in-app notification; this covers
    // people who mainly rely on email. Fire-and-forget: the DB state
    // is what matters — email is best-effort.
    notifyEventCancellation(event.id).catch(err =>
      console.warn('[ReciRing] cancellation email fan-out failed:', err?.message)
    )
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

        {/* Incoming confirmation requests — surfaces even when the
            user hasn't opened Event Mode yet. Visible for members
            + host alike. */}
        {(joined || isHost) && !isCancelled && (
          <PendingConfirmationsBanner
            eventId={event.id}
            onAcceptedOrDeclined={reloadEncounters}
          />
        )}

        {/* Event Mode / Recap toggle. Visible when the user is
            joined (or the host) and the event isn't cancelled. In
            the prototype we don't gate by event time — the operator
            can flip into Event Mode manually to test the flow. */}
        {(joined || isHost) && !isCancelled && (
          <div style={{
            display: 'flex', gap: 4, marginBottom: 14,
            background: '#F2EEE5', padding: 3, borderRadius: 12,
          }}>
            {[
              { id: 'overview',   label: 'Overview' },
              { id: 'event_mode', label: 'Event Mode' },
              { id: 'recap',      label: `Your Recap${myEncounters.length ? ` · ${myEncounters.length}` : ''}` },
            ].map(t => {
              const active = viewMode === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setViewMode(t.id)}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 9,
                    background: active ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : 'transparent',
                    color: active ? '#fff' : C.textSub,
                    border: 'none',
                    fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.02em',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    cursor: 'pointer',
                    boxShadow: active ? '0 1px 4px rgba(200,169,106,0.35)' : 'none',
                    transition: 'all 0.18s',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Recap mode replaces the entire overview body. */}
        {viewMode === 'recap' && (
          <EventRecapPage
            eventId={event.id}
            event={event}
            allAttendees={attendees}
            onBackToOverview={() => setViewMode('overview')}
          />
        )}

        {/* Event Mode appears as a top card, keeps the rest below
            so people can still see event details while logging. */}
        {viewMode === 'event_mode' && (
          <EventModeSection
            eventId={event.id}
            attendees={attendees}
            encounters={myEncounters}
            currentUserId={user?.id}
            onEncountersChanged={reloadEncounters}
          />
        )}

        {/* Header card + rest of the normal overview render only
            when we're not in dedicated recap mode. */}
        {viewMode !== 'recap' && (
          <>
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
            {/* Share (fb8) */}
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share event"
              className="active:scale-95"
              style={{
                flexShrink: 0,
                width: 36, height: 36, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: C.goldBg,
                border: `1px solid ${C.goldLight}`,
                cursor: 'pointer',
                transition: 'transform 0.1s',
              }}
            >
              {/* iOS-style share glyph */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.goldDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="M8 7l4-4 4 4" />
                <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              </svg>
            </button>
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

        {/* Participants — three cases:
              1. Host view → "Manage participants" with contact details
              2. Non-host + private list → count only, names withheld
              3. Non-host + public list → avatars + first names           */}
        {(() => {
          const isPrivate = event.attendee_visibility === 'private'
          const attendeeCount = event.attendee_count || 0
          const spotsLine = isFull
            ? 'Full'
            : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`

          // ── Host view: full contact list ──────────────────────
          if (isHost) {
            return (
              <section style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <p style={{ ...sectionLabelStyle, margin: 0 }}>
                    Manage participants ({attendeeCount}/{event.max_attendees})
                  </p>
                  {!isCancelled && (
                    <p style={{
                      fontSize: 11, fontWeight: 600,
                      color: isFull ? C.danger : C.textMuted,
                      fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
                    }}>
                      {spotsLine}
                    </p>
                  )}
                </div>

                {attendees.length === 0 ? (
                  <p style={{
                    fontSize: 13, color: C.textMuted, lineHeight: 1.55,
                    fontFamily: 'Inter, system-ui, sans-serif', margin: '12px 0 0',
                  }}>
                    No one's joined yet.
                  </p>
                ) : (
                  <>
                    {/* Copy emails action */}
                    {attendees.some(a => a.email) && (
                      <button
                        type="button"
                        onClick={handleCopyEmails}
                        style={{
                          margin: '10px 0 14px',
                          padding: '8px 14px',
                          background: C.goldBg,
                          border: `1.5px solid ${C.goldLight}`,
                          borderRadius: 999,
                          color: C.goldDark,
                          fontSize: 12, fontWeight: 600,
                          fontFamily: 'Inter, system-ui, sans-serif',
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        {copiedEmails ? '✓ Copied' : `📋 Copy ${attendees.filter(a => a.email).length} emails`}
                      </button>
                    )}

                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {attendees.map(a => {
                        const seed = resolveAvatarSeed(a.avatar_url) || a.user_id
                        return (
                          <li key={a.user_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <AnonymousAvatar seed={seed} size={36} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{
                                fontSize: 14, color: C.text, fontWeight: 600,
                                fontFamily: 'Inter, system-ui, sans-serif',
                                margin: 0, lineHeight: 1.3,
                              }}>
                                {a.name}
                                {a.program && (
                                  <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>
                                    · {a.program}
                                  </span>
                                )}
                                {a.user_id === user?.id && (
                                  <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>· You</span>
                                )}
                              </p>
                              {a.email && (
                                <a
                                  href={`mailto:${a.email}`}
                                  style={{
                                    display: 'inline-block',
                                    fontSize: 12, color: C.goldDark,
                                    fontFamily: 'Inter, system-ui, sans-serif',
                                    textDecoration: 'none',
                                    marginTop: 2,
                                    wordBreak: 'break-all',
                                  }}
                                >
                                  {a.email}
                                </a>
                              )}
                              <p style={{
                                fontSize: 11, color: C.textMuted,
                                fontFamily: 'Inter, system-ui, sans-serif',
                                margin: '2px 0 0',
                              }}>
                                Joined {formatJoinedTime(a.joined_at)}
                              </p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>

                    <p style={{
                      marginTop: 14,
                      fontSize: 11, color: C.textMuted, lineHeight: 1.5,
                      fontFamily: 'Inter, system-ui, sans-serif',
                    }}>
                      Emails are visible only to the host for event coordination.
                    </p>
                  </>
                )}
              </section>
            )
          }

          // ── Non-host + private: count only ────────────────────
          if (isPrivate) {
            return (
              <section style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ ...sectionLabelStyle, margin: 0 }}>Participants</p>
                  {!isCancelled && (
                    <p style={{
                      fontSize: 11, fontWeight: 600,
                      color: isFull ? C.danger : C.textMuted,
                      fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
                    }}>
                      {spotsLine}
                    </p>
                  )}
                </div>
                <p style={{
                  fontSize: 15, color: C.text, fontWeight: 500,
                  fontFamily: 'Inter, system-ui, sans-serif', margin: '0 0 6px',
                }}>
                  🔒 {attendeeCount} {attendeeCount === 1 ? 'person' : 'people'} attending
                </p>
                <p style={{
                  fontSize: 12, color: C.textMuted, lineHeight: 1.55,
                  fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
                }}>
                  The host has set this event's attendee list to private.
                </p>
              </section>
            )
          }

          // ── Non-host + public: avatars + first names ──────────
          return (
            <section style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ ...sectionLabelStyle, margin: 0 }}>
                  Participants ({attendeeCount}/{event.max_attendees})
                </p>
                {!isCancelled && (
                  <p style={{
                    fontSize: 11, fontWeight: 600,
                    color: isFull ? C.danger : C.textMuted,
                    fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
                  }}>
                    {spotsLine}
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
          )
        })()}

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
          </>
        )}
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
