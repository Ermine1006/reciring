import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import CardStack from './components/CardStack'
import SubmitRequest from './components/SubmitRequest'
import MatchesList from './components/MatchesList'
import RatingReview from './components/RatingReview'
import PendingReviewsList from './components/PendingReviewsList'
import ReciRingLogo from './components/ReciRingLogo'
import { MOCK_REQUESTS } from './data/mockRequests'
import LeaderboardView from './components/LeaderboardView'
import ChatView from './components/ChatView'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginScreen from './components/LoginScreen'
import EmailConfirmed from './components/EmailConfirmed'
import NewMatchModal from './components/NewMatchModal'
import SettingsPage, { resolveAvatarSeed } from './components/SettingsPage'
import AnonymousAvatar from './components/AnonymousAvatar'
import MyPostsPage from './components/MyPostsPage'
import { submitReport, blockUser, fetchBlockedIds } from './lib/safety'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { fetchPosts, createPost, updatePost } from './lib/posts'
import { createMatch, fetchMyMatches, matchToUI } from './lib/matches'
import { fetchMessages, sendMessage, sendMeetingProposal, updateMeetingStatus, msgToUI } from './lib/messages'

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

/* ─── App shell (authenticated) ─────────────────────────────────── */
function AppShell() {
  const { session, user, profile, signOut } = useAuth()
  const [tab, setTab]             = useState('discover')
  const [showSettings, setShowSettings] = useState(false)
  const [showMyPosts, setShowMyPosts]   = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [requests, setRequests]   = useState([])
  const [matches, setMatches]     = useState([])
  const [chatMatchId, setChatMatchId] = useState(null)
  const [chatMessages, setChatMessages] = useState([]) // messages for current chat
  const [reviewMatchId, setReviewMatchId] = useState(null) // which match is being reviewed
  const [reviewedMatchIds, setReviewedMatchIds] = useState(new Set()) // matches already reviewed by current user
  const [pastReviews, setPastReviews] = useState([]) // full review objects for display
  const [profileHovered, setProfileHovered] = useState(false)
  const [blockedIds, setBlockedIds] = useState(new Set())

  // ── New Match popup state ────────────────────────────────────
  const [newMatchModalOpen, setNewMatchModalOpen] = useState(false)
  const [latestNewMatch, setLatestNewMatch]       = useState(null)
  // Track which match ids we've already shown a popup for (per session + per user).
  const shownMatchIdsRef = useRef(new Set())
  // localStorage-backed acknowledged set so popups don't re-appear on reload.
  const ackKey = user ? `reciring:ackMatches:${user.id}` : null
  const loadAckSet = useCallback(() => {
    if (!ackKey) return new Set()
    try { return new Set(JSON.parse(localStorage.getItem(ackKey) || '[]')) }
    catch { return new Set() }
  }, [ackKey])
  const persistAck = useCallback((id) => {
    if (!ackKey) return
    try {
      const current = loadAckSet()
      current.add(id)
      localStorage.setItem(ackKey, JSON.stringify([...current]))
    } catch {}
  }, [ackKey, loadAckSet])

  // Load posts from Supabase (or fall back to mock data)
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setRequests(MOCK_REQUESTS)
      return
    }
    fetchPosts().then(({ data, error }) => {
      if (error) {
        console.error('[ReciRing] Failed to load posts:', error)
        setRequests(MOCK_REQUESTS) // graceful fallback
        return
      }
      // If DB has no posts yet, show mock data so the UI isn't empty
      setRequests(data && data.length > 0 ? data : MOCK_REQUESTS)
    })
  }, [])

  // Load matches from Supabase
  const loadMatches = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return
    const { data, error } = await fetchMyMatches(user.id)
    if (error) { console.error('[ReciRing] Failed to load matches:', error); return }
    setMatches(data.map(m => matchToUI(m, user.id)))
  }, [user?.id])

  useEffect(() => { loadMatches() }, [loadMatches])

  // Load messages when entering a chat
  const loadMessages = useCallback(async (matchId) => {
    if (!isSupabaseConfigured || !user) return
    const { data, error } = await fetchMessages(matchId)
    if (error) { console.error('[ReciRing] Failed to load messages:', error); return }
    setChatMessages(data.map(m => msgToUI(m, user.id)))
  }, [user?.id])

  useEffect(() => {
    if (chatMatchId) loadMessages(chatMatchId)
    else setChatMessages([])
  }, [chatMatchId, loadMessages])

  // ── Realtime: messages for the active chat ─────────────────────
  // Scoped to current matchId — subscribes only while chat is open.
  // INSERT: incoming peer messages (sender's own are already optimistic).
  // UPDATE: meeting status changes (confirmed/declined/rescheduled).
  useEffect(() => {
    if (!isSupabaseConfigured || !chatMatchId || !user) return
    const uid = user.id

    const channel = supabase
      .channel(`chat-${chatMatchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${chatMatchId}` },
        (payload) => {
          if (payload.new.sender_user_id === uid) return          // own send — already in state
          setChatMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev // dedup guard
            return [...prev, msgToUI(payload.new, uid)]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `match_id=eq.${chatMatchId}` },
        (payload) => {
          // Only patch meeting_proposal status changes
          if (payload.new.type !== 'meeting_proposal') return
          const newMeta = payload.new.metadata
          if (!newMeta?.status) return // incomplete payload — skip
          setChatMessages(prev => prev.map(m => {
            if (m.id !== payload.new.id) return m
            // If our optimistic state already matches or exceeds, keep it
            if (m.meeting?.status === newMeta.status) return m
            return msgToUI(payload.new, uid)
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [chatMatchId, user?.id])

  // ── Realtime: new matches involving the current user ──────────
  // Supabase filter supports one column, but matches have two user
  // columns. We use two listeners on the same channel — one per role.
  // Event: INSERT only. Triggers a full refetch (matches carry joined
  // post data that can't be reconstructed from the payload alone).
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return
    const uid = user.id

    const triggerNewMatchPopup = async (row) => {
      // Only the REQUESTER sees the popup — the helper already navigated
      // into the chat as part of their own action (handleMatchConfirm).
      if (row.helper_user_id === uid) return
      if (row.requester_user_id !== uid) return
      // Dedupe across session + persisted acks
      if (shownMatchIdsRef.current.has(row.id)) return
      if (loadAckSet().has(row.id)) return
      shownMatchIdsRef.current.add(row.id)

      // Refetch matches to get the joined post data, then find this one
      await loadMatches()
      // Defer one tick so matches state is updated before we read it
      setTimeout(() => {
        setMatches(curr => {
          const found = curr.find(m => m.id === row.id)
          if (found) {
            setLatestNewMatch(found)
            setNewMatchModalOpen(true)
          }
          return curr
        })
      }, 0)
    }

    const channel = supabase
      .channel('my-matches')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `requester_user_id=eq.${uid}` },
        (payload) => { triggerNewMatchPopup(payload.new) }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `helper_user_id=eq.${uid}` },
        () => { loadMatches() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id, loadMatches, loadAckSet])

  // ── Fallback: on load, surface any unseen new match as a popup ───
  // If realtime missed a match (offline, reconnect, cold load), find the
  // most recent match where the current user is the requester and hasn't
  // acknowledged yet, then show the popup once.
  useEffect(() => {
    if (!user || !matches.length || newMatchModalOpen) return
    const ack = loadAckSet()
    const candidate = matches.find(m => !m.isHelper && !ack.has(m.id) && !shownMatchIdsRef.current.has(m.id))
    if (candidate) {
      shownMatchIdsRef.current.add(candidate.id)
      setLatestNewMatch(candidate)
      setNewMatchModalOpen(true)
    }
  }, [matches, user?.id, loadAckSet, newMatchModalOpen])

  const handleNewMatchView = useCallback(() => {
    if (!latestNewMatch) return
    persistAck(latestNewMatch.id)
    setNewMatchModalOpen(false)
    setTab('matches')
    setChatMatchId(latestNewMatch.id)
  }, [latestNewMatch, persistAck])

  const handleNewMatchDismiss = useCallback(() => {
    if (latestNewMatch) persistAck(latestNewMatch.id)
    setNewMatchModalOpen(false)
  }, [latestNewMatch, persistAck])

  // Load blocked user ids on mount
  useEffect(() => {
    if (!user) return
    fetchBlockedIds(user.id).then(({ data }) => {
      if (data) setBlockedIds(new Set(data))
    })
  }, [user?.id])

  // Load reviewed match IDs (so we can hide them from the pending review list)
  const loadReviewedMatchIds = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return
    const { data, error } = await supabase
      .from('reviews')
      .select('id, match_id, rating, comment, created_at')
      .eq('reviewer_user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) { console.error('[ReciRing] Failed to load reviews:', error); return }
    setReviewedMatchIds(new Set((data || []).map(r => r.match_id)))
    setPastReviews(data || [])
  }, [user?.id])

  useEffect(() => { loadReviewedMatchIds() }, [loadReviewedMatchIds])

  // Matches the current user has NOT yet reviewed
  const pendingReviewMatches = useMemo(
    () => matches.filter(m => !reviewedMatchIds.has(m.id)),
    [matches, reviewedMatchIds]
  )

  // Filter out blocked users' posts + own posts
  const visibleRequests = useMemo(
    () => requests.filter(r => {
      const creatorId = r.created_by || r.poster_id
      // if (creatorId && user && creatorId === user.id) return false  // TEMP: show own posts in Discover for demo
      if (creatorId && blockedIds.has(creatorId))     return false     // hide blocked
      return true
    }),
    [requests, blockedIds, user?.id]
  )

  // ── Safety handlers ──────────────────────────────────────────
  const handleReport = async ({ postId, matchId, reason, details }) => {
    if (!user) return { error: new Error('Not signed in.') }
    // For post reports, also resolve the creator's user id
    const post = requests.find(r => r.id === postId)
    const reportedUserId = matchId || post?.created_by || null
    return submitReport({
      reporterId: user.id,
      reportedUserId,
      reportedPostId: postId || null,
      reason,
      details,
    })
  }

  const handleBlock = async (target) => {
    if (!user) return
    const targetUserId = target?.created_by || target?.poster_id || target?.peerId || null
    if (!targetUserId) {
      alert('Cannot block this user — no real user ID available on demo data.')
      return
    }
    if (targetUserId === user.id) {
      alert('You cannot block yourself.')
      return
    }
    const { error } = await blockUser({ blockerId: user.id, blockedUserId: targetUserId })
    if (error) {
      alert('Failed to block user: ' + (error.message || 'Unknown error'))
      return
    }
    setBlockedIds(prev => new Set([...prev, targetUserId]))
  }

  // Compute which matches have identity revealed (meeting day or later)
  // For now this checks only the currently loaded chat messages
  const revealedMatchIds = useMemo(() => {
    const revealed = new Set()
    if (!chatMatchId) return revealed
    const todayStr = new Date().toISOString().slice(0, 10)
    for (const msg of chatMessages) {
      if (msg.type === 'meeting_proposal' && msg.meeting?.status === 'confirmed' && msg.meeting?.datetime) {
        const meetingDay = new Date(msg.meeting.datetime).toISOString().slice(0, 10)
        if (todayStr >= meetingDay) { revealed.add(chatMatchId); break }
      }
    }
    return revealed
  }, [chatMessages, chatMatchId])

  const handleNewRequest = async (newReq) => {
    if (isSupabaseConfigured && user) {
      const { data: card, error } = await createPost(user.id, newReq)
      if (error) return { error }
      setRequests((prev) => [card, ...prev])
      setTab('discover')
      return {}
    }
    // Fallback for unconfigured / demo mode
    setRequests((prev) => [
      { id: `req-${Date.now()}`, ...newReq, createdAt: 'Just now' },
      ...prev,
    ])
    setTab('discover')
    return {}
  }

  // ── My Posts: derived from shared state ───────────────────────
  const myPosts = useMemo(
    () => user
      ? requests
          .filter(r => r.created_by === user.id)
          .sort((a, b) => (b.createdAt === 'Just now' ? 1 : 0) - (a.createdAt === 'Just now' ? 1 : 0))
      : [],
    [requests, user?.id]
  )

  const handleEditPost = async (postId, fields) => {
    if (!user) return { error: new Error('Not signed in.') }
    const { data, error } = await updatePost(postId, user.id, fields)
    if (error) return { error }
    // Replace in shared state — updated card has fresh createdAt
    setRequests(prev => [data, ...prev.filter(r => r.id !== postId)])
    return {}
  }

  const handleDeletePost = async (postId) => {
    if (!user) return { error: new Error('Not signed in.') }
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('created_by', user.id)
    if (error) return { error }
    setRequests(prev => prev.filter(r => r.id !== postId))
    return {}
  }

  // ── Match: user picks up a post ──────────────────────────────
  const handleMatchConfirm = async ({ request }, actionType) => {
    if (!user || !isSupabaseConfigured) return
    const { data, error } = await createMatch(user.id, request, actionType || 'quick_intro')
    if (error) {
      if (error.code === '23505') { // unique violation — already matched
        alert('You already picked up this request.')
      } else {
        console.error('[ReciRing] Match creation failed:', error)
        alert('Failed to create match: ' + (error.message || 'Unknown error'))
      }
      return
    }
    // Reload matches so the new one shows up
    await loadMatches()
    setChatMatchId(data.id)
    setTab('matches')
  }

  // ── Send a text message ─────────────────────────────────────
  const handleSendMessage = async (matchId, content) => {
    if (!user) return
    const { data, error } = await sendMessage(matchId, user.id, content)
    if (error) { console.error('[ReciRing] Send failed:', error); return }
    if (!data) return
    setChatMessages(prev => [...prev, msgToUI(data, user.id)])
  }

  // ── Propose a meeting ───────────────────────────────────────
  const handleProposeMeeting = async (matchId, { datetime, location }) => {
    if (!user) return
    const { data, error } = await sendMeetingProposal(matchId, user.id, { datetime, location })
    if (error) { console.error('[ReciRing] Meeting proposal failed:', error); return }
    setChatMessages(prev => [...prev, msgToUI(data, user.id)])
  }

  // ── Respond to a meeting proposal ───────────────────────────
  const handleMeetingResponse = async (matchId, msgId, newStatus) => {
    // Optimistic: update UI immediately so the button responds
    setChatMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, meeting: { ...m.meeting, status: newStatus } } : m
    ))
    // Persist to DB
    const { error } = await updateMeetingStatus(msgId, newStatus)
    if (error) {
      console.error('[ReciRing] Meeting update failed — rolling back:', error)
      alert(`Meeting update failed: ${error.message || JSON.stringify(error)}`)
      // Rollback optimistic update
      setChatMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, meeting: { ...m.meeting, status: 'pending' } } : m
      ))
    }
  }

  // ── Submit a review ─────────────────────────────────────────
  const handleSubmitReview = async ({ matchId, rating, review }) => {
    if (!user || !isSupabaseConfigured) return { error: new Error('Not signed in.') }
    const match = matches.find(m => m.id === matchId)
    if (!match) return { error: new Error('Match not found.') }

    const { error } = await supabase
      .from('reviews')
      .insert({
        match_id:         matchId,
        reviewer_user_id: user.id,
        reviewed_user_id: match.peerId,
        rating,
        comment:          review || '',
      })

    if (error) {
      if (error.code === '23505') return { error: new Error('You already reviewed this match.') }
      return { error }
    }
    // Optimistic: immediately remove from pending list + add to past reviews
    setReviewedMatchIds(prev => new Set([...prev, matchId]))
    setPastReviews(prev => [{
      id: `temp-${Date.now()}`,
      match_id: matchId,
      rating,
      comment: review || '',
      created_at: new Date().toISOString(),
    }, ...prev])
    setReviewMatchId(null)
    return {}
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

            {/* Profile button + dropdown menu */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onMouseEnter={() => setProfileHovered(true)}
                onMouseLeave={() => setProfileHovered(false)}
                onClick={() => setShowProfileMenu(m => !m)}
                title={session ? session.user.email : 'Menu'}
                className="active:scale-95"
                style={{
                  width: 42, height: 42,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  padding: 0,
                  background: resolveAvatarSeed(profile?.avatar_url)
                    ? 'none'
                    : profileHovered
                      ? 'linear-gradient(#F5F0E8, #F5F0E8) padding-box, linear-gradient(135deg, #FFD700 0%, #B8962E 100%) border-box'
                      : 'linear-gradient(#FAFAF8, #FAFAF8) padding-box, linear-gradient(135deg, #D4AF37 0%, #9A7520 100%) border-box',
                  border: resolveAvatarSeed(profile?.avatar_url)
                    ? '2px solid #E6D3A3'
                    : '1.5px solid transparent',
                  boxShadow: profileHovered
                    ? '0 0 0 3px rgba(212,175,55,0.14), 0 4px 14px rgba(140,100,0,0.16)'
                    : '0 2px 8px rgba(100,70,0,0.08)',
                  transform: profileHovered ? 'scale(1.05)' : 'scale(1)',
                  transition: 'all 0.24s ease',
                }}
                aria-label="Profile menu"
              >
                {resolveAvatarSeed(profile?.avatar_url) ? (
                  <AnonymousAvatar seed={resolveAvatarSeed(profile.avatar_url)} size={42} />
                ) : (
                  <svg
                    width="16" height="16"
                    fill="none" stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: profileHovered ? '#B8962E' : '#C8A96A' }}
                    strokeWidth={1.65}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </button>

              {/* Dropdown */}
              {showProfileMenu && (
                <>
                  {/* Invisible backdrop to close on outside click */}
                  <div
                    onClick={() => setShowProfileMenu(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 39 }}
                  />
                  <div style={{
                    position: 'absolute', right: 0, top: 48, zIndex: 40,
                    background: '#FFFFFF',
                    borderRadius: 16,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
                    border: '1px solid rgba(200,169,106,0.18)',
                    overflow: 'hidden',
                    minWidth: 180,
                  }}>
                    {/* My Posts */}
                    <button
                      type="button"
                      onClick={() => { setShowProfileMenu(false); setShowMyPosts(true); setShowSettings(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '13px 18px', background: 'none', border: 'none',
                        fontSize: 14, fontWeight: 500, color: C.text, cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <svg width="16" height="16" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V9a2 2 0 012-2h2a2 2 0 012 2v9a2 2 0 01-2 2h-2z" />
                      </svg>
                      My Posts
                    </button>

                    <div style={{ height: 1, background: 'rgba(200,169,106,0.12)', margin: '0 14px' }} />

                    {/* My Reviews */}
                    <button
                      type="button"
                      onClick={() => { setShowProfileMenu(false); setShowMyPosts(false); setShowSettings(false); setTab('reviews'); setReviewMatchId(null) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '13px 18px', background: 'none', border: 'none',
                        fontSize: 14, fontWeight: 500, color: C.text, cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <svg width="16" height="16" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                      My Reviews
                    </button>

                    <div style={{ height: 1, background: 'rgba(200,169,106,0.12)', margin: '0 14px' }} />

                    {/* My Profile */}
                    <button
                      type="button"
                      onClick={() => { setShowProfileMenu(false); setShowSettings(true); setShowMyPosts(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '13px 18px', background: 'none', border: 'none',
                        fontSize: 14, fontWeight: 500, color: C.text, cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <svg width="16" height="16" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      My Profile
                    </button>

                    <div style={{ height: 1, background: 'rgba(200,169,106,0.12)', margin: '0 14px' }} />

                    {/* Log out */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false)
                        if (window.confirm('Sign out?')) signOut()
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '13px 18px', background: 'none', border: 'none',
                        fontSize: 14, fontWeight: 500, color: '#DC2626', cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <svg width="16" height="16" fill="none" stroke="#DC2626" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
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
        <main className="flex-1 flex flex-col min-h-0" style={{ background: '#F9F7F4' }}>
          {showSettings && session ? (
            <SettingsPage onClose={() => setShowSettings(false)} />
          ) : showMyPosts && session ? (
            <MyPostsPage
              posts={myPosts}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              onClose={() => setShowMyPosts(false)}
            />
          ) : <>
          {tab === 'discover' && (
            <CardStack
              requests={visibleRequests}
              onSwipeRight={(r) => console.log('Helping:', r.id)}
              onSwipeLeft={(r) => console.log('Passed:', r.id)}
              onMatchConfirm={handleMatchConfirm}
              onReport={handleReport}
              onBlock={handleBlock}
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
                revealedMatchIds={revealedMatchIds}
              />
            </div>
          )}
          {tab === 'matches' && chatMatchId && (
            <div className="flex-1 min-h-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
              <ChatView
                match={matches.find(m => m.id === chatMatchId)}
                messages={chatMessages}
                onSend={(content) => handleSendMessage(chatMatchId, content)}
                onProposeMeeting={(data) => handleProposeMeeting(chatMatchId, data)}
                onMeetingResponse={(msgId, status) => handleMeetingResponse(chatMatchId, msgId, status)}
                onBack={() => setChatMatchId(null)}
                onNavigateReview={() => { setReviewMatchId(chatMatchId); setChatMatchId(null); setTab('reviews') }}
                onReport={handleReport}
                onBlock={handleBlock}
              />
            </div>
          )}
          {tab === 'reviews' && (
            <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
              {reviewMatchId ? (
                <RatingReview
                  matchId={reviewMatchId}
                  peerName={matches.find(m => m.id === reviewMatchId)?.request?.needs?.slice(0, 30) || 'your match'}
                  onSubmitted={handleSubmitReview}
                  onBack={() => setReviewMatchId(null)}
                />
              ) : (
                <PendingReviewsList
                  matches={pendingReviewMatches}
                  pastReviews={pastReviews}
                  allMatches={matches}
                  onSelect={(id) => setReviewMatchId(id)}
                />
              )}
            </div>
          )}
          {tab === 'rank' && (
            <LeaderboardView />
          )}
          </>}
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

        {/* ── New Match popup ─────────────────────────────────── */}
        <NewMatchModal
          open={newMatchModalOpen && !(tab === 'matches' && chatMatchId === latestNewMatch?.id)}
          match={latestNewMatch}
          onView={handleNewMatchView}
          onDismiss={handleNewMatchDismiss}
        />
      </div>
    </div>
  )
}

/* ─── Root App — auth gate ─────────────────────────────────────── */
function AppRoot() {
  const { session, loading, isConfigured } = useAuth()

  // 1. No backend → skip auth entirely
  if (!isConfigured) return <AppShell />

  // 2. Configured but still bootstrapping session
  if (loading) {
    return (
      <div
        className="w-full min-h-[100dvh] flex items-center justify-center"
        style={{ background: '#EEE9E0' }}
      >
        <ReciRingLogo size={38} />
      </div>
    )
  }

  // 3. Email-confirmed landing page (after clicking confirmation link)
  if (window.location.pathname === '/auth/confirmed') {
    return (
      <EmailConfirmed
        onGoToLogin={() => {
          window.history.replaceState({}, '', '/')
          window.location.reload()
        }}
      />
    )
  }

  // 4. Configured + bootstrapped → gate on session
  if (!session) return <LoginScreen />
  return <AppShell />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  )
}
