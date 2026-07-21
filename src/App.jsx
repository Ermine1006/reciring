import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import CardStack from './components/CardStack'
import PostHub from './components/PostHub'
import AppScreen from './components/AppScreen'
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
import ResetPasswordPage from './components/ResetPasswordPage'
import NewMatchModal from './components/NewMatchModal'
import LinkAccountPrompt from './components/LinkAccountPrompt'
import NotificationBell from './components/NotificationBell'
import PostMatchFeedbackPrompt from './components/PostMatchFeedbackPrompt'
import SettingsPage, { resolveAvatarSeed } from './components/SettingsPage'
import OnboardingProfile from './components/OnboardingProfile'
import AnonymousAvatar from './components/AnonymousAvatar'
import MyPostsPage from './components/MyPostsPage'
import AdminEmailTest from './components/AdminEmailTest'
import EventsList from './components/EventsList'
import CreateEventForm from './components/CreateEventForm'
import EditEventForm from './components/EditEventForm'
import EventDetailPage from './components/EventDetailPage'
import ProfilePage from './components/ProfilePage'
import { isAdmin } from './data/adminEmails'
import { submitReport, blockUser, fetchBlockedIds } from './lib/safety'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { fetchPosts, createPost, updatePost } from './lib/posts'
import { createMatch, fetchMyMatches, fetchMatchedPostIds, fetchUnmatchedPostIds, unmatchMatch, matchToUI, requestIdentityReveal, acceptIdentityReveal, declineIdentityReveal, fetchPeerProfile } from './lib/matches'
import { fetchUserInteractions, recordPostInteraction } from './lib/interactions'
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

/* ─── Tab definitions (5-tab nav: Discover · Matches · Community · Events · Profile) ── */
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
    id: 'events',
    label: 'Events',
    icon: (active) => (
      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.5}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M16 3v4M8 3v4M3 11h18" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (active) => (
      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

/* ─── App shell (authenticated) ─────────────────────────────────── */
function AppShell() {
  const { session, user, profile, signOut } = useAuth()
  const [tab, setTab]             = useState('discover')
  // Profile sub-tab is lifted to App so that chat→review deep-links can
  // jump straight to the Reviews sub-tab on the Profile page.
  const [profileSubTab, setProfileSubTab] = useState('profile')
  const [showAdminEmailTest, setShowAdminEmailTest] = useState(false)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  // Currently opened event id — when set, Events tab renders the
  // detail page instead of the list. Null = list view.
  const [viewingEventId, setViewingEventId] = useState(null)
  // When set, Events tab renders EditEventForm overlay on top of the
  // detail page. The detail page id stays in viewingEventId so closing
  // the editor returns there cleanly.
  const [editingEventId, setEditingEventId] = useState(null)
  // Bump this to force EventsList to refetch after a new event is created.
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0)
  // Bump this to force EventDetailPage to refetch after save.
  const [eventDetailRefreshKey, setEventDetailRefreshKey] = useState(0)
  const [requests, setRequests]   = useState([])
  const [matches, setMatches]     = useState([])
  const [chatMatchId, setChatMatchId] = useState(null)
  const [chatMessages, setChatMessages] = useState([]) // messages for current chat
  const [peerProfile, setPeerProfile]   = useState(null) // peer's profile when reveal is accepted
  const [reviewMatchId, setReviewMatchId] = useState(null) // which match is being reviewed
  const [reviewedMatchIds, setReviewedMatchIds] = useState(new Set()) // matches already reviewed by current user
  const [pastReviews, setPastReviews] = useState([]) // full review objects for display
  const [profileHovered, setProfileHovered] = useState(false)
  const [blockedIds, setBlockedIds] = useState(new Set())
  const [matchedPostIds, setMatchedPostIds] = useState(new Set())
  const [unmatchedPostIds, setUnmatchedPostIds] = useState(new Set())
  // Persistent Map<postId, 'viewed'|'swiped_left'> backing the Discover
  // tier ranker. Loaded from DB on mount; updated optimistically on
  // every swipe-left / detail-open.
  const [interactionMap, setInteractionMap] = useState(() => new Map())

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

  // Load post IDs that already have an active match involving me
  const loadMatchedPostIds = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return
    const { data } = await fetchMatchedPostIds(user.id)
    setMatchedPostIds(new Set(data))
  }, [user?.id])

  useEffect(() => { loadMatchedPostIds() }, [loadMatchedPostIds])

  // Load post IDs I've previously unmatched — these stay visible in Discover
  // but are sorted to the bottom by the ranker.
  const loadUnmatchedPostIds = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return
    const { data } = await fetchUnmatchedPostIds(user.id)
    setUnmatchedPostIds(new Set(data))
  }, [user?.id])

  useEffect(() => { loadUnmatchedPostIds() }, [loadUnmatchedPostIds])

  // Load Discover interaction history (viewed / swiped_left). Used by
  // the 4-tier ranker so dismissed posts persist their lower priority
  // across refresh and tab switches.
  const loadInteractions = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return
    const { data } = await fetchUserInteractions(user.id)
    setInteractionMap(data)
  }, [user?.id])

  useEffect(() => { loadInteractions() }, [loadInteractions])

  // Record a Discover interaction. Optimistic + non-blocking.
  // Priority: swiped_left > viewed > none. Refuses to downgrade an
  // existing 'swiped_left' to 'viewed'.
  const recordInteraction = useCallback((postId, type) => {
    if (!user || !postId) return
    setInteractionMap(prev => {
      const existing = prev.get(postId)
      if (existing === 'swiped_left' && type === 'viewed') return prev
      if (existing === type) return prev
      const next = new Map(prev)
      next.set(postId, type)
      return next
    })
    // Fire and forget — UX prefers responsiveness over write confirmation.
    // If it fails, the next load will re-sync from DB.
    recordPostInteraction(user.id, postId, type).then(({ error }) => {
      if (error) console.warn('[ReciRing] recordPostInteraction failed:', error.message || error)
    })
  }, [user?.id])

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

      // Refetch matches + matchedPostIds so the requester's own post gets
      // filtered out of their Discover feed immediately (without waiting
      // for them to refresh).
      await Promise.all([loadMatches(), loadMatchedPostIds()])
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
        () => { loadMatches(); loadMatchedPostIds() }
      )
      // UPDATE: handles unmatch (status → 'unmatched'), completion, etc.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `requester_user_id=eq.${uid}` },
        (payload) => {
          if (payload.new.status === 'unmatched' || payload.new.status === 'cancelled') {
            setMatches(prev => prev.filter(m => m.id !== payload.new.id))
            // Refresh matched + unmatched sets so Discover sorting reacts
            loadMatchedPostIds()
            loadUnmatchedPostIds()
          } else {
            loadMatches()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `helper_user_id=eq.${uid}` },
        (payload) => {
          if (payload.new.status === 'unmatched' || payload.new.status === 'cancelled') {
            setMatches(prev => prev.filter(m => m.id !== payload.new.id))
            loadMatchedPostIds()
            loadUnmatchedPostIds()
          } else {
            loadMatches()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id, loadMatches, loadMatchedPostIds, loadUnmatchedPostIds, loadAckSet])

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

  // ── Post-match feedback prompt ───────────────────────────────
  // Fires for matches >= 24h old that the viewer hasn't reviewed yet.
  // Snooze persists in localStorage with a 48h TTL per match.
  const [feedbackPromptOpen, setFeedbackPromptOpen]   = useState(false)
  const [feedbackPromptMatch, setFeedbackPromptMatch] = useState(null)
  const shownFeedbackRef = useRef(new Set()) // session-level dedupe
  const snoozeKey = user ? `reciring:fbSnooze:${user.id}` : null

  const loadSnoozeMap = useCallback(() => {
    if (!snoozeKey) return {}
    try { return JSON.parse(localStorage.getItem(snoozeKey) || '{}') }
    catch { return {} }
  }, [snoozeKey])

  const persistSnooze = useCallback((matchId, hours = 48) => {
    if (!snoozeKey) return
    try {
      const map = loadSnoozeMap()
      map[matchId] = Date.now() + hours * 3600_000
      localStorage.setItem(snoozeKey, JSON.stringify(map))
    } catch {}
  }, [snoozeKey, loadSnoozeMap])

  // Load blocked user ids on mount
  useEffect(() => {
    if (!user) return
    fetchBlockedIds(user.id).then(({ data }) => {
      if (data) setBlockedIds(new Set(data))
    })
  }, [user?.id])

  // Load reviewed match IDs + past reviews with post context
  const loadReviewedMatchIds = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        id, match_id, rating, comment, created_at,
        match:matches (
          post:posts ( need_text, offer_text )
        )
      `)
      .eq('reviewer_user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) { console.error('[ReciRing] Failed to load reviews:', error); return }
    setReviewedMatchIds(new Set((data || []).map(r => r.match_id)))
    setPastReviews((data || []).map(r => ({
      ...r,
      postNeeds:  r.match?.post?.need_text || null,
      postOffers: r.match?.post?.offer_text || null,
    })))
  }, [user?.id])

  useEffect(() => { loadReviewedMatchIds() }, [loadReviewedMatchIds])

  // Matches the current user has NOT yet reviewed
  const pendingReviewMatches = useMemo(
    () => matches.filter(m => !reviewedMatchIds.has(m.id)),
    [matches, reviewedMatchIds]
  )

  // Fire the post-match feedback prompt for the oldest ripe candidate.
  // Ripe = pending review AND >= 24h old AND not snoozed AND not shown this session.
  // Suppressed when other modals are open (new-match popup, review form, chat).
  useEffect(() => {
    if (!user || feedbackPromptOpen || newMatchModalOpen || reviewMatchId || chatMatchId) return
    if (pendingReviewMatches.length === 0) return

    const snooze = loadSnoozeMap()
    const now = Date.now()
    const RIPE_AFTER_MS = 24 * 3600_000

    // Sort oldest-first so we ask about the longest-pending match
    const candidate = [...pendingReviewMatches]
      .filter(m => {
        if (shownFeedbackRef.current.has(m.id)) return false
        const snoozedUntil = snooze[m.id]
        if (snoozedUntil && snoozedUntil > now) return false
        const ageMs = now - new Date(m.createdAt).getTime()
        return ageMs >= RIPE_AFTER_MS
      })
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0]

    if (candidate) {
      shownFeedbackRef.current.add(candidate.id)
      setFeedbackPromptMatch(candidate)
      setFeedbackPromptOpen(true)
    }
  }, [pendingReviewMatches, user?.id, feedbackPromptOpen, newMatchModalOpen, reviewMatchId, chatMatchId, loadSnoozeMap])

  const handleFeedbackReview = useCallback((matchId) => {
    setFeedbackPromptOpen(false)
    setReviewMatchId(matchId)
    // Reviews is a SUB-tab under Profile, not a top-level tab.
    // Setting tab='reviews' falls through every render block and
    // shows a blank screen.
    setTab('profile')
    setProfileSubTab('reviews')
  }, [])

  const handleFeedbackSnooze = useCallback(() => {
    if (feedbackPromptMatch) persistSnooze(feedbackPromptMatch.id)
    setFeedbackPromptOpen(false)
  }, [feedbackPromptMatch, persistSnooze])

  // ── Notification routing — bell click → correct view ─────────
  const handleNotificationOpen = useCallback((n) => {
    const matchId = n.payload?.match_id
    switch (n.type) {
      case 'new_match':
      case 'new_message':
      case 'meeting_confirmed':
        if (matchId) {
          setTab('matches')
          setChatMatchId(matchId)
        }
        break
      case 'feedback_request':
        if (matchId) setReviewMatchId(matchId)
        setTab('profile')
        setProfileSubTab('reviews')
        break
      case 'review_received':
        setTab('profile')
        setProfileSubTab('reviews')
        break
      case 'event_cancelled':
      case 'event_joined':
      case 'event_message':
      case 'event_below_min': {
        const eventId = n.payload?.event_id
        setTab('events')
        setEditingEventId(null)
        if (eventId) setViewingEventId(eventId)
        else         setViewingEventId(null)
        break
      }
      default:
        break
    }
  }, [])

  // Filter out blocked users' posts, own posts, and already-matched posts
  const visibleRequests = useMemo(
    () => requests.filter(r => {
      const creatorId = r.created_by || r.poster_id
      // if (creatorId && user && creatorId === user.id) return false  // TEMP: show own posts in Discover for demo
      if (creatorId && blockedIds.has(creatorId))     return false     // hide blocked
      if (r.id && matchedPostIds.has(r.id))           return false     // hide already-matched
      return true
    }),
    [requests, blockedIds, matchedPostIds, user?.id]
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
      return {}
    }
    // Fallback for unconfigured / demo mode
    setRequests((prev) => [
      { id: `req-${Date.now()}`, ...newReq, createdAt: 'Just now' },
      ...prev,
    ])
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
  //
  // Creates the match in the DB and refreshes local caches. Does NOT
  // navigate away from Discover — navigation is a separate explicit
  // action via handleOpenChat / handleScheduleChat. This lets the
  // post-match "It's a match!" popup show "Dismiss" without losing
  // the user's place on Discover.
  //
  // Returns { matchId, error } so the caller can decide what to do next
  // (open the confirmation modal vs surface an error).
  const handleMatchConfirm = async (request) => {
    if (!user || !isSupabaseConfigured) return { matchId: null, error: new Error('Not signed in.') }
    const { data, error } = await createMatch(user.id, request)
    if (error) {
      if (error.code === '23505') { // unique violation — already matched
        alert('You already picked up this request.')
      } else {
        console.error('[ReciRing] Match creation failed:', error)
        alert('Failed to create match: ' + (error.message || 'Unknown error'))
      }
      return { matchId: null, error }
    }
    await Promise.all([loadMatches(), loadMatchedPostIds()])
    return { matchId: data.id, error: null }
  }

  // Auto-open the scheduler when navigating to a chat from the
  // "Schedule coffee chat" button in the post-match popup.
  const [chatAutoOpenSchedule, setChatAutoOpenSchedule] = useState(false)

  // Pure navigation — used by the post-match "Send quick intro" button.
  const handleOpenChat = useCallback((matchId) => {
    if (!matchId) return
    setChatMatchId(matchId)
    setTab('matches')
  }, [])

  // Navigation + open scheduler on arrival.
  const handleScheduleChat = useCallback((matchId) => {
    if (!matchId) return
    setChatAutoOpenSchedule(true)
    setChatMatchId(matchId)
    setTab('matches')
  }, [])

  // ── Unmatch: soft-delete the match, restore post in Discover ─
  const unmatchingRef = useRef(new Set())
  const handleUnmatch = async (matchId) => {
    if (!user || !isSupabaseConfigured) return
    if (unmatchingRef.current.has(matchId)) return // already in flight
    unmatchingRef.current.add(matchId)
    console.log('[ReciRing] Unmatching:', matchId)

    // Optimistic: remove from UI immediately
    setMatches(prev => prev.filter(m => m.id !== matchId))
    if (chatMatchId === matchId) setChatMatchId(null)

    const { error } = await unmatchMatch(matchId)
    unmatchingRef.current.delete(matchId)
    if (error) {
      console.error('[ReciRing] Unmatch failed:', error)
      alert('Failed to unmatch: ' + (error.message || JSON.stringify(error)) +
        '\n\nHave you run the migration-unmatch.sql script in Supabase SQL Editor?')
      await loadMatches()
      return
    }
    console.log('[ReciRing] Unmatch succeeded for', matchId)
    await Promise.all([loadMatches(), loadMatchedPostIds(), loadUnmatchedPostIds()])
  }

  // ── Identity reveal handlers ────────────────────────────────
  // All three trigger a matches refetch via realtime UPDATE subscription;
  // we also do a local refetch for the initiator so the UI updates without
  // waiting for the round-trip.
  const handleRequestReveal = useCallback(async (matchId) => {
    if (!user) return
    const id = matchId || chatMatchId
    if (!id) return
    const { error } = await requestIdentityReveal(id, user.id)
    if (error) {
      console.error('[ReciRing] Reveal request failed:', error)
      alert('Could not send reveal request: ' + (error.message || 'unknown'))
      return
    }
    await loadMatches()
  }, [user?.id, chatMatchId, loadMatches])

  const handleAcceptReveal = useCallback(async (matchId) => {
    if (!user) return
    const id = matchId || chatMatchId
    if (!id) return
    const { error } = await acceptIdentityReveal(id)
    if (error) {
      console.error('[ReciRing] Reveal accept failed:', error)
      alert('Could not accept reveal: ' + (error.message || 'unknown'))
      return
    }
    await loadMatches()
  }, [user?.id, chatMatchId, loadMatches])

  const handleDeclineReveal = useCallback(async (matchId) => {
    if (!user) return
    const id = matchId || chatMatchId
    if (!id) return
    const { error } = await declineIdentityReveal(id)
    if (error) {
      console.error('[ReciRing] Reveal decline failed:', error)
      alert('Could not decline reveal: ' + (error.message || 'unknown'))
      return
    }
    await loadMatches()
  }, [user?.id, chatMatchId, loadMatches])

  // Fetch peer profile when a chat opens with an accepted reveal,
  // or when the reveal flips to accepted while the chat is open.
  useEffect(() => {
    if (!chatMatchId) { setPeerProfile(null); return }
    const current = matches.find(m => m.id === chatMatchId)
    if (!current) return
    if (current.reveal?.status !== 'accepted') { setPeerProfile(null); return }
    let cancelled = false
    fetchPeerProfile(current.peerId).then(({ data, error }) => {
      if (cancelled) return
      if (error) { console.error('[ReciRing] Peer profile fetch failed:', error); return }
      setPeerProfile(data)
    })
    return () => { cancelled = true }
  }, [chatMatchId, matches])

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

    // Clear any outstanding feedback_request notifications for this match
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('type', 'feedback_request')
      .is('read_at', null)
      .filter('payload->>match_id', 'eq', matchId)
      .then(() => {})

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
          h-[100dvh]      sm:h-[844px]
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

        {/* ── App header ────────────────────────────────────── */}
        <header
          className="app-header flex-shrink-0 px-5 pb-3 pt-5 sm:pt-14"
          style={{ background: C.white }}
        >
          <div className="flex items-center justify-between">
            <ReciRingLogo size={34} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* Notification bell */}
              {user && (
                <NotificationBell
                  userId={user.id}
                  onOpenNotification={handleNotificationOpen}
                />
              )}

            {/* Avatar — taps through to the Profile tab. Dropdown removed;
                  all account / profile actions live under the Profile tab. */}
            <button
              type="button"
              onMouseEnter={() => setProfileHovered(true)}
              onMouseLeave={() => setProfileHovered(false)}
              onClick={() => { setTab('profile'); setProfileSubTab('profile') }}
              title="Profile"
              className="active:scale-95"
              style={{
                width: 42, height: 42,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                padding: 0, flexShrink: 0,
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
              aria-label="Open profile"
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
          {showAdminEmailTest && session && isAdmin(user?.email) ? (
            <AdminEmailTest onClose={() => setShowAdminEmailTest(false)} />
          ) : <>
          {tab === 'discover' && (
            <CardStack
              requests={visibleRequests}
              unmatchedPostIds={unmatchedPostIds}
              interactionMap={interactionMap}
              onSwipeRight={(r) => console.log('Helping:', r.id)}
              onSwipeLeft={(r) => recordInteraction(r.id, 'swiped_left')}
              onCardViewed={(r) => recordInteraction(r.id, 'viewed')}
              onMatchConfirm={handleMatchConfirm}
              onOpenChat={handleOpenChat}
              onScheduleChat={handleScheduleChat}
              onReport={handleReport}
              onBlock={handleBlock}
            />
          )}
          {tab === 'post' && (
            <PostHub
              myPosts={myPosts}
              onCreatePost={handleNewRequest}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              isSupabaseConfigured={isSupabaseConfigured}
            />
          )}
          {tab === 'matches' && !chatMatchId && (
            <AppScreen>
              <MatchesList
                matches={matches}
                onOpenChat={(id) => setChatMatchId(id)}
                revealedMatchIds={revealedMatchIds}
              />
            </AppScreen>
          )}
          {tab === 'matches' && chatMatchId && (
            <div className="flex-1 min-h-0 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
              <ChatView
                match={matches.find(m => m.id === chatMatchId)}
                messages={chatMessages}
                peerProfile={peerProfile}
                autoOpenSchedule={chatAutoOpenSchedule}
                onScheduleOpened={() => setChatAutoOpenSchedule(false)}
                onSend={(content) => handleSendMessage(chatMatchId, content)}
                onProposeMeeting={(data) => handleProposeMeeting(chatMatchId, data)}
                onMeetingResponse={(msgId, status) => handleMeetingResponse(chatMatchId, msgId, status)}
                onBack={() => setChatMatchId(null)}
                onNavigateReview={() => {
                  setReviewMatchId(chatMatchId)
                  setChatMatchId(null)
                  setTab('profile')
                  setProfileSubTab('reviews')
                }}
                onReport={handleReport}
                onBlock={handleBlock}
                onUnmatch={() => handleUnmatch(chatMatchId)}
                onRequestReveal={() => handleRequestReveal(chatMatchId)}
                onAcceptReveal={() => handleAcceptReveal(chatMatchId)}
                onDeclineReveal={() => handleDeclineReveal(chatMatchId)}
              />
            </div>
          )}
          {tab === 'profile' && (
            <ProfilePage
              subTab={profileSubTab}
              onSubTabChange={setProfileSubTab}
              pendingReviewMatches={pendingReviewMatches}
              pastReviews={pastReviews}
              allMatches={matches}
              reviewMatchId={reviewMatchId}
              onSelectReviewMatch={(id) => setReviewMatchId(id)}
              onClearReviewMatch={() => setReviewMatchId(null)}
              onSubmitReview={handleSubmitReview}
              onOpenAdminEmailTest={() => setShowAdminEmailTest(true)}
              onOpenEvent={(id) => {
                // Deep-link from Profile → Memory into an event's detail
                // page. Switching tab AND setting viewingEventId in one
                // shot keeps the transition smooth.
                setViewingEventId(id)
                setTab('events')
              }}
            />
          )}
          {tab === 'events' && editingEventId && (
            <EditEventForm
              eventId={editingEventId}
              onSaved={() => {
                setEditingEventId(null)
                setEventDetailRefreshKey(k => k + 1)
                setEventsRefreshKey(k => k + 1)
              }}
              onClose={() => setEditingEventId(null)}
            />
          )}
          {tab === 'events' && !editingEventId && viewingEventId && (
            <EventDetailPage
              key={`${viewingEventId}-${eventDetailRefreshKey}`}
              eventId={viewingEventId}
              onBack={() => { setViewingEventId(null); setEventsRefreshKey(k => k + 1) }}
              onEdit={(id) => setEditingEventId(id)}
            />
          )}
          {tab === 'events' && !editingEventId && !viewingEventId && !showCreateEvent && (
            <EventsList
              key={eventsRefreshKey}
              onCreateEvent={() => setShowCreateEvent(true)}
              onOpenEvent={(id) => setViewingEventId(id)}
            />
          )}
          {tab === 'events' && !editingEventId && !viewingEventId && showCreateEvent && (
            <CreateEventForm
              onCreated={() => {
                setShowCreateEvent(false)
                setEventsRefreshKey(k => k + 1)
              }}
              onClose={() => setShowCreateEvent(false)}
            />
          )}
          </>}
        </main>

        {/* ── Bottom tab bar ────────────────────────────────── */}
        {/* paddingBottom uses env(safe-area-inset-bottom) so on real iOS
            the home indicator never overlaps the tab buttons. Falls back
            to 8px on browsers where the inset is 0 (desktop, Android). */}
        <nav
          className="flex-shrink-0 flex justify-around items-center pt-2 px-1"
          style={{
            background: 'rgba(255,255,255,0.96)',
            borderTop: `1px solid ${C.border}`,
            backdropFilter: 'blur(20px)',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
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

        {/* Decorative iOS home indicator — desktop-only (the real OS
            already draws one on mobile, and the nav's safe-area padding
            already reserves room for it). */}
        <div
          className="hidden sm:flex flex-shrink-0 justify-center py-2"
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

        {/* ── Post-match feedback prompt (24h after match) ────── */}
        <PostMatchFeedbackPrompt
          open={feedbackPromptOpen}
          match={feedbackPromptMatch}
          onReview={handleFeedbackReview}
          onSnooze={handleFeedbackSnooze}
          onDismiss={() => setFeedbackPromptOpen(false)}
          onUnmatch={(id) => { handleFeedbackSnooze(); handleUnmatch(id) }}
        />

        {/* ── Link Google account prompt (one-shot, institutional) ─ */}
        <LinkAccountPrompt />
      </div>
    </div>
  )
}

/* ─── Root App — auth gate ─────────────────────────────────────── */
function AppRoot() {
  const { session, profile, loading, isConfigured, passwordRecovery } = useAuth()

  // 1. No backend → skip auth entirely
  if (!isConfigured) return <AppShell />

  // 2. Password-recovery route — checked FIRST, before the loading
  //    spinner, so a slow session bootstrap can't mask the recovery
  //    UI. Route-based detection is deterministic: Supabase's
  //    PASSWORD_RECOVERY event doesn't fire reliably on the newer
  //    PKCE flow (URL uses ?code=... in query, not #type=recovery in
  //    hash), so we also accept the flag for legacy hash links.
  const path = window.location.pathname
  const hash = window.location.hash
  const isRecoveryRoute =
    path === '/reset-password'
    || passwordRecovery
    || hash.includes('type=recovery')
  if (isRecoveryRoute) return <ResetPasswordPage />

  // 3. Configured but still bootstrapping session
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

  // 4. Email-confirmed landing page (after clicking confirmation link)
  if (path === '/auth/confirmed') {
    return (
      <EmailConfirmed
        onGoToLogin={() => {
          window.history.replaceState({}, '', '/')
          window.location.reload()
        }}
      />
    )
  }

  // 5. Not logged in
  if (!session) return <LoginScreen />

  // 5. Logged in but hasn't completed onboarding
  //    Only gate if the column exists (i.e. migration has been run).
  //    If onboarding_done is undefined, the column doesn't exist — skip.
  if (profile && profile.onboarding_done === false) return <OnboardingProfile />

  // 6. Fully onboarded
  return <AppShell />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  )
}
