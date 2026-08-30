import { useState, useRef, useEffect, Fragment } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PeerAvatar from './PeerAvatar'
import CoffeeChatModal from './CoffeeChatModal'
import ReportModal from './ReportModal'
import IdentityRevealRequestModal from './IdentityRevealRequestModal'
import PeerProfileCard from './PeerProfileCard'
import RecognitionCard from './RecognitionCard'
import ExchangeNextStep from './practice/ExchangeNextStep'
import { matchaCta } from '../lib/matchaCta'

const C = {
  gold:      '#C9A33B',
  goldDark:  '#A6822A',
  goldLight: '#E8D9A7',
  goldBg:    '#F8F3E5',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  chatBg:    '#F5F2EE',
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// Same calendar day (local) — used to decide when to draw a date separator.
function sameDay(a, b) {
  if (!a || !b) return false
  return new Date(a).toDateString() === new Date(b).toDateString()
}

// Date-separator label: Today / Yesterday / "Wed, Aug 5" (+ year if not this one).
function fmtDayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString())  return 'Yesterday'
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
}

// WhatsApp-style delivery ticks on my own messages: one grey tick when sent,
// a gold double tick once the peer has read it.
function ReadTicks({ read }) {
  const color = read ? C.gold : C.textMuted
  return (
    <svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke={color}
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }} aria-label={read ? 'Read' : 'Sent'}>
      <path d={read ? 'M0.5 5.5 L3 8 L7.5 2.5' : 'M3 5.5 L5.5 8 L10 2.5'} />
      {read && <path d="M5 5.5 L7.5 8 L12 2.5" />}
    </svg>
  )
}

function DaySeparator({ iso }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 16px 4px' }}>
      <span style={{
        fontSize: 11, fontWeight: 600, color: C.textSub,
        background: 'rgba(0,0,0,0.05)', borderRadius: 99, padding: '3px 12px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {fmtDayLabel(iso)}
      </span>
    </div>
  )
}

function fmtMeeting(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function MeetingCard({ msg, onConfirm, onSuggestAnother, onReschedule }) {
  const { meeting } = msg
  const isMe = msg.senderId === 'me'
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', padding: '4px 16px' }}>
      <div style={{
        background: C.white,
        border: `1.5px solid ${meeting.status === 'confirmed' ? '#CBDBCF' : C.goldLight}`,
        borderRadius: 18, padding: '14px 16px',
        maxWidth: 270,
        boxShadow: '0 2px 12px rgba(201,163,59,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>☕</span>
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: meeting.status === 'confirmed' ? '#2E6B4F' : C.goldDark,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {meeting.status === 'confirmed' ? 'Coffee Chat Confirmed ✅' : `Coffee Chat ${isMe ? 'Suggested' : 'Proposed'}`}
          </p>
        </div>
        <p style={{
          fontSize: 14, fontWeight: 600, color: C.text,
          fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 4,
        }}>
          {fmtMeeting(meeting.datetime)}
        </p>
        <p style={{
          fontSize: 13, color: C.textSub,
          fontFamily: 'Inter, system-ui, sans-serif',
          marginBottom: 12,
        }}>
          📍 {meeting.location}
        </p>

        {/* Pending — receiver sees Confirm / Suggest another time */}
        {meeting.status === 'pending' && !isMe && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onConfirm} style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              fontSize: 12, fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              border: 'none', cursor: 'pointer',
              ...matchaCta,
            }}>
              Confirm
            </button>
            <button onClick={onSuggestAnother} style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              background: '#F3F4F6', color: C.textSub,
              fontSize: 12, fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              border: '1px solid #E5E7EB', cursor: 'pointer',
            }}>
              Suggest another time ⏱
            </button>
          </div>
        )}

        {/* Pending — sender sees waiting state + dev controls */}
        {meeting.status === 'pending' && isMe && (
          <>
            <p style={{ fontSize: 11, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', fontStyle: 'italic' }}>
              Waiting for response…
            </p>
            {import.meta.env.DEV && (
              <div style={{
                marginTop: 8, paddingTop: 8,
                borderTop: '1px dashed #E5E7EB',
                display: 'flex', gap: 6,
              }}>
                <button onClick={onConfirm} style={{
                  flex: 1, padding: '6px 0', borderRadius: 8,
                  background: '#DBEAFE', border: '1px solid #93C5FD',
                  color: '#1E40AF', fontSize: 10, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
                }}>
                  Mock confirm as peer
                </button>
                <button onClick={onSuggestAnother} style={{
                  flex: 1, padding: '6px 0', borderRadius: 8,
                  background: '#DBEAFE', border: '1px solid #93C5FD',
                  color: '#1E40AF', fontSize: 10, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
                }}>
                  Mock suggest another time
                </button>
              </div>
            )}
          </>
        )}

        {/* Confirmed — show calendar + reschedule actions */}
        {meeting.status === 'confirmed' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                const title = encodeURIComponent('Coffee Chat · Mutu')
                const dtStart = new Date(meeting.datetime).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
                const dtEnd = new Date(new Date(meeting.datetime).getTime() + 30 * 60000).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
                const loc = encodeURIComponent(meeting.location)
                window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dtStart}/${dtEnd}&location=${loc}`, '_blank')
              }}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 10,
                background: '#EDF3EE', border: '1px solid #CBDBCF',
                color: '#214E3A', fontSize: 11, fontWeight: 600,
                fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              Add to calendar
            </button>
            <button
              onClick={onReschedule}
              style={{
                padding: '7px 12px', borderRadius: 10,
                background: 'transparent', border: '1px solid #E5E7EB',
                color: C.textMuted, fontSize: 11, fontWeight: 500,
                fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
              }}
            >
              Reschedule
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Check if identity should be revealed: only on the day of a confirmed meeting
function shouldRevealIdentity(messages) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  for (const msg of messages) {
    if (msg.type === 'meeting_proposal' && msg.meeting?.status === 'confirmed' && msg.meeting.datetime) {
      const meetingDay = new Date(msg.meeting.datetime).toISOString().slice(0, 10)
      if (todayStr >= meetingDay) return true
    }
  }
  return false
}

export default function ChatView({ match, messages, onSend, onProposeMeeting, onMeetingResponse, onBack, autoOpenSchedule, onScheduleOpened, scheduleFeedback, currentUserId, onSeeImpact, peerProfile, onReport, onBlock, onUnmatch, onRequestReveal, onAcceptReveal, onDeclineReveal, onOpenPractice }) {
  const [input, setInput]               = useState('')
  const [showCoffee, setShowCoffee]     = useState(false)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [rescheduleData, setRescheduleData] = useState(null)
  const [showSafetyMenu, setShowSafetyMenu] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showRevealModal, setShowRevealModal] = useState(false)
  const [showProfileCard, setShowProfileCard] = useState(false)
  const [revealDeclineDismissed, setRevealDeclineDismissed] = useState(false)
  const autoOpenedRef = useRef(false)
  const bottomRef                        = useRef(null)

  const reveal = match?.reveal || { status: 'none', iAmRequester: false }
  const isRevealed = reveal.status === 'accepted'
  const isPendingForMe = reveal.status === 'pending' && !reveal.iAmRequester
  const isPendingByMe  = reveal.status === 'pending' && reveal.iAmRequester
  const wasDeclinedByPeer = reveal.status === 'declined' && reveal.iAmRequester

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-open scheduler when coming from "Schedule coffee chat" CTA
  useEffect(() => {
    if (autoOpenSchedule) {
      setShowCoffee(true)
      onScheduleOpened?.()
    }
  }, [autoOpenSchedule])

  // Nudge logic based on message count
  const myMessages = messages.filter(m => m.senderId === 'me' && m.type === 'text')
  const hasMeeting = messages.some(m => m.type === 'meeting_proposal')
  const confirmedMeeting = messages.find(m => m.type === 'meeting_proposal' && m.meeting?.status === 'confirmed')
  const totalMessages = messages.filter(m => m.type === 'text').length

  // Post-meeting follow-up: show after confirmed meeting (simulated — 5s delay as mock)
  useEffect(() => {
    if (confirmedMeeting && !showFollowUp) {
      const timer = setTimeout(() => setShowFollowUp(true), 5000)
      return () => clearTimeout(timer)
    }
  }, [confirmedMeeting])

  // Auto-open the reveal-request modal once when a pending request arrives.
  // The banner stays visible afterwards so the recipient can come back to it.
  useEffect(() => {
    if (isPendingForMe && !autoOpenedRef.current) {
      autoOpenedRef.current = true
      setShowRevealModal(true)
    }
    if (!isPendingForMe) autoOpenedRef.current = false
  }, [isPendingForMe])

  // Reset the "peer declined" dismissal when status changes away from declined
  useEffect(() => {
    if (reveal.status !== 'declined') setRevealDeclineDismissed(false)
  }, [reveal.status])

  const handleSend = () => {
    const t = input.trim()
    if (!t) return
    onSend(t)
    setInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.chatBg, position: 'relative' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px 10px',
        background: C.white,
        borderBottom: `1px solid rgba(201,163,59,0.18)`,
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: C.goldBg, border: `1px solid ${C.goldLight}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <svg width="16" height="16" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {(() => {
          // Identity is revealed if EITHER the explicit reveal was accepted,
          // OR a confirmed meeting day has arrived (existing legacy reveal).
          const explicitlyRevealed = isRevealed
          const meetingDayRevealed = shouldRevealIdentity(messages)
          const revealed = explicitlyRevealed || meetingDayRevealed

          const peerName = revealed && (peerProfile?.name || peerProfile?.first_name)
          const displayName = peerName || 'Anonymous Peer'
          const subtitle = explicitlyRevealed
            ? 'Identity revealed'
            : (revealed && peerProfile?.program) || 'Active match'
          const subtitleColor = explicitlyRevealed ? C.goldDark : '#2E6B4F'

          const HeaderInner = (
            <>
              <PeerAvatar name={displayName} seed={match?.id || 'chat'} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                  {match?.isPractice && (
                    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.goldDark, background: C.goldBg, border: `1px solid ${C.goldLight}`, borderRadius: 5, padding: '1px 6px' }}>
                      Mock interview
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 11, color: subtitleColor, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: subtitleColor, display: 'inline-block' }} />
                  {subtitle}
                </p>
              </div>
            </>
          )

          // Tappable header opens the profile card only when explicit reveal accepted
          if (explicitlyRevealed) {
            return (
              <button
                type="button"
                onClick={() => setShowProfileCard(true)}
                style={{
                  flex: 1, minWidth: 0,
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  textAlign: 'left',
                }}
                aria-label="View peer profile"
              >
                {HeaderInner}
              </button>
            )
          }
          return (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              {HeaderInner}
            </div>
          )
        })()}

        {/* ── Safety menu (…) ──────────────────────────── */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowSafetyMenu(m => !m)}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: showSafetyMenu ? '#F3F4F6' : 'transparent',
              border: 'none', cursor: 'pointer',
            }}
            aria-label="More options"
          >
            <svg width="16" height="16" fill={C.textMuted} viewBox="0 0 20 20">
              <circle cx="4" cy="10" r="1.8" />
              <circle cx="10" cy="10" r="1.8" />
              <circle cx="16" cy="10" r="1.8" />
            </svg>
          </button>
          {showSafetyMenu && (
            <div style={{
              position: 'absolute', right: 0, top: 36, zIndex: 10,
              background: '#fff', borderRadius: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              border: '1px solid #E5E7EB',
              overflow: 'hidden', minWidth: 160,
            }}>
              {/* Identity reveal — first item, varies by current state */}
              {onRequestReveal && (reveal.status === 'none' || reveal.status === 'declined') && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSafetyMenu(false)
                    onRequestReveal()
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '11px 16px', fontSize: 13, fontWeight: 600,
                    color: '#A6822A', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  Request to reveal identity
                </button>
              )}
              {isPendingForMe && (
                <button
                  type="button"
                  onClick={() => { setShowSafetyMenu(false); setShowRevealModal(true) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '11px 16px', fontSize: 13, fontWeight: 600,
                    color: '#A6822A', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  Review reveal request
                </button>
              )}
              {isRevealed && (
                <button
                  type="button"
                  onClick={() => { setShowSafetyMenu(false); setShowProfileCard(true) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '11px 16px', fontSize: 13, fontWeight: 600,
                    color: '#A6822A', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  View peer profile
                </button>
              )}
              {onUnmatch && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSafetyMenu(false)
                    if (window.confirm('Unmatch this person? The original post will reappear in Discover for both of you.')) {
                      onUnmatch()
                    }
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '11px 16px', fontSize: 13, fontWeight: 500,
                    color: '#C9A33B', background: 'none', border: 'none', cursor: 'pointer',
                    borderTop: '1px solid #F3F4F6',
                  }}
                >
                  Unmatch
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowSafetyMenu(false); setShowReportModal(true) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '11px 16px', fontSize: 13, fontWeight: 500,
                  color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer',
                  borderTop: '1px solid #F3F4F6',
                }}
              >
                Report user
              </button>
              {onBlock && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSafetyMenu(false)
                    if (window.confirm('Block this user? They will be hidden from your matches.')) {
                      onBlock(match)
                    }
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '11px 16px', fontSize: 13, fontWeight: 500,
                    color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer',
                    borderTop: '1px solid #F3F4F6',
                  }}
                >
                  Block user
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Report modal */}
      {showReportModal && (
        <ReportModal
          type="user"
          targetId={match?.id}
          onSubmit={async ({ reason, details }) => {
            if (onReport) return onReport({ matchId: match?.id, reason, details })
            return {}
          }}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 0' }}>

        {/* Context card. Marketplace connections show "Connected about: <the
            opportunity>"; ordinary peer matches show the needs/offers exchange. */}
        {match?.isPractice ? (
          <>
          <div style={{
            margin: '0 16px 16px', background: C.white, borderRadius: 16,
            padding: '12px 16px', border: `1px solid ${C.goldLight}`,
            boxShadow: '0 2px 8px rgba(201,163,59,0.08)',
          }}>
            <p style={{
              fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: 600, color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 6,
            }}>
              Mock interview partners
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.35, margin: 0 }}>
              Both people practise. Both people help.
            </p>
            <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', margin: '3px 0 0', lineHeight: 1.4 }}>
              Chat freely here. Your next step always shows just below.
            </p>
          </div>
          {/* The ONE state-driven action card — reads/writes through the
              existing Practice data layer, no duplicated state. */}
          <ExchangeNextStep
            matchId={match.id}
            currentUserId={currentUserId}
            peerName={peerProfile?.name || peerProfile?.first_name || null}
            onOpenDetails={onOpenPractice}
          />
          </>
        ) : match?.isMarketplace ? (
          <div style={{
            margin: '0 16px 16px', background: C.white, borderRadius: 16,
            padding: '12px 16px', border: `1px solid ${C.goldLight}`,
            boxShadow: '0 2px 8px rgba(201,163,59,0.08)',
          }}>
            <p style={{
              fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: 600, color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 6,
            }}>
              Connected about
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.35, margin: 0 }}>
              {match.request?.needs || match.request?.offers || 'an opportunity'}
            </p>
            {match.eventTitle && (
              <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', margin: '3px 0 0' }}>
                You both expressed interest at {match.eventTitle}.
              </p>
            )}
          </div>
        ) : match?.isSmartMatch ? (
          <div style={{
            margin: '0 16px 16px', background: C.white, borderRadius: 16,
            padding: '12px 16px', border: `1px solid ${C.goldLight}`,
            boxShadow: '0 2px 8px rgba(201,163,59,0.08)',
          }}>
            <p style={{
              fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: 600, color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 6,
            }}>
              Why you connected
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.35, margin: 0 }}>
              A Smart Match
            </p>
            <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', margin: '3px 0 0', lineHeight: 1.4 }}>
              You were suggested as a strong match based on your profiles, and you both said you’re interested.
            </p>
          </div>
        ) : (match?.request?.needs || match?.request?.offers) ? (
          <div style={{
            margin: '0 16px 16px',
            background: C.white, borderRadius: 16,
            padding: '12px 16px',
            border: `1px solid ${C.goldLight}`,
            boxShadow: '0 2px 8px rgba(201,163,59,0.08)',
          }}>
            <p style={{
              fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: 600, color: C.gold,
              fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 8,
            }}>
              Your connection
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 3, borderRadius: 99, background: C.gold, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
                <strong style={{ color: C.goldDark }}>Looking for: </strong>
                {match.request.needs?.slice(0, 90)}{match.request.needs?.length > 90 ? '…' : ''}
              </p>
            </div>
            {Boolean(match.request.offers?.trim?.() || match.request.offers) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 3, borderRadius: 99, background: '#8B7355', flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
                <strong style={{ color: '#5C4A2A' }}>Happy to help with: </strong>
                {match.request.offers?.slice(0, 90)}{match.request.offers?.length > 90 ? '…' : ''}
              </p>
            </div>
            )}
          </div>
        ) : null}

        {/* ── Recognition (replaces the old rating flow) ──
            Hidden for Practice chats: Practice has its own two-sided
            session confirmation; showing "We met" here would run a
            second, conflicting completion flow. */}
        {!match?.isPractice && (
        <div style={{ margin: '0 16px 16px' }}>
          <RecognitionCard
            matchId={match?.id}
            peerId={match?.peerId}
            peerName={peerProfile?.name || peerProfile?.first_name || null}
            currentUserId={currentUserId}
            onSeeImpact={onSeeImpact}
          />
        </div>
        )}

        {/* ── Identity reveal banners ───────────────────── */}
        {isPendingForMe && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ margin: '0 16px 14px' }}
          >
            <div style={{
              background: `linear-gradient(135deg, ${C.goldBg}, #F7EBCF)`,
              border: `1.5px solid ${C.goldLight}`,
              borderRadius: 16,
              padding: '14px 16px',
              boxShadow: '0 4px 14px rgba(201,163,59,0.16)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>🔓</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 600, color: C.goldDark,
                    fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
                  }}>
                    Reveal identities?
                  </p>
                  <p style={{
                    fontSize: 12, color: C.textSub, lineHeight: 1.45,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    margin: '3px 0 0',
                  }}>
                    Anonymous Peer is asking to share names and school emails.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowRevealModal(true)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10,
                    fontSize: 12, fontWeight: 600,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    border: 'none', cursor: 'pointer',
                    ...matchaCta,
                  }}
                >
                  Review
                </button>
                <button
                  onClick={async () => { await onDeclineReveal?.() }}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10,
                    background: '#fff', color: C.textSub,
                    fontSize: 12, fontWeight: 600,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    border: `1px solid ${C.border}`, cursor: 'pointer',
                  }}
                >
                  Not now
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {isPendingByMe && (
          <div style={{
            margin: '0 16px 14px',
            background: '#FAFAF8',
            border: `1px dashed ${C.goldLight}`,
            borderRadius: 14,
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 14 }}>⏳</span>
            <p style={{
              fontSize: 12, color: C.textSub, lineHeight: 1.45,
              fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
            }}>
              Reveal request sent. Waiting for your peer's response.
            </p>
          </div>
        )}

        {wasDeclinedByPeer && !revealDeclineDismissed && (
          <div style={{
            margin: '0 16px 14px',
            background: '#FAFAF8',
            border: '1px solid #F0ECE4',
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 14, marginTop: 1 }}>💬</span>
            <p style={{
              flex: 1,
              fontSize: 12, color: C.textSub, lineHeight: 1.5,
              fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
            }}>
              Your peer declined the reveal request. You can continue chatting anonymously.
            </p>
            <button
              type="button"
              onClick={() => setRevealDeclineDismissed(true)}
              aria-label="Dismiss"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.textMuted, padding: 0, marginTop: -2,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => {
          // Draw a date separator whenever the day changes (and before the very
          // first message), so the chat shows the date, not just the time.
          const prev = messages[i - 1]
          const daySep = !sameDay(prev?.timestamp, msg.timestamp)
            ? <DaySeparator iso={msg.timestamp} />
            : null

          if (msg.type === 'meeting_proposal') {
            return (
              <Fragment key={msg.id}>
                {daySep}
                <MeetingCard
                  msg={msg}
                  onConfirm={() => onMeetingResponse(msg.id, 'confirmed')}
                  onSuggestAnother={() => {
                    setRescheduleData({ datetime: msg.meeting.datetime, location: msg.meeting.location })
                    setShowCoffee(true)
                  }}
                  onReschedule={() => {
                    setRescheduleData({ datetime: msg.meeting.datetime, location: msg.meeting.location })
                    setShowCoffee(true)
                  }}
                />
              </Fragment>
            )
          }
          // System messages — centered, neutral
          if (msg.senderId === 'system') {
            return (
              <Fragment key={msg.id}>
                {daySep}
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', justifyContent: 'center', padding: '8px 16px' }}
                >
                  <div style={{
                    background: '#EDF3EE', border: '1px solid #CBDBCF',
                    borderRadius: 20, padding: '8px 18px',
                  }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, color: '#214E3A',
                      fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center',
                    }}>
                      {msg.content}
                    </p>
                  </div>
                </motion.div>
              </Fragment>
            )
          }
          const isMe = msg.senderId === 'me'
          return (
            <Fragment key={msg.id}>
            {daySep}
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                padding: '3px 16px',
              }}
            >
              <div style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isMe
                  ? '#E7EFE1'
                  : '#F1F0ED',
                color: isMe ? '#2C4632' : C.text,
                fontSize: 14, lineHeight: 1.5,
                fontFamily: 'Inter, system-ui, sans-serif',
                boxShadow: isMe
                  ? '0 2px 8px rgba(119,148,125,0.22)'
                  : '0 1px 4px rgba(0,0,0,0.05)',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
              <p style={{
                fontSize: 10, color: C.textMuted,
                fontFamily: 'Inter, system-ui, sans-serif',
                marginTop: 3, paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {fmtTime(msg.timestamp)}
                {isMe && <ReadTicks read={Boolean(msg.readAt)} />}
              </p>
            </motion.div>
            </Fragment>
          )
        })}
        {/* ── Smart nudges ── */}
        {!hasMeeting && !match?.isPractice && totalMessages >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: '8px 16px', display: 'flex', justifyContent: 'center' }}
          >
            <div style={{
              background: C.goldBg, border: `1px solid ${C.goldLight}`,
              borderRadius: 16, padding: '10px 18px',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 2px 8px rgba(201,163,59,0.1)',
            }}>
              <span style={{ fontSize: 16 }}>✨</span>
              <p style={{ fontSize: 12, color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500 }}>
                {totalMessages >= 6
                  ? 'Still interested? Lock in a time'
                  : 'Looks like a good match. Schedule a chat?'}
              </p>
              <button
                onClick={() => setShowCoffee(true)}
                style={{
                  padding: '5px 12px', borderRadius: 10,
                  fontSize: 11, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  ...matchaCta,
                }}
              >
                Schedule ☕
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Post-scheduling feedback ── */}
        {scheduleFeedback && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ padding: '8px 16px', display: 'flex', justifyContent: 'center' }}
          >
            <div style={{
              background: '#EDF3EE', border: '1px solid #CBDBCF',
              borderRadius: 16, padding: '12px 20px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#214E3A', fontFamily: 'Inter, system-ui, sans-serif' }}>
                Nice! Your chat is set 🎉
              </p>
              <p style={{ fontSize: 11, color: '#2E6B4F', fontFamily: 'Inter, system-ui, sans-serif', marginTop: 4 }}>
                +10 points after completion
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Post-meeting follow-up ── */}
        {showFollowUp && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: '8px 16px', display: 'flex', justifyContent: 'center' }}
          >
            <div style={{
              background: C.white, border: `1.5px solid ${C.goldLight}`,
              borderRadius: 18, padding: '14px 20px', textAlign: 'center',
              boxShadow: '0 2px 12px rgba(201,163,59,0.12)',
              maxWidth: 280, width: '100%',
            }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 12 }}>
                Did you end up meeting?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowFollowUp(false)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 12,
                    fontSize: 13, fontWeight: 600,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    border: 'none', cursor: 'pointer',
                    ...matchaCta,
                  }}
                >
                  Yes, leave a review
                </button>
                <button
                  onClick={() => setShowFollowUp(false)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 12,
                    background: '#F3F4F6', color: C.textSub,
                    fontSize: 13, fontWeight: 600,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    border: '1px solid #E5E7EB', cursor: 'pointer',
                  }}
                >
                  Not yet
                </button>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Coffee chat quick-action ──
          Hidden for Practice chats: scheduling there is the Practice
          tab's propose→confirm flow, and a coffee-chat proposal here
          would live in this chat only — invisible to the Practice
          session state (the exact confusion this replaces). */}
      {!hasMeeting && !match?.isPractice && (
        <div style={{
          padding: '8px 16px 4px',
          background: C.white,
          borderTop: '1px solid rgba(0,0,0,0.05)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setShowCoffee(true)}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 12,
              background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
              color: C.goldDark, fontSize: 13, fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
            }}
          >
            {myMessages.length === 0
              ? 'Start with a coffee chat ☕'
              : myMessages.length <= 2
                ? 'Take this offline ☕'
                : 'Schedule a coffee chat ☕'}
          </button>
        </div>
      )}

      {/* ── Input bar ── */}
      {/* This sits as a flex sibling directly above the bottom nav, which
          owns the env(safe-area-inset-bottom) padding. So no extra inset
          here — that would double-pad above the home indicator. The
          phone-frame uses h-[100dvh], so when the iOS keyboard opens the
          frame collapses and the input stays above the keyboard. */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-end',
        padding: '8px 16px 14px',
        background: C.white, flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Message…"
          rows={1}
          style={{
            flex: 1, resize: 'none',
            border: '1.5px solid #E5E7EB', borderRadius: 20,
            padding: '10px 16px', fontSize: 14,
            fontFamily: 'Inter, system-ui, sans-serif',
            outline: 'none', lineHeight: 1.4,
            maxHeight: 100, overflowY: 'auto',
            background: '#F9F9F9',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            border: 'none',
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            ...(input.trim() ? matchaCta : { background: '#E5E7EB', boxShadow: 'none' }),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={input.trim() ? 'white' : '#9CA3AF'}>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      {/* Coffee scheduling modal */}
      <AnimatePresence>
        {showCoffee && (
          <CoffeeChatModal
            initialValues={rescheduleData}
            onConfirm={(data) => { onProposeMeeting(data); setShowCoffee(false); setRescheduleData(null) }}
            onClose={() => { setShowCoffee(false); setRescheduleData(null) }}
          />
        )}
      </AnimatePresence>

      {/* Identity reveal — request modal (recipient side) */}
      <IdentityRevealRequestModal
        open={showRevealModal}
        onAccept={async () => {
          await onAcceptReveal?.()
          setShowRevealModal(false)
          // Slide-out the profile card automatically on accept
          setTimeout(() => setShowProfileCard(true), 300)
        }}
        onDecline={async () => {
          await onDeclineReveal?.()
          setShowRevealModal(false)
        }}
        onClose={() => setShowRevealModal(false)}
      />

      {/* Identity reveal — right-side profile card */}
      <PeerProfileCard
        open={showProfileCard && isRevealed}
        onClose={() => setShowProfileCard(false)}
        match={match}
        peerProfile={peerProfile}
      />
    </div>
  )
}
