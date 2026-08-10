import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import CardStack from './components/CardStack'
import PostHub from './components/PostHub'
import AppScreen from './components/AppScreen'
import MatchesList from './components/MatchesList'
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
import SettingsPage, { resolveAvatarSeed } from './components/SettingsPage'
import OnboardingProfile from './components/OnboardingProfile'
import ProfileOnboardingV3 from './components/profile/ProfileOnboardingV3'
import { isProfileV3Enabled } from './lib/featureFlags'
import AnonymousAvatar from './components/AnonymousAvatar'
import MyPostsPage from './components/MyPostsPage'
import AdminEmailTest from './components/AdminEmailTest'
import AdminEventReview from './components/AdminEventReview'
import EventsList from './components/EventsList'
import CreateEventForm, { hasFreshEventDraft } from './components/CreateEventForm'
import EditEventForm from './components/EditEventForm'
import EventDetailPage from './components/EventDetailPage'
import EventPreparePage from './components/EventPreparePage'
import ProfilePage from './components/ProfilePage'
import HomePage from './components/HomePage'
import RequestDetailModal from './components/RequestDetailModal'
import AskMutuSheet from './components/AskMutuSheet'
import { isAdmin } from './data/adminEmails'
import { submitReport, blockUser, fetchBlockedIds } from './lib/safety'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { fetchPosts, createPost, updatePost } from './lib/posts'
import { markMarketplacePostSharedToDiscover } from './lib/marketplace'
import { HELP_TYPES, INDUSTRIES } from './data/requestOptions'
import { backfillMatchingTags } from './lib/profileBackfill'
import { fetchDiscoverEventPromos, logPromoEvent } from './lib/discoverPromos'
import { fetchMyJoinedEventIds } from './lib/events'
import { createMatch, fetchMyMatches, fetchMatchedPostIds, fetchUnmatchedPostIds, unmatchMatch, matchToUI, requestIdentityReveal, acceptIdentityReveal, declineIdentityReveal, fetchPeerProfile } from './lib/matches'
import { fetchUserInteractions, recordPostInteraction, clearSwipedLeft, unpassPost } from './lib/interactions'
import { fetchCompletedMatchIds } from './lib/recognition'
import { track } from './lib/analytics'
import { notifyEventReview, notifyNewMatch } from './lib/email'
import { fetchMessages, sendMessage, sendMeetingProposal, updateMeetingStatus, msgToUI, markMessagesRead } from './lib/messages'

/* ─── Design tokens ─────────────────────────────────────────────── */
const C = {
  gold:        '#C9A33B',
  goldLight:   '#E8D9A7',
  goldBg:      '#F8F3E5',
  text:        '#111111',
  textSub:     '#6B7280',
  textMuted:   '#9CA3AF',
  border:      'rgba(201,163,59,0.22)',
  white:       '#FFFFFF',
}

/* Initials for the fallback avatar — matches the Profile page's gold circle. */
function profileInitials(name) {
  const p = String(name || '').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'M'
}

/* Map a past-event item (its need and/or offer) → seed values for the Discover
   composer. The need seeds the ask; the offer seeds what they give back — so a
   person who posted both arrives with a complete two-sided post. Free-text tags
   are matched to the known Help-type / Industry options so they land as chips. */
function marketplaceToPrefill(item) {
  if (!item) return null
  const need = item.need, offer = item.offer
  const tags = [...(need?.tags || []), ...(offer?.tags || [])]
  const offerText = offer ? (offer.title || '') + (offer.description ? ` — ${offer.description}` : '') : ''
  return {
    sourceIds:   item.postIds || [],
    sourceEvent: item.eventTitle || null,
    title:    need ? (need.title || '')       : '',
    details:  need ? (need.description || '')  : '',
    offers:   offerText.trim(),
    helpType: Array.from(new Set(tags.filter(t => HELP_TYPES.includes(t)))).slice(0, 3),
    industry: Array.from(new Set(tags.filter(t => INDUSTRIES.includes(t)))).slice(0, 3),
  }
}

/* ─── Tab definitions (5-tab nav: Home · Discover · Post · Matches · Events).
   Profile is NOT a bottom-nav tab — it opens from the top-right avatar. ── */
const TABS = [
  {
    id: 'home',
    label: 'Home',
    icon: (active) => (
      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5" />
      </svg>
    ),
  },
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
]

/* ─── App shell (authenticated) ─────────────────────────────────── */
function AppShell() {
  const { session, user, profile, viewerProfile, signOut, updateProfile } = useAuth()
  // Boot straight back into the event-create form if an unexpired draft is
  // waiting — an iOS webview reload mid-form otherwise dumps the user on the
  // Discover tab, so the restored draft (fb7) would sit unseen behind a tab
  // they'd have to navigate to. If a draft exists, start on Events with the
  // form open so CreateEventForm mounts and repopulates from it immediately.
  const resumingEventDraft = hasFreshEventDraft()
  const [tab, setTab]             = useState(resumingEventDraft ? 'events' : 'home')
  // Transient banner, currently just the "first event is pending review" notice.
  const [banner, setBanner] = useState(null)
  // Profile sub-tab is lifted to App so that chat→review deep-links can
  // jump straight to the Reviews sub-tab on the Profile page.
  const [profileSubTab, setProfileSubTab] = useState('profile')
  const [showAdminEmailTest, setShowAdminEmailTest] = useState(false)
  const [showEventReview, setShowEventReview] = useState(false)
  const [showCreateEvent, setShowCreateEvent] = useState(resumingEventDraft)
  // Currently opened event id — when set, Events tab renders the
  // detail page instead of the list. Null = list view.
  const [viewingEventId, setViewingEventId] = useState(null)
  // When set, Events tab renders EditEventForm overlay on top of the
  // detail page. The detail page id stays in viewingEventId so closing
  // the editor returns there cleanly.
  const [editingEventId, setEditingEventId] = useState(null)
  // When set, Events tab renders the dedicated Prepare page for that event.
  const [preparingEventId, setPreparingEventId] = useState(null)
  // Events tab's Events-vs-My-Networking toggle. Held here so it survives
  // EventsList being remounted (key bump) when returning from an event.
  const [eventsTopView, setEventsTopView] = useState('discover')
  // Events tab's Upcoming-vs-My-events (past) filter. Also held here for the
  // same reason — otherwise opening a past event and pressing Back snapped the
  // list back to Upcoming instead of the "My events" list it came from.
  const [eventsFilter, setEventsFilter] = useState('upcoming')
  // Optional initial sub-view for the event detail (e.g. 'recap' from a contact).
  const [eventInitialView, setEventInitialView] = useState(null)
  const [promoOriginEventId, setPromoOriginEventId] = useState(null) // event opened via a Discover promo card
  const [homePostDetail, setHomePostDetail] = useState(null) // community post opened from a Home "People" card
  const [askMutuOpen, setAskMutuOpen] = useState(false) // Home → Ask Mutu (grounded networking assistant)
  // Bump this to force EventsList to refetch after a new event is created.
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0)
  // Bump this to force EventDetailPage to refetch after save.
  const [eventDetailRefreshKey, setEventDetailRefreshKey] = useState(0)
  const [requests, setRequests]   = useState([])
  const [eventPromos, setEventPromos] = useState([]) // promotable event-marketplace previews for Discover
  const [matches, setMatches]     = useState([])
  const [completedMatchIds, setCompletedMatchIds] = useState(new Set())
  const [chatMatchId, setChatMatchId] = useState(null)
  const [chatMessages, setChatMessages] = useState([]) // messages for current chat
  const [peerProfile, setPeerProfile]   = useState(null) // peer's profile when reveal is accepted
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

  // Load promotable event-marketplace previews for the Discover deck. Gated
  // server-side by the discover_event_promos view (both consent flags, still
  // upcoming + not full); we just tag each with whether the user already
  // joined so the CTA can read "Open Event Marketplace".
  // Refetch each time the user lands on Discover so edits/deletes made in the
  // marketplace are reflected (the promo cards are otherwise cached). Also
  // excludes the viewer's own posts — you're never recommended your own post.
  useEffect(() => {
    if (!isSupabaseConfigured || !user) { setEventPromos([]); return }
    if (tab !== 'discover') return
    let alive = true
    ;(async () => {
      const { data: joinedIds } = await fetchMyJoinedEventIds(user.id)
      const joinedSet = joinedIds instanceof Set ? joinedIds : new Set(joinedIds || [])
      const { data, error } = await fetchDiscoverEventPromos({ joinedEventIds: joinedSet, excludeUserId: user.id })
      if (!alive) return
      if (error) { console.error('[ReciRing] Failed to load event promos:', error); return }
      setEventPromos(data || [])
    })()
    return () => { alive = false }
  }, [user, tab])

  // Load matches from Supabase
  const loadMatches = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return
    const { data, error } = await fetchMyMatches(user.id)
    if (error) { console.error('[ReciRing] Failed to load matches:', error); return }
    const ui = data.map(m => matchToUI(m, user.id))
    // Resolve the peer's real name for identity-revealed matches so the
    // Matches list shows it (instead of always "Anonymous Peer").
    const revealedPeerIds = [...new Set(ui.filter(m => m.reveal?.status === 'accepted' && m.peerId).map(m => m.peerId))]
    if (revealedPeerIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, avatar_url').in('id', revealedPeerIds)
      const byId = Object.fromEntries((profs || []).map(p => [p.id, p]))
      for (const m of ui) {
        const p = m.reveal?.status === 'accepted' ? byId[m.peerId] : null
        if (p) { m.peerName = p.name || null; m.peerAvatarUrl = /^https?:/.test(p.avatar_url || '') ? p.avatar_url : null }
      }
    }
    setMatches(ui)
    // Refresh which of my matches are "completed" (both tapped "We met"), so the
    // list can split active vs. past exchanges. Best-effort — ignore errors.
    const { ids } = await fetchCompletedMatchIds()
    setCompletedMatchIds(ids)
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

  // Deep link: reciring.com/?event=<id> (e.g. from a shared poster's QR code).
  // Stash the id so it survives the signup flow for brand-new members, and
  // strip it from the URL so it doesn't re-trigger.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const ev = params.get('event')
      const tabParam = params.get('tab')   // e.g. ?tab=matches from a match email
      let changed = false
      if (ev) { sessionStorage.setItem('mutu_pending_event', ev); params.delete('event'); changed = true }
      if (tabParam) {
        if (['home', 'discover', 'post', 'matches', 'events'].includes(tabParam)) {
          sessionStorage.setItem('mutu_pending_tab', tabParam)
        }
        params.delete('tab'); changed = true
      }
      if (changed) {
        const qs = params.toString()
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
      }
    } catch { /* no-op */ }
  }, [])

  // Once signed in, open any pending deep link (event QR/link, or a tab from an
  // email CTA). A specific event wins over a plain tab.
  useEffect(() => {
    if (!user) return
    let ev = null, pendingTab = null
    try {
      ev = sessionStorage.getItem('mutu_pending_event')
      pendingTab = sessionStorage.getItem('mutu_pending_tab')
    } catch { /* no-op */ }
    if (ev) {
      try { sessionStorage.removeItem('mutu_pending_event'); sessionStorage.removeItem('mutu_pending_tab') } catch { /* no-op */ }
      setTab('events')
      setViewingEventId(ev)
      return
    }
    if (pendingTab) {
      try { sessionStorage.removeItem('mutu_pending_tab') } catch { /* no-op */ }
      setTab(pendingTab)
    }
  }, [user?.id])

  // Bring back every post the user passed — clears 'swiped_left' so they
  // return to the Discover deck. Optimistic, then reconcile from DB.
  const restorePassedPosts = useCallback(async () => {
    if (!user) return
    setInteractionMap(prev => {
      const next = new Map()
      for (const [pid, t] of prev) if (t !== 'swiped_left') next.set(pid, t)
      return next
    })
    const { error } = await clearSwipedLeft(user.id)
    if (error) { console.warn('[ReciRing] clearSwipedLeft failed:', error.message || error); loadInteractions() }
  }, [user?.id, loadInteractions])

  // Record a Discover interaction. Optimistic + non-blocking.
  // Priority: swiped_left > viewed > none. Refuses to downgrade an
  // existing 'swiped_left' to 'viewed'.
  const recordInteraction = useCallback((postId, type) => {
    if (!user || !postId) return
    let write = true
    setInteractionMap(prev => {
      const existing = prev.get(postId)
      // Never downgrade a pass to a view (and skip redundant writes).
      if ((existing === 'swiped_left' && type === 'viewed') || existing === type) { write = false; return prev }
      const next = new Map(prev)
      next.set(postId, type)
      return next
    })
    if (!write) return
    // Fire and forget — UX prefers responsiveness over write confirmation.
    // If it fails, the next load will re-sync from DB.
    recordPostInteraction(user.id, postId, type).then(({ error }) => {
      if (error) console.warn('[ReciRing] recordPostInteraction failed:', error.message || error)
    })
  }, [user?.id])

  // Rewind / undo the last pass: un-pass a single post so it returns to the
  // deck. Optimistic (drop it from the local map → treated as unseen), then
  // delete the swiped_left row.
  const unpassOne = useCallback((postId) => {
    if (!user || !postId) return
    setInteractionMap(prev => {
      if (!prev.has(postId)) return prev
      const next = new Map(prev)
      next.delete(postId)
      return next
    })
    unpassPost(user.id, postId).then(({ error }) => {
      if (error) console.warn('[ReciRing] unpassPost failed:', error.message || error)
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
          const newMeta = payload.new.metadata
          setChatMessages(prev => prev.map(m => {
            if (m.id !== payload.new.id) return m
            // Meeting status change → rebuild the message from the row.
            if (payload.new.type === 'meeting_proposal' && newMeta?.status && m.meeting?.status !== newMeta.status) {
              return msgToUI(payload.new, uid)
            }
            // Read receipt → light up the sender's ✓✓ without touching the rest.
            if (payload.new.read_at && m.readAt !== payload.new.read_at) {
              return { ...m, readAt: payload.new.read_at }
            }
            return m
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [chatMatchId, user?.id])

  // Read receipts: while the chat is open, mark the peer's messages as read.
  // Optimistically flip local readAt so this doesn't re-fire, and guard against
  // overlapping calls. The peer's client gets the ✓✓ via the realtime UPDATE.
  const markingReadRef = useRef(false)
  useEffect(() => {
    if (!isSupabaseConfigured || !chatMatchId || !user) return
    const hasUnread = chatMessages.some(m => m.senderId === 'peer' && !m.readAt)
    if (!hasUnread || markingReadRef.current) return
    markingReadRef.current = true
    markMessagesRead(chatMatchId, user.id)
      .then(() => setChatMessages(prev => prev.map(m =>
        m.senderId === 'peer' && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m)))
      .finally(() => { markingReadRef.current = false })
  }, [chatMatchId, chatMessages, user?.id])

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

  // Load blocked user ids on mount
  useEffect(() => {
    if (!user) return
    fetchBlockedIds(user.id).then(({ data }) => {
      if (data) setBlockedIds(new Set(data))
    })
  }, [user?.id])

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
        // Recognition now happens inside the match thread — open it there.
        if (matchId) { setTab('matches'); setChatMatchId(matchId) }
        else { setTab('profile'); setProfileSubTab('profile') }
        break
      case 'review_received':
        setTab('profile')
        setProfileSubTab('profile')
        break
      case 'event_cancelled':
      case 'event_joined':
      case 'event_message':
      case 'event_below_min':
      case 'marketplace_interest': {
        // marketplace_interest: open the event so the owner can review interest
        // in the Marketplace tab.
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
    () => {
      const now = Date.now()
      return requests.filter(r => {
        const creatorId = r.created_by || r.poster_id
        if (creatorId && user && creatorId === user.id) return false     // hide own posts
        if (creatorId && blockedIds.has(creatorId))     return false     // hide blocked
        if (r.id && matchedPostIds.has(r.id))           return false     // hide already-matched
        if (r.expiresAt && new Date(r.expiresAt).getTime() < now) return false  // hide expired
        return true
      })
    },
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

  // A past-event Event Board post the user chose to carry into Discover. Seeds
  // the composer; cleared once posted (and the source is stamped as shared).
  const [postPrefill, setPostPrefill] = useState(null)
  const handleSharePastPost = useCallback((mkt) => {
    setPostPrefill(marketplaceToPrefill(mkt))
    setTab('post')
  }, [])

  const handleNewRequest = async (newReq) => {
    if (isSupabaseConfigured && user) {
      const { data: card, error } = await createPost(user.id, newReq)
      if (error) return { error }
      setRequests((prev) => [card, ...prev])
      // Quietly grow the matching profile from the structured choices they just
      // made: the help types they're asking for → "want to learn", the tagged
      // industries → interests. Additive only; fire-and-forget with a subtle
      // notice so it's transparent and editable.
      backfillMatchingTags({
        profile, updateProfile,
        learnTags: newReq.helpType, industryTags: newReq.industry,
      }).then(({ added }) => {
        if (added?.length) setBanner(`Added ${added.join(', ')} to your matching profile — edit anytime in Profile → Skills & matching.`)
      }).catch(() => {})
      // If this post was carried over from a past event, stamp every source
      // row (need + offer) so the reminder stops and we never republish twice.
      if (postPrefill?.sourceIds?.length) {
        postPrefill.sourceIds.forEach(id => markMarketplacePostSharedToDiscover(id).catch(() => {}))
        setPostPrefill(null)
      }
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
      console.error('[ReciRing] Match creation failed:', error)
      alert('Failed to create match: ' + (error.message || 'Unknown error'))
      return { matchId: null, error }
    }
    // Refresh both sets: the post joins the active-matched set (hidden from
    // Discover) and leaves the unmatched set if it was a reconnect.
    await Promise.all([loadMatches(), loadMatchedPostIds(), loadUnmatchedPostIds()])
    // Email the post author that someone connected — fire-and-forget so a
    // mail hiccup never affects the match that already succeeded.
    notifyNewMatch(data.id).catch(() => {})
    // Funnel: the "matched" step.
    track('match_created', { match_id: data.id, post_id: request.id })
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
            '0 0 0 1px rgba(201,163,59,0.15)',
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
                width: 34, height: 34,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                padding: 0, flexShrink: 0,
                background: resolveAvatarSeed(profile?.avatar_url) ? 'none' : '#D9C084',
                border: resolveAvatarSeed(profile?.avatar_url) ? '1px solid #E8D9A7' : 'none',
                boxShadow: profileHovered ? '0 0 0 3px rgba(201,163,59,0.12)' : 'none',
                transform: profileHovered ? 'scale(1.04)' : 'scale(1)',
                transition: 'all 0.2s ease',
              }}
              aria-label="Open profile"
            >
              {resolveAvatarSeed(profile?.avatar_url) ? (
                <AnonymousAvatar seed={resolveAvatarSeed(profile.avatar_url)} size={34} />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700, color: '#463516', fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1 }}>
                  {profileInitials(profile?.name)}
                </span>
              )}
            </button>
            </div>
          </div>

          {/* Symmetric gold rule — fades to transparency at both edges */}
          <div
            className="mt-3 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(201,163,59,0.28) 18%, rgba(201,163,59,0.55) 50%, rgba(201,163,59,0.28) 82%, transparent 100%)',
            }}
          />
        </header>

        {/* Transient notice banner (e.g. first-event-pending-review) */}
        {banner && (
          <div
            role="status"
            onClick={() => setBanner(null)}
            className="flex-shrink-0"
            style={{
              margin: '0 16px 8px', padding: '10px 14px',
              background: '#F8F3E5', border: '1px solid #E8D9A7', borderRadius: 12,
              fontSize: 12.5, lineHeight: 1.45, color: '#8A6E1E',
              fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}
          >
            <span style={{ flexShrink: 0 }}>⏳</span>
            <span>{banner}</span>
          </div>
        )}

        {/* ── Main content ──────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-h-0" style={{ background: '#F9F7F4' }}>
          {showAdminEmailTest && session && isAdmin(user?.email) ? (
            <AdminEmailTest onClose={() => setShowAdminEmailTest(false)} />
          ) : showEventReview && session && isAdmin(user?.email) ? (
            <AdminEventReview onClose={() => setShowEventReview(false)} />
          ) : <>
          {tab === 'home' && (
            <HomePage
              profile={profile}
              viewerProfile={viewerProfile}
              userId={user?.id}
              requests={requests}
              onOpenDiscover={() => setTab('discover')}
              onOpenEvent={(id) => { setEventInitialView(null); setViewingEventId(id); setTab('events') }}
              onOpenProfile={() => { setProfileSubTab('profile'); setTab('profile') }}
              onOpenPost={(post) => setHomePostDetail(post)}
              onOpenNetworking={() => { setEventsTopView('networking'); setViewingEventId(null); setTab('events') }}
              onOpenEvents={() => { setEventsTopView('discover'); setViewingEventId(null); setTab('events') }}
              onAskMutu={() => setAskMutuOpen(true)}
              onSharePastPost={handleSharePastPost}
            />
          )}
          {tab === 'discover' && (
            <CardStack
              requests={visibleRequests}
              eventPromos={eventPromos}
              unmatchedPostIds={unmatchedPostIds}
              interactionMap={interactionMap}
              onSwipeRight={(r) => track('discover_swipe_right', { post_id: r.id })}
              onSwipeLeft={(r) => recordInteraction(r.id, 'swiped_left')}
              onUnpass={unpassOne}
              onCardViewed={(r) => { recordInteraction(r.id, 'viewed'); track('discover_card_opened', { post_id: r.id }) }}
              onMatchConfirm={handleMatchConfirm}
              onOpenChat={handleOpenChat}
              onScheduleChat={handleScheduleChat}
              onReport={handleReport}
              onBlock={handleBlock}
              onRestorePassed={restorePassedPosts}
              onPromoImpression={(p) => { if (user) logPromoEvent(user.id, { eventId: p.eventId, postId: p.postId, kind: 'preview_impression' }) }}
              onOpenEventPromo={(p) => {
                if (user) logPromoEvent(user.id, { eventId: p.eventId, postId: p.postId, kind: 'detail_open' })
                setPromoOriginEventId(p.eventId)
                setEventInitialView(null)
                setViewingEventId(p.eventId)
                setTab('events')
              }}
            />
          )}
          {tab === 'post' && (
            <PostHub
              myPosts={myPosts}
              onCreatePost={handleNewRequest}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              isSupabaseConfigured={isSupabaseConfigured}
              prefill={postPrefill}
            />
          )}
          {tab === 'matches' && !chatMatchId && (
            <AppScreen>
              <MatchesList
                matches={matches}
                completedMatchIds={completedMatchIds}
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
                currentUserId={user?.id}
                onSeeImpact={() => {
                  setChatMatchId(null)
                  setTab('profile')
                  setProfileSubTab('profile')
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
              allMatches={matches}
              onOpenAdminEmailTest={() => setShowAdminEmailTest(true)}
              onOpenEventReview={() => setShowEventReview(true)}
              onOpenEvent={(id) => {
                // Deep-link from Profile → Memory into an event's detail
                // page. Switching tab AND setting viewingEventId in one
                // shot keeps the transition smooth.
                setViewingEventId(id)
                setTab('events')
              }}
            />
          )}
          {tab === 'events' && preparingEventId && (
            <EventPreparePage
              eventId={preparingEventId}
              userId={user?.id}
              onBack={() => setPreparingEventId(null)}
              onSaved={() => { const id = preparingEventId; setPreparingEventId(null); setEventInitialView('marketplace'); setViewingEventId(id); setTab('events') }}
            />
          )}
          {tab === 'events' && !preparingEventId && editingEventId && (
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
          {tab === 'events' && !preparingEventId && !editingEventId && viewingEventId && (
            <EventDetailPage
              key={`${viewingEventId}-${eventDetailRefreshKey}-${eventInitialView || ''}`}
              eventId={viewingEventId}
              initialViewMode={eventInitialView}
              cameFromPromo={viewingEventId === promoOriginEventId}
              onJoined={() => {
                if (user && viewingEventId === promoOriginEventId) {
                  logPromoEvent(user.id, { eventId: viewingEventId, kind: 'join_conversion' })
                }
              }}
              onBack={() => { setViewingEventId(null); setEventInitialView(null); setPromoOriginEventId(null); setEventsRefreshKey(k => k + 1) }}
              onEdit={(id) => setEditingEventId(id)}
              // Keep viewingEventId set so tapping Back on the Prepare page
              // returns to THIS event's detail page (where they came from),
              // not the events list.
              onPrepare={(id) => { setPreparingEventId(id) }}
              onOpenMatch={(matchId) => { setViewingEventId(null); loadMatches(); setTab("matches"); setChatMatchId(matchId) }}
            />
          )}
          {tab === 'events' && !preparingEventId && !editingEventId && !viewingEventId && !showCreateEvent && (
            <EventsList
              key={eventsRefreshKey}
              topView={eventsTopView}
              onTopViewChange={setEventsTopView}
              filter={eventsFilter}
              onFilterChange={setEventsFilter}
              onCreateEvent={() => setShowCreateEvent(true)}
              onOpenEvent={(id) => { setEventInitialView(null); setViewingEventId(id) }}
              onOpenEventRecap={(id) => { setEventInitialView('recap'); setViewingEventId(id) }}
              onPrepare={(id) => { setViewingEventId(null); setPreparingEventId(id) }}
              onOpenMatch={(matchId) => { loadMatches(); setTab("matches"); setChatMatchId(matchId) }}
              onAskMutu={() => setBanner('Ask Mutu — your networking assistant — is coming soon. For now, prepare for events and connect on the Opportunity Board inside each event.')}
            />
          )}
          {tab === 'events' && !preparingEventId && !editingEventId && !viewingEventId && showCreateEvent && (
            <CreateEventForm
              onCreated={(data, meta) => {
                setShowCreateEvent(false)
                setEventsRefreshKey(k => k + 1)
                if (meta?.pendingReview) {
                  setBanner("Your first event is in review — we'll publish it once it's approved. Others can't see it yet. It stays marked “Under review” on your Events tab until then.")
                  // Alert the admin there's something to review (fire-and-forget).
                  if (data?.id) notifyEventReview(data.id)
                }
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

        {/* Home → Ask Mutu — grounded on the user's own networking data. */}
        {user && (
          <AskMutuSheet open={askMutuOpen} userId={user.id} events={[]} onClose={() => setAskMutuOpen(false)} />
        )}

        {/* Community post opened from a Home "People" card. */}
        {homePostDetail && (
          <RequestDetailModal
            request={homePostDetail}
            onClose={() => setHomePostDetail(null)}
            onMatch={async (r) => {
              const { matchId } = await handleMatchConfirm(r)
              setHomePostDetail(null)
              if (matchId) { loadMatches(); setChatMatchId(matchId); setTab('matches') }
            }}
            onPass={(r) => { recordInteraction(r.id, 'swiped_left'); setHomePostDetail(null) }}
            onReport={handleReport}
            onBlock={handleBlock}
          />
        )}

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
  //    Flagged accounts get the redesigned 4-step wizard; everyone else the
  //    untouched legacy onboarding.
  if (profile && profile.onboarding_done === false) {
    return isProfileV3Enabled(session?.user) ? <ProfileOnboardingV3 /> : <OnboardingProfile />
  }

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
