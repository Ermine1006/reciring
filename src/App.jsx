import { useState, useEffect } from 'react'
import CardStack from './components/CardStack'
import SubmitRequest from './components/SubmitRequest'
import MatchesList from './components/MatchesList'
import RatingReview from './components/RatingReview'
import ReciRingLogo from './components/ReciRingLogo'
import { MOCK_REQUESTS } from './data/mockRequests'
import LeaderboardView from './components/LeaderboardView'
import ChatView from './components/ChatView'
import MatchModal from './components/MatchModal'

/* ─── Design tokens ─────────────────────────────────────────────── */
const C = {
  gold:        '#C8A96A',
  goldLight:   '#E6D3A3',
  goldBg:      '#FBF6EC',
  text:        '#111111',
  textSub:     '#6B7280',
  textMuted:   '#9CA3AF',
  border:      'rgba(200,169,106,0.22)',
  white:       '#FFFFFF',
}

/* ─── Tab definitions ───────────────────────────────────────────── */
const TABS = [
  {
    id: 'discover',
    label: 'Discover',
    icon: (active) => (
      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.5}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
      </svg>
    ),
  },
  {
    id: 'post',
    label: 'Post',
    icon: (active) => (
      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    id: 'matches',
    label: 'Matches',
    icon: (active) => (
      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'reviews',
    label: 'Reviews',
    icon: (active) => (
      <svg width="22" height="22" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    id: 'rank',
    label: 'Rank',
    icon: (active) => (
      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-8-5v5m4-9v9M3 20h18" />
      </svg>
    ),
  },
]

/* ─── iOS-style status bar (light mode) ────────────────────────── */
function StatusBar() {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-7 pt-3.5 pb-1 select-none"
      style={{ height: 48, color: C.text }}
    >
      <span className="text-[15px] font-semibold tracking-tight">9:41</span>

      <div className="flex items-center gap-[6px]">
        {/* Signal bars */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
          <rect x="0"    y="8"   width="3" height="4"    rx="0.8" />
          <rect x="4.5"  y="5.5" width="3" height="6.5"  rx="0.8" />
          <rect x="9"    y="3"   width="3" height="9"    rx="0.8" />
          <rect x="13.5" y="0"   width="3" height="12"   rx="0.8" opacity="0.3" />
        </svg>

        {/* Wi-Fi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <path d="M5 7.8A4.5 4.5 0 0111 7.8" />
          <path d="M2.5 5.2a8 8 0 0111 0" />
        </svg>

        {/* Battery */}
        <div className="flex items-center gap-[2px]">
          <div
            className="relative overflow-hidden flex items-center"
            style={{
              width: 25, height: 12,
              border: `1.5px solid ${C.text}`,
              borderRadius: 3.5,
              opacity: 0.65,
            }}
          >
            <div style={{ width: '72%', height: '100%', background: C.text, borderRadius: '2px 0 0 2px' }} />
          </div>
          <div style={{ width: 2, height: 5, background: C.text, borderRadius: 1, opacity: 0.4 }} />
        </div>
      </div>
    </div>
  )
}

/* ─── App ───────────────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab]             = useState('discover')
  const [requests, setRequests]   = useState(MOCK_REQUESTS)
  const [matches, setMatches]     = useState([])
  const [messages, setMessages]   = useState({})
  const [chatMatchId, setChatMatchId] = useState(null)
  const [profileHovered, setProfileHovered] = useState(false)
  const [pendingSchedule, setPendingSchedule] = useState(null)  // matchId to auto-open scheduler
  const [scheduleFeedback, setScheduleFeedback] = useState(null) // post-scheduling confirmation

  const handleNewRequest = (newReq) => {
    setRequests((prev) => [
      { id: `req-${Date.now()}`, ...newReq, createdAt: 'Just now' },
      ...prev,
    ])
    setTab('discover')
  }

  const PEER_REPLIES = [
    "That sounds great! When are you free to chat?",
    "Awesome, happy to help. What works for your schedule?",
    "Perfect — I have some time this week. Want to set something up?",
    "Great, looking forward to connecting! Let me know what's most helpful.",
    "Thanks for reaching out! Happy to share what I know.",
  ]

  const handleMatchConfirm = ({ request, peer }, opts) => {
    const matchId  = `match-${Date.now()}`
    const autoMsg  = {
      id:        `msg-auto-${Date.now()}`,
      senderId:  'peer',
      content:   "Hey! Happy to connect — I might be able to help. Want to chat here or grab a coffee? ☕",
      type:      'text',
      timestamp: new Date().toISOString(),
    }
    const newMatch = {
      id:              matchId,
      request,
      peer:            peer || 'Anonymous Peer',
      createdAt:       new Date().toISOString(),
      lastMessage:     autoMsg.content,
      lastMessageTime: 'Just now',
    }
    setMatches(prev => [newMatch, ...prev])
    setMessages(prev => ({ ...prev, [matchId]: [autoMsg] }))
    setChatMatchId(matchId)
    setTab('matches')
    if (opts?.openSchedule) setPendingSchedule(matchId)
  }

  const handleSendMessage = (matchId, content) => {
    if (scheduleFeedback) setScheduleFeedback(null)
    const msg = {
      id:        `msg-${Date.now()}`,
      senderId:  'me',
      content,
      type:      'text',
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => ({ ...prev, [matchId]: [...(prev[matchId] || []), msg] }))
    setMatches(prev => prev.map(m =>
      m.id === matchId ? { ...m, lastMessage: content, lastMessageTime: 'Just now' } : m
    ))
    setTimeout(() => {
      const reply = PEER_REPLIES[Math.floor(Math.random() * PEER_REPLIES.length)]
      const peerMsg = {
        id:        `msg-peer-${Date.now()}`,
        senderId:  'peer',
        content:   reply,
        type:      'text',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => ({ ...prev, [matchId]: [...(prev[matchId] || []), peerMsg] }))
      setMatches(prev => prev.map(m =>
        m.id === matchId ? { ...m, lastMessage: reply, lastMessageTime: 'Just now' } : m
      ))
    }, 1500)
  }

  const handleProposeMeeting = (matchId, { datetime, location }) => {
    const meetingMsg = {
      id:        `msg-mtg-${Date.now()}`,
      senderId:  'me',
      type:      'meeting_proposal',
      timestamp: new Date().toISOString(),
      meeting:   { datetime, location, status: 'pending' },
    }
    setMessages(prev => ({ ...prev, [matchId]: [...(prev[matchId] || []), meetingMsg] }))
    // Show post-scheduling feedback (stays until next message)
    setScheduleFeedback(matchId)
  }

  const handleMeetingResponse = (matchId, msgId, status) => {
    setMessages(prev => {
      const updated = (prev[matchId] || []).map(msg =>
        msg.id === msgId ? { ...msg, meeting: { ...msg.meeting, status } } : msg
      )
      // Inject confirmation system message when confirmed
      if (status === 'confirmed') {
        updated.push({
          id:        `msg-sys-${Date.now()}`,
          senderId:  'system',
          type:      'text',
          content:   'Coffee chat confirmed 🎉',
          timestamp: new Date().toISOString(),
        })
      }
      return { ...prev, [matchId]: updated }
    })
  }

  return (
    /*
     * Desktop: warm-cream canvas, phone centered.
     * Mobile:  fills the viewport edge-to-edge.
     */
    <div
      className="w-full min-h-[100dvh] flex items-start sm:items-center justify-center"
      style={{ background: '#EEE9E0' }}
    >
      {/* ── Phone frame ───────────────────────────────────────── */}
      <div
        className="
          relative flex flex-col
          w-full          sm:w-[390px]
          min-h-[100dvh]  sm:min-h-0 sm:h-[844px]
                          sm:rounded-[52px] sm:overflow-hidden
                          sm:my-6
        "
        style={{
          background: C.white,
          boxShadow: [
            '0 0 0 1px rgba(0,0,0,0.07)',
            '0 0 0 1px rgba(200,169,106,0.15)',
            '0 40px 90px rgba(0,0,0,0.14)',
            '0 8px 20px rgba(0,0,0,0.06)',
          ].join(','),
        }}
      >
        {/* Dynamic-island pill (desktop) */}
        <div
          className="hidden sm:block absolute top-3.5 left-1/2 -translate-x-1/2 z-50"
          style={{
            width: 126, height: 34,
            background: '#111',
            borderRadius: 20,
          }}
        />

        {/* Status bar */}
        <StatusBar />

        {/* ── App header ────────────────────────────────────── */}
        <header className="flex-shrink-0 px-5 pt-2 pb-3" style={{ background: C.white }}>
          <div className="flex items-center justify-between">
            <ReciRingLogo size={34} />

            {/* Premium profile button — gradient border, soft glow on hover */}
            <button
              type="button"
              onMouseEnter={() => setProfileHovered(true)}
              onMouseLeave={() => setProfileHovered(false)}
              className="active:scale-95"
              style={{
                width: 42, height: 42,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                // Gradient-border trick: inner fill + outer gradient via border-box
                background: profileHovered
                  ? 'linear-gradient(#F5F0E8, #F5F0E8) padding-box, linear-gradient(135deg, #FFD700 0%, #B8962E 100%) border-box'
                  : 'linear-gradient(#FAFAF8, #FAFAF8) padding-box, linear-gradient(135deg, #D4AF37 0%, #9A7520 100%) border-box',
                border: '1.5px solid transparent',
                boxShadow: profileHovered
                  ? '0 0 0 3px rgba(212,175,55,0.14), 0 4px 14px rgba(140,100,0,0.16)'
                  : '0 2px 8px rgba(100,70,0,0.08)',
                transform: profileHovered ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.24s ease',
              }}
              aria-label="Profile"
            >
              <svg
                width="16" height="16"
                fill="none" stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: profileHovered ? '#B8962E' : '#C8A96A' }}
                strokeWidth={1.65}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          </div>

          {/* Symmetric gold rule — fades to transparency at both edges */}
          <div
            className="mt-3 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.28) 18%, rgba(212,175,55,0.55) 50%, rgba(212,175,55,0.28) 82%, transparent 100%)',
            }}
          />
        </header>

        {/* ── Main content ──────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden" style={{ background: '#F9F7F4' }}>
          {tab === 'discover' && (
            <CardStack
              requests={requests}
              onSwipeRight={(r) => console.log('Helping:', r.id)}
              onSwipeLeft={(r) => console.log('Passed:', r.id)}
              onMatchConfirm={handleMatchConfirm}
            />
          )}
          {tab === 'post' && (
            <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
              <SubmitRequest onSubmitted={handleNewRequest} />
            </div>
          )}
          {tab === 'matches' && !chatMatchId && (
            <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
              <MatchesList
                matches={matches}
                onOpenChat={(id) => setChatMatchId(id)}
              />
            </div>
          )}
          {tab === 'matches' && chatMatchId && (
            <div className="flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
              <ChatView
                match={matches.find(m => m.id === chatMatchId)}
                messages={messages[chatMatchId] || []}
                onSend={(content) => handleSendMessage(chatMatchId, content)}
                onProposeMeeting={(data) => handleProposeMeeting(chatMatchId, data)}
                onMeetingResponse={(msgId, status) => handleMeetingResponse(chatMatchId, msgId, status)}
                onBack={() => setChatMatchId(null)}
                autoOpenSchedule={pendingSchedule === chatMatchId}
                onScheduleOpened={() => setPendingSchedule(null)}
                scheduleFeedback={scheduleFeedback === chatMatchId}
                onNavigateReview={() => { setChatMatchId(null); setTab('reviews') }}
              />
            </div>
          )}
          {tab === 'reviews' && (
            <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
              <RatingReview peerName="your match" />
            </div>
          )}
          {tab === 'rank' && (
            <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
              <LeaderboardView />
            </div>
          )}
        </main>

        {/* ── Bottom tab bar ────────────────────────────────── */}
        <nav
          className="flex-shrink-0 flex justify-around items-center pt-2 px-1"
          style={{
            background: 'rgba(255,255,255,0.96)',
            borderTop: `1px solid ${C.border}`,
            backdropFilter: 'blur(20px)',
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all duration-200 active:scale-95"
                style={{
                  color: active ? C.gold : C.textMuted,
                  background: active ? C.goldBg : 'transparent',
                  minWidth: 60,
                }}
              >
                {t.icon(active)}
                <span
                  className="text-[9px] tracking-[0.12em] font-semibold uppercase"
                  style={{ color: active ? C.gold : C.textMuted }}
                >
                  {t.label}
                </span>
              </button>
            )
          })}
        </nav>

        {/* iOS home indicator */}
        <div
          className="flex-shrink-0 flex justify-center py-2"
          style={{ background: 'rgba(255,255,255,0.96)' }}
        >
          <div style={{ width: 134, height: 5, borderRadius: 99, background: 'rgba(0,0,0,0.18)' }} />
        </div>
      </div>
    </div>
  )
}
