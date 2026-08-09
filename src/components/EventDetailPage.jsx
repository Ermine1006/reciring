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
  setEventChatPublic,
} from '../lib/events'
import {
  fetchEventMessages,
  sendEventMessage,
  subscribeEventMessages,
} from '../lib/eventMessages'
import { categoryEmoji } from '../data/eventCategories'
import AnonymousAvatar from './AnonymousAvatar'
import EventSharePoster from './EventSharePoster'
import EventJoinIntentModal from './EventJoinIntentModal'
import { resolveAvatarSeed } from './SettingsPage'
import { sendEventRegistrationEmail, sendEventUnregisterEmail, notifyEventCancellation } from '../lib/email'
import EventModeSection from './EventModeSection'
import EventManagePage from './EventManagePage'
import EventMarketplace from './EventMarketplace'
import EventCover from './EventCover'
import EventRecapPage from './EventRecapPage'
import PendingConfirmationsBanner from './PendingConfirmationsBanner'
import { listEncountersForEvent } from '../lib/eventEncounters'
import { fetchConnections } from '../lib/relationships'
import { fetchMarketplaceFeed, fetchMyMarketplacePosts } from '../lib/marketplace'

const C = {
  gold:      '#C9A33B',
  goldDark:  '#A6822A',
  goldLight: '#E8D9A7',
  goldBg:    '#F8F3E5',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#F0ECE4',
  success:   '#2E6B4F',
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
export default function EventDetailPage({ eventId, onBack, onEdit, onPrepare, onOpenMatch, initialViewMode, cameFromPromo = false, onJoined }) {
  const { user, profile } = useAuth()

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
  const [viewMode, setViewMode] = useState(initialViewMode || 'overview')
  const [myEncounters, setMyEncounters] = useState([])
  // People I already know (connections), for "who you know is attending" and
  // ordering the Who-did-you-meet picker. peerId → context label.
  const [knownContext, setKnownContext] = useState(new Map())
  // Compact Event Board preview + lifecycle CTA state.
  const [boardSharedCount, setBoardSharedCount] = useState(0)  // # attendees who posted
  const [hasPrepared, setHasPrepared] = useState(false)         // viewer has an event post

  // The view this page opened on (captured once). If you deep-linked straight
  // into Recap from My Networking, "entryView" is 'recap'.
  const [entryView] = useState(initialViewMode || 'overview')

  // Back peels one layer. From Overview — or from the view you deep-linked
  // straight into — it exits to the previous page. From any OTHER sub-view you
  // navigated to via the tabs, it returns to Overview first.
  const handleBack = () => {
    if (viewMode === 'overview' || viewMode === entryView) onBack?.()
    else setViewMode('overview')
  }

  // Chat
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatBottomRef = useRef(null)
  const chatSectionRef = useRef(null)
  const eventModeRef = useRef(null)

  const isHost = user && event && event.host_user_id === user.id
  const spotsLeft = event ? Math.max(0, (event.max_attendees || 0) - (event.attendee_count || 0)) : 0
  const isFull = event ? (spotsLeft === 0 && !joined) : false
  const isCancelled = event?.status === 'cancelled'
  const isCompleted = event?.status === 'completed'
  // Who can read/post in the discussion: attendees, the host, or anyone once
  // the host has opened the chat to the public.
  const canChat = joined || isHost || Boolean(event?.chat_public)
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
      // Connections (matched / revealed / chatted, not yet met) — used to
      // surface "people you know are attending" and to order the picker.
      const { data: conns } = await fetchConnections(user.id)
      setKnownContext(new Map((conns || []).map(c => [c.peerId, c.context])))
      // Event Board summary for the compact preview: how many attendees shared
      // a post, and whether the viewer has already prepared one.
      const [{ data: feed }, { data: mine }] = await Promise.all([
        fetchMarketplaceFeed(eventId, user.id),
        fetchMyMarketplacePosts(eventId, user.id),
      ])
      const sharers = new Set((feed || []).map(p => p.user_id))
      if (mine && mine.length) sharers.add(user.id)
      setBoardSharedCount(sharers.size)
      setHasPrepared(Boolean(mine && mine.length))
    } else {
      setMyEncounters([])
      setKnownContext(new Map())
      setBoardSharedCount(0)
      setHasPrepared(false)
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

  // When Event Mode opens (e.g. tapping "See who" on the people-you-know line),
  // scroll the attendee list into view — it renders above the current scroll
  // position, so without this the page looks unchanged.
  useEffect(() => {
    if (viewMode !== 'event_mode') return
    const id = requestAnimationFrame(() =>
      eventModeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => cancelAnimationFrame(id)
  }, [viewMode])

  // Auto-scroll to bottom of chat when messages change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // ── Actions ───────────────────────────────────────────────
  // Tapping "Join event" opens the intent sheet first (need/offer for this
  // event); the sheet's confirm runs the real join below.
  const [showJoinIntent, setShowJoinIntent] = useState(false)

  const handleJoin = async () => {
    if (!user || !event) return { error: null }
    setJoinPending(true); setToast(null)
    // Optimistic
    setJoined(true)
    setEvent(prev => ({ ...prev, attendee_count: (prev.attendee_count || 0) + 1 }))
    const { error } = await joinEvent(event.id, user.id)
    setJoinPending(false)
    if (error) {
      setJoined(false)
      setEvent(prev => ({ ...prev, attendee_count: Math.max(0, (prev.attendee_count || 0) - 1) }))
      return { error }
    }
    // The sheet shows the "You're going." confirmation itself; no toast here.
    // Attribute the acquisition funnel when this event was opened from a
    // Discover promo card (best-effort; parent decides whether to log).
    onJoined?.()
    // Fire-and-forget registration confirmation email — server loads
    // the event, resolves the caller's email, and renders the template.
    sendEventRegistrationEmail({ eventId: event.id })
      .catch(err => console.warn('[ReciRing] registration email failed:', err?.message))
    // Pull the attendee row in so the list updates. The joiner is not
    // the host (they're joining someone else's event), so contact is
    // never included here.
    const { data: atts } = await fetchEventAttendees(event.id, { includeContact: isHost })
    setAttendees(atts || [])
    return { error: null }
  }

  // Share the event via the system share sheet (beta fb8 — testers wanted
  // to send events over Messages / WhatsApp / Instagram). navigator.share
  // opens the native sheet in both mobile Safari and the Capacitor webview;
  // The share button opens a poster sheet (EventSharePoster) rather than
  // firing navigator.share directly: sharing a generated image lets people
  // post the event to their Instagram story, which a bare link cannot (fb8).
  const [showShare, setShowShare] = useState(false)

  // Host flips the discussion between attendees-only and open-to-anyone.
  // Optimistic; reverts on error.
  const [chatToggling, setChatToggling] = useState(false)
  const handleToggleChatPublic = async () => {
    if (!event || chatToggling) return
    const next = !event.chat_public
    setChatToggling(true)
    setEvent(prev => ({ ...prev, chat_public: next }))
    const { error } = await setEventChatPublic(event.id, next)
    setChatToggling(false)
    if (error) {
      setEvent(prev => ({ ...prev, chat_public: !next }))
      setToast({ type: 'err', msg: error.message || 'Could not update chat' })
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
          <button onClick={handleBack} style={backButtonStyle}>
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
          {/* Host-only Manage — not a participant tab */}
          {isHost && !isCancelled && (viewMode === 'overview' || viewMode === 'marketplace') && (
            <button type="button" onClick={() => setViewMode('manage')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 13px', borderRadius: 99, background: '#EDF3FA', border: '1px solid #CFE0F2', color: '#3B6EA5', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="15" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></svg>
              Manage
            </button>
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

        {/* Two persistent destinations: Event · Board. Event Mode and Recap
            are NOT tabs — they're reached from the contextual action below.
            The tab bar hides while those lifecycle screens are open. */}
        {(joined || isHost) && !isCancelled && (viewMode === 'overview' || viewMode === 'marketplace') && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: '#F2EEE5', padding: 3, borderRadius: 12 }}>
            {[{ id: 'overview', label: 'Event' }, { id: 'marketplace', label: 'Board' }].map(t => {
              const active = viewMode === t.id
              return (
                <button key={t.id} type="button" onClick={() => setViewMode(t.id)}
                  style={{
                    flex: 1, padding: '8px 6px', borderRadius: 9,
                    background: active ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : 'transparent',
                    color: active ? '#fff' : C.textSub, border: 'none',
                    fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
                    fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
                    boxShadow: active ? '0 1px 4px rgba(201,163,59,0.35)' : 'none', transition: 'all 0.18s',
                  }}>
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Lifecycle CTA moved below the description (reference order). */}

        {/* Recap mode replaces the entire overview body. */}
        {viewMode === 'recap' && (
          <EventRecapPage
            eventId={event.id}
            event={event}
            allAttendees={attendees}
            onBackToOverview={() => setViewMode('overview')}
            onOpenMatch={onOpenMatch}
            onAddPeople={() => setViewMode('event_mode')}
          />
        )}

        {/* Event Mode appears as a top card, keeps the rest below
            so people can still see event details while logging. */}
        {viewMode === 'event_mode' && (
          <div ref={eventModeRef} style={{ scrollMarginTop: 12 }}>
            <EventModeSection
              eventId={event.id}
              attendees={attendees}
              encounters={myEncounters}
              currentUserId={user?.id}
              knownContext={knownContext}
              onEncountersChanged={reloadEncounters}
            />
          </div>
        )}

        {/* Marketplace mode replaces the overview body (like recap). */}
        {viewMode === 'marketplace' && (
          <EventMarketplace
            eventId={event.id}
            userId={user?.id}
            isHost={isHost}
            allowPromotion={Boolean(event.allow_discover_promotion)}
            onOpenChat={onOpenMatch}
            onPrepare={onPrepare ? () => onPrepare(event.id) : undefined}
          />
        )}

        {/* Host-only Manage — replaces the body. */}
        {viewMode === 'manage' && isHost && (
          <EventManagePage
            event={event}
            attendees={attendees}
            userId={user?.id}
            onEdit={() => onEdit?.(event.id)}
            onCancel={handleCancel}
          />
        )}

        {/* Header card + rest of the normal overview render only
            when we're not in a dedicated full-screen mode. */}
        {viewMode !== 'recap' && viewMode !== 'marketplace' && viewMode !== 'manage' && viewMode !== 'discussion' && (
          <>
        {/* Cover — host's uploaded image, or a tasteful branded fallback */}
        <EventCover event={event} radius={16} aspectRatio="16 / 9" style={{ marginBottom: 14, border: `1px solid ${C.border}` }} />


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
              onClick={() => setShowShare(true)}
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

        {/* ── Primary lifecycle CTA — exactly one ─────────────── */}
        {!isCancelled && (() => {
          const goldBtn = { width: '100%', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: '#fff', border: 'none', boxShadow: '0 6px 18px rgba(201,163,59,0.3)' }
          const outlineBtn = { flex: 1, padding: 13, borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', background: '#fff', color: C.goldDark, border: `1px solid ${C.goldLight}` }
          const goldFlex = { ...outlineBtn, background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: '#fff', border: 'none' }
          if (!joined && !isHost) {
            if (isCompleted) return null
            return (
              <button type="button" onClick={() => setShowJoinIntent(true)} disabled={joinPending || isFull}
                style={{ ...goldBtn, marginBottom: 14, ...(isFull ? { background: '#F3F4F6', color: C.textMuted, boxShadow: 'none' } : {}), opacity: joinPending ? 0.7 : 1 }}>
                {isFull ? 'Event full' : joinPending ? 'Joining…' : (cameFromPromo ? 'Join event to connect' : 'Join event')}
              </button>
            )
          }
          const start = event.start_at ? new Date(event.start_at) : null
          const now = Date.now()
          const phase = !start ? 'before' : now < start.getTime() ? 'before'
            : now < new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime() ? 'during' : 'after'
          if (phase === 'before') {
            if (!onPrepare) return null
            return (
              <button type="button" onClick={() => onPrepare(event.id)} style={{ ...goldBtn, marginBottom: 14 }}>
                {hasPrepared ? 'Update your event post' : 'Prepare for event'}
              </button>
            )
          }
          const meetPrimary = phase === 'during'
          return (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button type="button" onClick={() => setViewMode('event_mode')} style={meetPrimary ? goldFlex : outlineBtn}>Who did you meet?</button>
              <button type="button" onClick={() => setViewMode('recap')} style={meetPrimary ? outlineBtn : goldFlex}>Complete recap</button>
            </div>
          )
        })()}

        {/* ── Compact Event Board preview ─────────────────────── */}
        {(joined || isHost) && !isCancelled && (() => {
          const known = attendees.filter(a => a.user_id !== user?.id && knownContext.has(a.user_id))
          const canSeeKnown = (event.attendee_visibility !== 'private' || isHost) && known.length > 0
          return (
            <button type="button" onClick={() => setViewMode('marketplace')}
              style={{ ...cardStyle, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ ...sectionLabelStyle, margin: 0 }}>Event Board</p>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif' }}>View board →</span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {boardSharedCount > 0
                  ? `${boardSharedCount} ${boardSharedCount === 1 ? 'attendee' : 'attendees'} shared a post`
                  : 'See what attendees are looking for and offering'}
              </p>
              {canSeeKnown && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <div style={{ display: 'flex', flexShrink: 0 }}>
                    {known.slice(0, 3).map((a, i) => (
                      <span key={a.user_id} style={{ marginLeft: i ? -8 : 0, border: '2px solid #fff', borderRadius: '50%', display: 'flex' }}>
                        <AnonymousAvatar seed={resolveAvatarSeed(a.avatar_url) || a.user_id} size={22} />
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: 12.5, color: C.goldDark, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {known.length} {known.length === 1 ? 'person' : 'people'} you know {known.length === 1 ? 'is' : 'are'} attending
                  </span>
                </div>
              )}
            </button>
          )
        })()}

        {/* ── Discussion row → full discussion view ───────────── */}
        {!isCancelled && (
          <button type="button" onClick={() => setViewMode('discussion')}
            style={{ ...cardStyle, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" fill="none" stroke={C.goldDark} strokeWidth={1.9} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8a9.96 9.96 0 01-4.418-1.026L3 20l1.026-4.418A8.964 8.964 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }}>Discussion</span>
            <svg width="18" height="18" fill="none" stroke={C.textMuted} strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6"/></svg>
          </button>
        )}

        {/* Leave event — small secondary (joined non-host). */}
        {joined && !isHost && !isCancelled && (
          <button type="button" onClick={handleLeave} disabled={joinPending}
            style={{ display: 'block', margin: '2px auto 4px', background: 'none', border: 'none', color: C.textMuted, fontSize: 12.5, fontWeight: 600, cursor: joinPending ? 'default' : 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Leave event
          </button>
        )}

        {/* Toast */}
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '10px 14px', borderRadius: 12,
              background: toast.type === 'ok' ? '#EDF3EE' : '#FEF2F2',
              border: `1px solid ${toast.type === 'ok' ? '#CBDBCF' : '#FECACA'}`,
              fontSize: 13, fontWeight: 500,
              color: toast.type === 'ok' ? '#214E3A' : '#991B1B',
              fontFamily: 'Inter, system-ui, sans-serif',
              marginBottom: 14,
            }}
          >
            {toast.type === 'ok' ? '✓ ' : '⚠ '}{toast.msg}
          </motion.div>
        )}

          </>
        )}
        {/* Discussion — full view, reached from the Discussion row */}
        {viewMode === 'discussion' && (
        <section ref={chatSectionRef} style={{ ...cardStyle, padding: 0 }}>
          <div style={{ padding: '18px 18px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <p style={sectionLabelStyle}>Discussion</p>
              {isHost && !isCancelled && (
                <button
                  type="button"
                  onClick={handleToggleChatPublic}
                  disabled={chatToggling}
                  style={{
                    flexShrink: 0, padding: '5px 11px', borderRadius: 999,
                    border: `1px solid ${C.goldLight}`, background: C.goldBg,
                    color: C.goldDark, fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.02em', cursor: chatToggling ? 'default' : 'pointer',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                >
                  {event.chat_public ? '🌐 Public · make private' : '🔒 Private · make public'}
                </button>
              )}
            </div>
            <p style={{
              fontSize: 12, color: C.textMuted, lineHeight: 1.5,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '4px 0 0',
            }}>
              {canChat
                ? (event.chat_public
                    ? 'Open discussion — anyone can read and post, even before joining.'
                    : 'Ask the host about meeting point, parking, what to bring. Visible to attendees only.')
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
                No messages yet. {canChat ? 'Start the discussion.' : ''}
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

          {canChat && !isCancelled && !isCompleted && (
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
        )}

      </motion.div>

      <EventSharePoster event={event} open={showShare} onClose={() => setShowShare(false)} />
      <EventJoinIntentModal
        open={showJoinIntent}
        eventTitle={event?.title}
        eventWhen={[formatLongDate(event?.start_at), event?.location].filter(Boolean).join(' · ')}
        identityLabel={profile?.name ? [profile.name, profile.program].filter(Boolean).join(' · ') : null}
        onConfirm={handleJoin}
        onPrepare={() => onPrepare?.(event.id)}
        onClose={() => setShowJoinIntent(false)}
      />
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
