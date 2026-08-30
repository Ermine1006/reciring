import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AppScreen from '../AppScreen'
import PeerAvatar from '../PeerAvatar'
import PartnerCard from './PartnerCard'
import QuickSetupCard from './QuickSetupCard'
import PracticeSetupFlow from './PracticeSetupFlow'
import InvitationsList from './InvitationsList'
import PairingDetail from './PairingDetail'
import CompletedExchanges from './CompletedExchanges'
import ExchangeEventCard from './ExchangeEventCard'
import ImpactSheet from './ImpactSheet'
import { PassportCard, PassportDetail } from './PracticePassport'
import TokenUnlockModal from './TokenUnlockModal'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  fetchCommunityBySlug, fetchMyCommunityMembership,
  fetchMyPracticeRequest, fetchMyAvailabilityWindows,
  createPracticeRequest, updatePracticeRequest, setPracticeRequestStatus,
  replaceAvailabilityWindows, browsePracticeRequests,
  fetchMyPairings, sendPracticeInvitation, acceptPracticeInvitation,
  declinePracticeInvitation, withdrawPracticeInvitation,
  fetchPairingWindows, fetchMySessions,
  proposePracticeSession, confirmPracticeSession, declinePracticeSession,
  withdrawPracticeSession, cancelPracticeSession,
  fetchSessionConfirmations, submitPracticeConfirmation, fetchMyPracticeConfirmations,
  fetchMyExchangeTokens, fetchProfilesByIds, endPracticePairing, fetchSessionModeSupport,
  fetchFeedbackSupport, fetchMyPracticeFeedback, reportPracticeFeedback,
} from '../../lib/practice'
import { fetchUpcomingEvents, fetchMyJoinedEventIds } from '../../lib/events'
import { deriveDisplayState, formatSessionTime, mutualFit } from '../../lib/practiceMatching'
import { practiceErrorMessage, DEFAULT_TIMEZONE, DEFAULT_DURATION_MINUTES } from '../../data/practiceOptions'
import { computeReputation } from '../../lib/reputation'
import { computePassport } from '../../lib/practicePassport'
import { shouldClearGuideState, clearGuideState } from '../../lib/guidedPractice'
import { MATCHA_DEEP, MATCHA_SOFT } from '../../lib/matchaCta'
import { track } from '../../lib/analytics'
import { ActivitySummary, ConnectionCards, MatchingStatus, TogetherStyles, TOGETHER_CLASS } from './TogetherSections'
import { matchingState } from '../../lib/togetherSummary'
import { PAGE } from '../../data/togetherContent'

// ── PracticeHub — the EXCHANGE tab root ──────────────────────────
// (Internal name kept per constraint; user-facing label is Exchange.)
// Mental model exposed to users: find someone → agree on a time →
// help each other → confirm → earn a Token. Nothing else.
//   Explore:     "Practise with someone" (reciprocal, Token-eligible)
//                + a visually separate "Community events" section.
//   My Activity: To do · Upcoming · History (+ collapsed groups).

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

// Action-specific titles: no user should have to decode a state name.
const TODO_TITLES = {
  scheduling: (n) => `Choose a time with ${n}`,
  proposal_received: (n) => `Confirm the time with ${n}`,
  ready_to_confirm: (n) => `Confirm completion with ${n}`,
}
const WAITING_TITLES = {
  proposal_sent: (n) => `${n} is reviewing your time`,
  waiting_for_partner: (n) => `${n} still needs to confirm completion`,
}
const NEEDS_ACTION = new Set(Object.keys(TODO_TITLES))
const AWAITING = new Set(Object.keys(WAITING_TITLES))

// Demo data (Supabase unconfigured only).
const DEMO_ROWS = [
  {
    request_id: 'demo-1', want_types: ['behavioural'], want_focus: 'Consulting fit stories',
    help_types: ['case'], help_focus: 'Market sizing', help_context: '2 yrs consulting pre-MBA',
    location_type: 'virtual', duration_minutes: 60, timezone: 'America/Toronto', mutual_fit: true,
    windows: [
      { id: 'demo-w1', starts_at: new Date(Date.now() + 2 * 864e5).toISOString(), ends_at: new Date(Date.now() + 2 * 864e5 + 54e5).toISOString() },
      { id: 'demo-w2', starts_at: new Date(Date.now() + 4 * 864e5).toISOString(), ends_at: new Date(Date.now() + 4 * 864e5 + 54e5).toISOString() },
    ],
  },
]
const DEMO_EVENTS = [
  { id: 'demo-e1', title: 'Consulting Coffee & Cases', start_at: new Date(Date.now() + 4 * 864e5).toISOString(), location: 'Rotman · L2 Commons', category: 'Networking', attendee_count: 12, image_url: '/email-assets/2a337c25-faf9-4ccf-b2af-a7d56295da44.png' },
]
const DEMO_TOKENS = [
  { id: 'demo-t1', session_id: 'demo-s1', user_lo: 'demo-user', user_hi: 'demo-peer', community_id: 'demo', exchange_types: ['case'], verified_at: new Date().toISOString() },
  { id: 'demo-t2', session_id: 'demo-s2', user_lo: 'demo-user', user_hi: 'demo-peer2', community_id: 'demo', exchange_types: ['behavioural'], verified_at: new Date().toISOString() },
  { id: 'demo-t3', session_id: 'demo-s3', user_lo: 'demo-user', user_hi: 'demo-peer', community_id: 'demo', exchange_types: ['case'], verified_at: new Date().toISOString() },
]
// Demo-only Passport input: three verified sessions with two partners,
// shaped exactly like the live rows (a 'completed' confirmation
// attests BOTH rounds, which is what the database requires).
// two sessions recorded their agreement; the third predates modes and
// stays Not recorded, exactly like real history will
const DEMO_AGREEMENTS = [
  { session_mode: 'full_mock_swap', interview_category: 'case', skill_focus: null },
  { session_mode: 'quick_skill_drill', interview_category: 'case', skill_focus: 'final_recommendation' },
  { session_mode: null, interview_category: null, skill_focus: null },
]
const DEMO_SESSIONS = ['demo-s1', 'demo-s2', 'demo-s3'].map((id, i) => ({
  id, community_id: 'demo', status: 'verified',
  participant_a_user_id: 'demo-user',
  participant_b_user_id: i === 1 ? 'demo-peer2' : 'demo-peer',
  scheduled_start: new Date(Date.now() - (i + 2) * 864e5).toISOString(),
  verified_at: new Date(Date.now() - (i + 1) * 864e5).toISOString(),
  ...DEMO_AGREEMENTS[i],
}))
// Demo-only pairings so the scheduling flow is walkable without a
// database: one partnership ready to schedule, one already scheduled.
const DEMO_PAIRINGS = [
  { id: 'demo-pair-1', community_id: 'demo', status: 'accepted', counterpart_user_id: 'demo-peer',
    match_id: 'demo-match-1', invited_at: new Date(Date.now() - 6 * 864e5).toISOString(),
    accepted_at: new Date(Date.now() - 5 * 864e5).toISOString(),
    my_snapshot: { want_types: ['case'], help_types: ['behavioural'], timezone: 'America/Toronto', duration_minutes: 60 },
    their_snapshot: { want_types: ['behavioural'], help_types: ['case'] } },
  { id: 'demo-pair-3', community_id: 'demo', status: 'accepted', counterpart_user_id: 'demo-peer3',
    match_id: 'demo-match-3', invited_at: new Date(Date.now() - 2 * 864e5).toISOString(),
    accepted_at: new Date(Date.now() - 864e5).toISOString(),
    my_snapshot: { want_types: ['case'], help_types: ['case'], timezone: 'America/Toronto', duration_minutes: 60 },
    their_snapshot: { want_types: ['case'], help_types: ['case'] } },
  { id: 'demo-pair-2', community_id: 'demo', status: 'accepted', counterpart_user_id: 'demo-peer2',
    match_id: 'demo-match-2', invited_at: new Date(Date.now() - 4 * 864e5).toISOString(),
    accepted_at: new Date(Date.now() - 3 * 864e5).toISOString(),
    my_snapshot: { want_types: ['case'], help_types: ['case'], timezone: 'America/Toronto', duration_minutes: 60 },
    their_snapshot: { want_types: ['case'], help_types: ['case'] } },
  // A partnership whose practice is already verified and has nothing
  // in flight. The demo had no such row, which is how the missing
  // "Practice partners" section stayed invisible for so long.
  { id: 'demo-pair-4', community_id: 'demo', status: 'accepted', counterpart_user_id: 'demo-peer4',
    match_id: 'demo-match-4', invited_at: new Date(Date.now() - 9 * 864e5).toISOString(),
    accepted_at: new Date(Date.now() - 8 * 864e5).toISOString(),
    my_snapshot: { want_types: ['case'], help_types: ['behavioural'], timezone: 'America/Toronto', duration_minutes: 60 },
    their_snapshot: { want_types: ['behavioural'], help_types: ['case'] } },
]
const DEMO_DONE = {
  id: 'demo-s8', pairing_id: 'demo-pair-4', community_id: 'demo', status: 'verified',
  participant_a_user_id: 'demo-user', participant_b_user_id: 'demo-peer4',
  created_by_user_id: 'demo-user',
  scheduled_start: new Date(Date.now() - 2 * 864e5).toISOString(),
  verified_at: new Date(Date.now() - 2 * 864e5).toISOString(),
  duration_minutes: 75, timezone: 'America/Toronto', location_type: 'virtual', location_detail: '',
  session_mode: 'full_mock_swap', interview_category: 'case', skill_focus: null,
}
// a scheduled Full Mock Swap, shaped exactly like a live row
const DEMO_SCHEDULED = {
  id: 'demo-s4', pairing_id: 'demo-pair-2', community_id: 'demo', status: 'scheduled',
  participant_a_user_id: 'demo-user', participant_b_user_id: 'demo-peer2',
  created_by_user_id: 'demo-peer2',
  scheduled_start: new Date(Date.now() + 3 * 864e5).toISOString(),
  duration_minutes: 75, timezone: 'America/Toronto',
  location_type: 'virtual', location_detail: '',
  session_mode: 'full_mock_swap', interview_category: 'case', skill_focus: null,
  round1_interviewee_user_id: 'demo-user',
  meeting_method: 'teams',
  meeting_url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_demo%40thread.v2/0?context=%7b%22Tid%22%3a%22demo%22%7d',
  meeting_location: null,
}
const DEMO_DRILL = {
  id: 'demo-s5', pairing_id: 'demo-pair-1', community_id: 'demo', status: 'scheduled',
  participant_a_user_id: 'demo-user', participant_b_user_id: 'demo-peer',
  created_by_user_id: 'demo-user',
  scheduled_start: new Date(Date.now() - 6e5).toISOString(),
  duration_minutes: 30, timezone: 'America/Toronto',
  location_type: 'virtual', location_detail: '',
  session_mode: 'quick_skill_drill', interview_category: 'case', skill_focus: 'final_recommendation',
  round1_interviewee_user_id: 'demo-user',
  meeting_method: 'zoom',
  meeting_url: 'https://utoronto.zoom.us/j/98765432101?pwd=demoDEMOdemo',
  meeting_location: null,
}
const DEMO_BEHAVIOURAL = {
  id: 'demo-s6', pairing_id: 'demo-pair-1', community_id: 'demo', status: 'scheduled',
  participant_a_user_id: 'demo-user', participant_b_user_id: 'demo-peer',
  created_by_user_id: 'demo-peer',
  scheduled_start: new Date(Date.now() + 2 * 864e5).toISOString(),
  duration_minutes: 75, timezone: 'America/Toronto',
  location_type: 'virtual', location_detail: '',
  session_mode: 'full_mock_swap', interview_category: 'behavioural', skill_focus: null,
  round1_interviewee_user_id: 'demo-user',
}
const DEMO_WAITING = {
  id: 'demo-s7', pairing_id: 'demo-pair-2', community_id: 'demo',
  status: 'completed_pending_confirmation',
  participant_a_user_id: 'demo-user', participant_b_user_id: 'demo-peer2',
  created_by_user_id: 'demo-user',
  scheduled_start: new Date(Date.now() - 3 * 36e5).toISOString(),
  duration_minutes: 30, timezone: 'America/Toronto', location_type: 'virtual', location_detail: '',
  session_mode: 'quick_skill_drill', interview_category: 'case', skill_focus: 'synthesis',
}
const DEMO_CONFIRMATIONS = DEMO_SESSIONS.flatMap((s) => [
  { session_id: s.id, user_id: 'demo-user', outcome: 'completed', completed_own_round: true, completed_partner_round: true },
  { session_id: s.id, user_id: s.participant_b_user_id, outcome: 'completed', completed_own_round: true, completed_partner_round: true },
])

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '22px 16px 10px' }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-0.01em', fontFamily: FONT }}>
        {children}
      </h2>
      {right}
    </div>
  )
}

export default function PracticeHub({ userId, onOpenChat, onOpenEvent, onOpenEventsList, focusMatchId = null, focusPairingId = null, onFocusHandled }) {
  const demoMode = !isSupabaseConfigured
  const [loading, setLoading] = useState(true)
  const [community, setCommunity] = useState(null)
  const [isMember, setIsMember] = useState(false)
  const [myRequest, setMyRequest] = useState(null)
  const [myWindows, setMyWindows] = useState([])
  const [browseRows, setBrowseRows] = useState([])
  const [events, setEvents] = useState([])
  const [joinedEventIds, setJoinedEventIds] = useState(new Set())
  const [pairings, setPairings] = useState([])
  const [sessions, setSessions] = useState([])
  const [tokens, setTokens] = useState([])
  const [tokensFailed, setTokensFailed] = useState(false)
  const [namesById, setNamesById] = useState({})
  const [view, setView] = useState('explore')            // 'explore' | 'mine'
  // How the user wants to connect: with one partner, or with a group.
  // A frontend classification only (Practice and Events stay separate
  // models); remembered for the current session.
  // null until the member picks a pathway: For You shows the two
  // choices and nothing else, and each choice opens its own section.
  const [category, setCategoryState] = useState(() => {
    try { return sessionStorage.getItem('mutu_exchange_category') || null } catch { return null }
  })
  const setCategory = (c) => {
    setCategoryState(c)
    try { sessionStorage.setItem('mutu_exchange_category', c) } catch { /* no-op */ }
  }
  // The Mock Interview pathway is a PAGE, opened from its card and
  // left with its own Back. Deliberately not persisted: returning to
  // the tab should land on the hub, not deep inside one pathway.
  const [pathwayOpen, setPathwayOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(null)       // null | step number (advanced editor)
  const [detailId, setDetailId] = useState(null)
  const [detailWindows, setDetailWindows] = useState([])
  const [detailConfirmations, setDetailConfirmations] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState(null)
  // Inline confirmation shown IN PLACE (no banner hunt, no scrolling).
  const [inlineNote, setInlineNote] = useState(null)
  const inlineTimer = useRef(null)
  const [impactOpen, setImpactOpen] = useState(false)
  const [myConfirmations, setMyConfirmations] = useState([])
  const [passportOpen, setPassportOpen] = useState(false)
  const [modesSupported, setModesSupported] = useState(false)
  const [feedbackSupported, setFeedbackSupported] = useState(false)
  const [myFeedback, setMyFeedback] = useState([])
  const [tokenModal, setTokenModal] = useState(null)

  const fail = (error) => { if (error) setBanner(practiceErrorMessage(error)); return Boolean(error) }
  const flashInline = (text) => {
    setInlineNote(text)
    clearTimeout(inlineTimer.current)
    inlineTimer.current = setTimeout(() => setInlineNote(null), 4000)
  }

  // ── Load everything ────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (demoMode) {
      setCommunity({ id: 'demo', slug: 'rotman', name: 'Rotman' }); setIsMember(true)
      setBrowseRows(DEMO_ROWS); setEvents(DEMO_EVENTS); setTokens(DEMO_TOKENS)
      setSessions([...DEMO_SESSIONS, DEMO_SCHEDULED, DEMO_DRILL, DEMO_DONE])
      setMyConfirmations([...DEMO_CONFIRMATIONS,
        { session_id: 'demo-s7', user_id: 'demo-user', outcome: 'completed', completed_own_round: true, completed_partner_round: true }])
      setFeedbackSupported(true)
      setMyFeedback([
        { id: 'demo-f1', session_id: 'demo-s2', author_user_id: 'demo-peer2', recipient_user_id: 'demo-user',
          suggestion_code: 'recommendation_more_direct', note: 'The analysis was strong, but the answer came last.',
          created_at: new Date(Date.now() - 2 * 864e5).toISOString(), reported_at: null },
        { id: 'demo-f2', session_id: 'demo-s1', author_user_id: 'demo-peer', recipient_user_id: 'demo-user',
          suggestion_code: 'tailor_structure', note: '',
          created_at: new Date(Date.now() - 6 * 864e5).toISOString(), reported_at: null },
      ])
      setPairings(DEMO_PAIRINGS); setModesSupported(true)
      setNamesById({ 'demo-peer': 'Maya Khan', 'demo-peer2': 'Daniel Lee', 'demo-peer3': 'Priya Sharma', 'demo-peer4': 'Noah Adeyemi' })
      setLoading(false)
      return
    }
    if (!userId) { setLoading(false); return }
    const { data: comm } = await fetchCommunityBySlug('rotman')
    setCommunity(comm || null)
    if (!comm) { setLoading(false); return }
    const [{ data: member }, reqRes, prsRes, { data: sess }, tokRes, { data: evs }, { data: joined }, confRes, modeSupport, fbSupport] =
      await Promise.all([
        fetchMyCommunityMembership(comm.id, userId),
        fetchMyPracticeRequest(userId, comm.id),
        fetchMyPairings(),
        fetchMySessions(),
        fetchMyExchangeTokens(),
        fetchUpcomingEvents(),
        fetchMyJoinedEventIds(userId),
        fetchMyPracticeConfirmations(),
        fetchSessionModeSupport(),
        fetchFeedbackSupport(),
      ])
    const req = reqRes.data
    const prs = prsRes.data
    const loadErr = reqRes.error || prsRes.error
    if (loadErr) {
      console.warn('[Exchange] load failed:', loadErr.message || loadErr)
      setBanner("We couldn't load part of this page. Try again in a moment.")
    }
    setIsMember(Boolean(member))
    setMyRequest(req || null)
    setPairings(prs || [])
    setSessions(sess || [])
    // a settled session's local guide position is meaningless: clear it
    for (const row of sess || []) {
      if (shouldClearGuideState(row)) clearGuideState({ userId, sessionId: row.id })
    }
    setMyConfirmations(confRes.data || [])
    setModesSupported(Boolean(modeSupport?.supported))
    setFeedbackSupported(Boolean(fbSupport?.supported))
    if (fbSupport?.supported) {
      const { data: fb } = await fetchMyPracticeFeedback()
      setMyFeedback(fb || [])
    } else setMyFeedback([])
    setTokens(tokRes.data || [])
    setTokensFailed(Boolean(tokRes.error))
    setEvents(evs || [])
    setJoinedEventIds(joined instanceof Set ? joined : new Set(joined || []))
    if (req) {
      const { data: wins } = await fetchMyAvailabilityWindows(req.id)
      setMyWindows(wins || [])
    } else setMyWindows([])
    if (member) {
      const { data: rows } = await browsePracticeRequests(comm.id)
      setBrowseRows(rows || [])
    }
    const ids = [
      ...(prs || []).map((p) => p.counterpart_user_id).filter(Boolean),
      ...(tokRes.data || []).flatMap((t) => [t.user_lo, t.user_hi]).filter((id) => id !== userId),
    ]
    if (ids.length) {
      const { data: profs } = await fetchProfilesByIds(ids)
      setNamesById(Object.fromEntries(Object.entries(profs).map(([id, p]) => [id, p.name || 'Member'])))
    }
    setLoading(false)
  }, [userId, demoMode])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Derived ────────────────────────────────────────────────────
  const sessionByPairing = useMemo(() => {
    const by = {}
    for (const s of [...sessions].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
      by[s.pairing_id] = s
    }
    return by
  }, [sessions])

  const accepted = useMemo(() => pairings.filter((p) => p.status === 'accepted'), [pairings])
  const invited = useMemo(() => pairings.filter((p) => p.status === 'invited'), [pairings])
  const closedPairings = useMemo(
    () => pairings.filter((p) => ['declined', 'withdrawn', 'expired', 'ended'].includes(p.status)),
    [pairings]
  )
  const incoming = invited.filter((p) => !p.i_invited)
  const outgoing = invited.filter((p) => p.i_invited)

  const acceptedWithState = useMemo(() => accepted.map((p) => ({
    p,
    s: sessionByPairing[p.id] || null,
    st: deriveDisplayState({ pairing: p, session: sessionByPairing[p.id] || null, myUserId: userId }),
  })), [accepted, sessionByPairing, userId])

  const todo = acceptedWithState.filter((x) => NEEDS_ACTION.has(x.st))
  const upcoming = acceptedWithState.filter((x) => x.st === 'scheduled')
  const waiting = acceptedWithState.filter((x) => AWAITING.has(x.st))
  // Catch-all, deliberately written as "everything the three buckets
  // above did not take" rather than a list of states: an accepted
  // partnership must never be able to fall out of this screen. Before
  // this existed, a pairing whose session reached 'verified' matched
  // none of the three filters and the partner became unreachable —
  // the only way back to them was to leave the partnership and match
  // again, which is why the same pair kept reappearing in browse.
  const partnered = acceptedWithState.filter(
    (x) => !NEEDS_ACTION.has(x.st) && x.st !== 'scheduled' && !AWAITING.has(x.st)
  )
  const actionableCount = incoming.length + todo.length

  const myJoinedUpcomingEvents = useMemo(
    () => events.filter((e) => joinedEventIds.has(e.id) || (userId && e.host_user_id === userId)),
    [events, joinedEventIds, userId]
  )

  const fitRows = useMemo(
    () => (myRequest ? browseRows.filter((r) => mutualFit(myRequest, r)) : []),
    [browseRows, myRequest]
  )

  // What is TRUE about this member's matching right now. Derived from
  // rows already loaded; it never asserts activity that is not real.
  const poolState = useMemo(
    () => matchingState({
      myRequest,
      fitCount: fitRows.length,
      outgoingCount: outgoing.length,
      incomingCount: incoming.length,
      scheduledCount: upcoming.length,
    }),
    [myRequest, fitRows.length, outgoing.length, incoming.length, upcoming.length]
  )

  // The two connection cards have to DO something visible. Switching
  // a state flag alone left the member at the top of the page with no
  // feedback, which reads as a dead button.
  const matchingRef = useRef(null)
  const groupsRef = useRef(null)
  const partnersRef = useRef(null)
  // Which section the member just asked to see. Scrolling happens in
  // an effect, so it always runs AFTER the section has been committed
  // to the DOM — doing it inline left the page motionless, which read
  // as a dead button.
  const [revealTarget, setRevealTarget] = useState(null)

  useEffect(() => {
    if (!revealTarget) return undefined
    const ref = revealTarget === 'groups' ? groupsRef
      : revealTarget === 'partners' ? (partnersRef.current ? partnersRef : matchingRef)
      : matchingRef
    ref.current?.scrollIntoView({ block: 'start' })
    setRevealTarget(null)
    return undefined
  }, [revealTarget, category])

  // Each card leads into its OWN destination.
  const chooseConnection = (id) => {
    if (id === 'groups') {
      // Groups & Events lives on the Events tab; that is the real
      // destination, and the existing "Browse all" link already uses
      // it. Falls back to the in-page list if the route is absent.
      if (onOpenEventsList) { onOpenEventsList(); return }
      setCategory('groups'); setRevealTarget('groups'); return
    }
    setCategory('one_on_one')
    // no preferences yet → the setup flow IS the way to find a partner
    if (!myRequest) { setSetupOpen(1); return }
    setPathwayOpen(true)
  }


  const myWindowsStale = Boolean(
    myRequest && myWindows.length > 0 &&
    myWindows.every((w) => new Date(w.starts_at) <= new Date())
  )

  const reputation = useMemo(
    () => computeReputation({ tokens, sessions, myUserId: userId, communityId: community?.id }),
    [tokens, sessions, userId, community?.id]
  )

  // The Practice Passport reads the SAME verified sessions and the
  // user's own confirmation rows. One canonical calculation, so the
  // compact card, the detail sheet and the milestones cannot drift.
  const passport = useMemo(
    () => computePassport({
      userId: demoMode ? 'demo-user' : userId,
      communityId: community?.id || null,
      sessions, confirmations: myConfirmations, tokens,
      feedback: myFeedback, feedbackSupported,
      namesById,                       // already-unlocked identities only
      goal: myRequest?.want_focus || '',
    }),
    [demoMode, userId, community?.id, sessions, myConfirmations, tokens, namesById, myRequest, myFeedback, feedbackSupported]
  )

  const detailPairing = pairings.find((p) => p.id === detailId) || null
  const detailSession = detailPairing ? sessionByPairing[detailPairing.id] || null : null

  useEffect(() => {
    if ((!focusMatchId && !focusPairingId) || pairings.length === 0) return
    const p = pairings.find((x) => x.match_id === focusMatchId || x.id === focusPairingId)
    setView('mine')
    if (p && p.status === 'accepted') setDetailId(p.id)
    onFocusHandled?.()
  }, [focusMatchId, focusPairingId, pairings, onFocusHandled])

  useEffect(() => {
    if (!detailId || demoMode) return
    let alive = true
    ;(async () => {
      const { data: wins } = await fetchPairingWindows(detailId)
      if (alive) setDetailWindows(wins || [])
      const s = sessionByPairing[detailId]
      if (s && demoMode) {
        // demo has no database: read the same rows the demo Passport uses
        if (alive) setDetailConfirmations(myConfirmations.filter((c) => c.session_id === s.id))
      } else if (s) {
        const { data: confs } = await fetchSessionConfirmations(s.id)
        if (alive) setDetailConfirmations(confs || [])
      } else if (alive) setDetailConfirmations([])
    })()
    return () => { alive = false }
  }, [detailId, sessionByPairing, demoMode])

  // ── Actions ────────────────────────────────────────────────────
  // Quick publish from the one-card setup: sensible defaults, saved in
  // the background, results replace the card in place.
  const quickPublish = async ({ wantTypes, helpTypes, windows }) => {
    setSaving(true); setBanner(null)
    if (demoMode) {
      setMyRequest({
        id: 'demo-req', want_types: wantTypes, want_focus: '', help_types: helpTypes,
        help_focus: '', help_context: '', location_type: 'virtual',
        duration_minutes: DEFAULT_DURATION_MINUTES, timezone: DEFAULT_TIMEZONE, status: 'active',
      })
      setMyWindows(windows.map((w, i) => ({ id: `demo-w-mine-${i}`, ...w })))
      setSaving(false)
      flashInline("You're now available for matching. (Demo mode: nothing was saved.)")
      return
    }
    const { data: req, error } = await createPracticeRequest({
      userId, communityId: community.id,
      wantTypes, wantFocus: '', helpTypes, helpFocus: '', helpContext: '',
      locationType: 'virtual', durationMinutes: DEFAULT_DURATION_MINUTES, timezone: DEFAULT_TIMEZONE,
    })
    if (fail(error)) { setSaving(false); return }
    if (windows.length > 0) {
      const { error: winErr } = await replaceAvailabilityWindows(req.id, windows)
      if (winErr) console.warn('[Exchange] windows save failed:', winErr.message || winErr)
    }
    track('practice_request_created', { community_id: community.id })
    await loadAll()
    setSaving(false)
    flashInline("You're now available for matching.")
  }

  // Advanced editor (Edit preferences) still saves the full shape.
  const saveRequest = async (form) => {
    setSaving(true); setBanner(null)
    if (demoMode) {
      setMyRequest({
        id: 'demo-req', want_types: form.wantTypes, want_focus: form.wantFocus,
        help_types: form.helpTypes, help_focus: form.helpFocus, help_context: form.helpContext,
        location_type: form.locationType, duration_minutes: form.durationMinutes,
        timezone: form.timezone, status: 'active',
      })
      setMyWindows(form.windows.map((w, i) => ({ id: `demo-w-mine-${i}`, ...w })))
      setSaving(false); setSetupOpen(null); setView('explore'); setPathwayOpen(true)
      flashInline('Preferences saved. (Demo mode: nothing was saved.)')
      return
    }
    let req = myRequest
    if (req) {
      const { data, error } = await updatePracticeRequest(req.id, {
        want_types: form.wantTypes, want_focus: form.wantFocus,
        help_types: form.helpTypes, help_focus: form.helpFocus,
        help_context: form.helpContext, location_type: form.locationType,
        duration_minutes: form.durationMinutes, timezone: form.timezone,
      })
      if (fail(error)) { setSaving(false); return }
      req = data
    } else {
      const { data, error } = await createPracticeRequest({
        userId, communityId: community.id,
        wantTypes: form.wantTypes, wantFocus: form.wantFocus,
        helpTypes: form.helpTypes, helpFocus: form.helpFocus,
        helpContext: form.helpContext, locationType: form.locationType,
        durationMinutes: form.durationMinutes, timezone: form.timezone,
      })
      if (fail(error)) { setSaving(false); return }
      req = data
      track('practice_request_created', { community_id: community.id })
    }
    const { error: winErr } = await replaceAvailabilityWindows(req.id, form.windows)
    if (fail(winErr)) { setSaving(false); return }
    setSaving(false); setSetupOpen(null)
    await loadAll()
    flashInline('Preferences saved.')
  }

  const withdrawRequest = async () => {
    if (!myRequest || demoMode) return
    const { error } = await setPracticeRequestStatus(myRequest.id, 'withdrawn')
    if (!fail(error)) { flashInline("You've left the matching pool."); await loadAll() }
  }

  const invite = async (row, windowId = null) => {
    if (demoMode) { flashInline('Demo mode: sign in to send real invitations.'); return }
    setBusyId(row.request_id); setBanner(null)
    const { error } = await sendPracticeInvitation(row.request_id, windowId)
    setBusyId(null)
    if (fail(error)) return
    track('practice_invitation_sent', { community_id: community?.id, slot_bound: Boolean(windowId) })
    await loadAll()
    flashInline("Invitation sent. You'll hear back with a notification.")
  }

  // Acceptance routes straight into the natural social context: Chat.
  const accept = async (p) => {
    setBusyId(p.id); setBanner(null)
    const { data, error } = await acceptPracticeInvitation(p.id)
    setBusyId(null)
    if (fail(error)) return
    track('practice_invitation_accepted', { community_id: community?.id })
    await loadAll()
    if (data?.match_id) onOpenChat(data.match_id)
  }

  const decline = async (p) => {
    setBusyId(p.id)
    const { error } = await declinePracticeInvitation(p.id)
    setBusyId(null)
    if (fail(error)) return
    track('practice_invitation_declined', { community_id: community?.id })
    await loadAll()
  }

  const withdraw = async (p) => {
    setBusyId(p.id)
    const { error } = await withdrawPracticeInvitation(p.id)
    setBusyId(null)
    if (!fail(error)) await loadAll()
  }

  const withDetailBusy = (fn, after) => async (...args) => {
    setBusyId(detailId); setBanner(null)
    const { error, data } = (await fn(...args)) || {}
    setBusyId(null)
    if (fail(error)) return
    if (after) after(data)
    await loadAll()
    const s = sessionByPairing[detailId]
    if (s) {
      const { data: confs } = await fetchSessionConfirmations(s.id)
      setDetailConfirmations(confs || [])
    }
  }

  const propose = withDetailBusy(
    (form) => proposePracticeSession({ pairingId: detailId, ...form }),
    () => track('practice_session_proposed', { community_id: community?.id })
  )
  const confirmTime = withDetailBusy(
    () => confirmPracticeSession(detailSession?.id),
    () => track('practice_session_scheduled', { community_id: community?.id })
  )
  const declineTime = withDetailBusy(() => declinePracticeSession(detailSession?.id))
  const withdrawTime = withDetailBusy(() => withdrawPracticeSession(detailSession?.id))
  const cancelSession = withDetailBusy(
    () => cancelPracticeSession(detailSession?.id),
    () => track('practice_session_cancelled', { community_id: community?.id })
  )
  const endPairing = withDetailBusy(
    () => endPracticePairing(detailId),
    () => {
      track('practice_partnership_ended', { community_id: community?.id })
      setDetailId(null)
      flashInline("You've left that partnership. Your Tokens and chat are safe.")
    }
  )
  const submitConfirmation = withDetailBusy(
    (form) => submitPracticeConfirmation({ sessionId: detailSession?.id, ...form }),
    (data) => {
      track('practice_confirmation_submitted', { community_id: community?.id })
      if (data?.status === 'verified') {
        track('practice_session_verified', { community_id: community?.id })
        track('practice_exchange_token_minted', { community_id: community?.id })
        setTokenModal({
          partnerName: namesById[detailPairing?.counterpart_user_id] || 'your partner',
          matchId: detailPairing?.match_id || null,
        })
      }
      if (data?.status === 'disputed') track('practice_session_disputed', { community_id: community?.id })
    }
  )

  // ── Row renderers ──────────────────────────────────────────────
  const SessionRow = ({ p, s, st, titleFn, subtitleFn, cta }) => {
    const name = namesById[p.counterpart_user_id] || 'your partner'
    const title = titleFn ? titleFn(name) : name
    return (
      <button key={p.id} type="button" onClick={() => setDetailId(p.id)}
        className="active:scale-[0.995]"
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
          background: C.white, border: `1px solid ${C.line}`, borderRadius: 14,
          padding: '12px 14px', marginBottom: 10, cursor: 'pointer',
        }}>
        <PeerAvatar name={name} seed={p.counterpart_user_id || p.id} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>{title}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
            {subtitleFn ? subtitleFn(s)
              : s && (st === 'scheduled' || st === 'proposal_sent' || st === 'proposal_received')
                ? formatSessionTime(s.scheduled_start, s.duration_minutes, s.timezone)
                : 'Mock interview'}
          </p>
        </div>
        {cta
          ? (
            <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 650, color: MATCHA_DEEP, fontFamily: FONT }}>
              {cta} ›
            </span>
          )
          : <span style={{ flexShrink: 0, color: C.ink3, fontSize: 16 }}>›</span>}
      </button>
    )
  }

  const EventRow = ({ e }) => (
    <button key={e.id} type="button" onClick={() => onOpenEvent?.(e.id)}
      className="active:scale-[0.995]"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        background: C.white, border: `1px solid ${C.line}`, borderRadius: 14,
        padding: '12px 14px', marginBottom: 10, cursor: 'pointer',
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>{e.title}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
          Event · {new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(e.start_at))}
          {userId && e.host_user_id === userId ? ' · Hosting' : ''}
        </p>
      </div>
      <span style={{ flexShrink: 0, color: C.ink3, fontSize: 16 }}>›</span>
    </button>
  )

  // ── Gates ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppScreen>
        <div style={{ padding: '16px', maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {[92, 40, 220, 120].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: 16, background: '#EFECE5', marginBottom: 12, animation: 'pulse 1.4s ease-in-out infinite' }} />
          ))}
          <style>{'@keyframes pulse{0%,100%{opacity:.55}50%{opacity:1}}'}</style>
        </div>
      </AppScreen>
    )
  }
  if (!userId && !demoMode) {
    return <AppScreen><p style={{ padding: 40, textAlign: 'center', color: C.ink3, fontSize: 13, fontFamily: FONT }}>Sign in to use Together.</p></AppScreen>
  }
  if (!community || !isMember) {
    return (
      <AppScreen>
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0, fontFamily: FONT }}>
            {community ? 'Together is for the Rotman community' : "Together isn't available yet"}
          </p>
          <p style={{ fontSize: 13, color: C.ink3, margin: '8px auto 0', lineHeight: 1.55, maxWidth: 320, fontFamily: FONT }}>
            {community
              ? 'The pilot is open to approved Rotman members. If you think you should have access, contact the Mutu team.'
              : 'Check back soon.'}
          </p>
        </div>
      </AppScreen>
    )
  }

  // ── Overlays ───────────────────────────────────────────────────
  const overlays = (
    <>
      <TokenUnlockModal
        open={Boolean(tokenModal)}
        partnerName={tokenModal?.partnerName}
        verifiedCount={reputation.verifiedCount}
        onPractiseAgain={() => setTokenModal(null)}
        onSendThanks={tokenModal?.matchId && onOpenChat ? () => {
          const id = tokenModal.matchId
          setTokenModal(null)
          onOpenChat(id)
        } : undefined}
        onClose={() => setTokenModal(null)}
      />
      <AnimatePresence>
        {passportOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPassportOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 80,
              background: 'rgba(24,22,15,0.4)', display: 'flex', alignItems: 'flex-end',
            }}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxHeight: '86dvh', overflowY: 'auto',
                background: '#F9F7F4', borderRadius: '22px 22px 0 0',
                padding: '14px 0 calc(20px + env(safe-area-inset-bottom))',
              }}>
              <div style={{ width: 40, height: 4, borderRadius: 99, background: C.line, margin: '0 auto 14px' }} />
              <PassportDetail
                passport={passport}
                sessionById={Object.fromEntries(sessions.map((x) => [x.id, x]))}
                onReportFeedback={async (f) => {
                  await reportPracticeFeedback(f.id)
                  const { data: fb } = await fetchMyPracticeFeedback()
                  setMyFeedback(fb || [])
                }}
                onClose={() => setPassportOpen(false)}
                onCta={(cta) => {
                  // route into the EXISTING flows, never a parallel one
                  setPassportOpen(false)
                  setView('explore')
                  setCategory('one_on_one')
                  track('passport_cta', { action: cta.action })
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ImpactSheet
        open={impactOpen}
        reputation={reputation}
        communityName={community?.name || 'Rotman'}
        onClose={() => setImpactOpen(false)}
      />
    </>
  )

  // The setup flow takes over the screen, so it is checked before
  // any page that could otherwise keep rendering in its place.
  // (It used to sit after the Mock Interview page, which made
  // Update preferences look dead: the state changed, the page
  // did not.)
  if (setupOpen) {
    return (
      <PracticeSetupFlow
        existing={myRequest}
        existingWindows={myWindows}
        initialStep={typeof setupOpen === 'number' ? setupOpen : 1}
        saving={saving}
        onSave={saveRequest}
        onCancel={() => setSetupOpen(null)}
      />
    )
  }

  // ── Mock Interview: a page of its own ───────────────────────────
  if (pathwayOpen && view === 'explore') {
    return (
      <>
        <AppScreen>
          <TogetherStyles />
          <div className={TOGETHER_CLASS}
            style={{ maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 28 }}>

            <div style={{ padding: '10px 16px 2px' }}>
              <button type="button" onClick={() => setPathwayOpen(false)}
                style={{
                  minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6,
                  border: 'none', background: 'none', padding: '0 10px 0 0', cursor: 'pointer',
                  fontSize: 13.5, fontWeight: 650, color: MATCHA_DEEP, fontFamily: FONT,
                }}>
                <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>&lsaquo;</span>
                Together
              </button>
              <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 750, color: C.ink, letterSpacing: '-0.02em', fontFamily: FONT }}>
                Mock Interview
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: C.ink2, lineHeight: 1.45, fontFamily: FONT }}>
                Practise consulting case and behavioural interviews.
              </p>
            </div>

            <div ref={matchingRef} aria-hidden="true" style={{ height: 1, scrollMarginTop: 14 }} />

            {/* Your activity is about mock interviews specifically,
                so it belongs inside this pathway rather than on the
                hub's neutral landing. Numbers and milestone progress
                come from computePassport; the action still opens the
                full Passport. */}
            <div style={{ paddingTop: 14 }}>
              <ActivitySummary passport={passport}
                onOpen={() => { setPassportOpen(true); track('passport_opened') }} />
            </div>
            {inlineNote && (
              <p role="status" style={{
                margin: '12px 16px 0', fontSize: 12.5, fontWeight: 650,
                color: MATCHA_DEEP, fontFamily: FONT,
              }}>
                ✓ {inlineNote}
              </p>
            )}

            {!myRequest ? (
              <div style={{ padding: '14px 16px 0' }}>
                <QuickSetupCard saving={saving} onPublish={quickPublish} />
              </div>
            ) : (
              <>
                <MatchingStatus
                  state={poolState}
                  myRequest={myRequest}
                  myWindows={myWindows}
                  onPrimary={() => setSetupOpen(1)} />

                {myWindowsStale && (
                  <div style={{
                    margin: '12px 16px 0', background: '#FBF4E4', border: `1px solid ${C.goldLight}`,
                    borderRadius: 14, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <p style={{ margin: 0, flex: 1, fontSize: 12.5, color: C.ink2, lineHeight: 1.45, fontFamily: FONT }}>
                      Your listed times have passed. Partners can still match with you,
                      but fresh times let them book you instantly.
                    </p>
                    <button type="button" onClick={() => setSetupOpen(3)}
                      style={{
                        flexShrink: 0, minHeight: 44, border: 'none', borderRadius: 10, padding: '9px 14px',
                        fontSize: 12, fontWeight: 700, fontFamily: FONT,
                        background: MATCHA_DEEP, color: '#fff', cursor: 'pointer',
                      }}>
                      Add times
                    </button>
                  </div>
                )}
              </>
            )}

            {/* The partner list stays behind the Mock Interview
                pathway, exactly as before. */}
            {category === 'one_on_one' && myRequest && fitRows.length > 0 && (
              <>
                <div ref={partnersRef} aria-hidden="true" style={{ height: 1, scrollMarginTop: 14 }} />
                <SectionTitle>Partners for you</SectionTitle>
                <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {fitRows.map((row) => (
                    <PartnerCard key={row.request_id} row={row} myRequest={myRequest}
                      busy={busyId === row.request_id} onInvite={invite} />
                  ))}
                </div>
              </>
            )}
          </div>
        </AppScreen>
        {overlays}
      </>
    )
  }

  if (detailPairing && ['accepted'].includes(detailPairing.status)) {
    return (
      <>
        <PairingDetail
          pairing={detailPairing}
          session={detailSession}
          confirmations={demoMode
            ? myConfirmations.filter((c) => c.session_id === detailSession?.id)
            : detailConfirmations}
          pairingWindows={detailWindows}
          myUserId={demoMode ? 'demo-user' : userId}
          counterpartName={namesById[detailPairing.counterpart_user_id]}
          busy={busyId === detailId}
          onBack={() => setDetailId(null)}
          onOpenChat={onOpenChat}
          onPropose={propose}
          sessionModesSupported={modesSupported}
          feedbackSupported={feedbackSupported}
          onViewProgress={() => { setDetailId(null); setView('explore'); setPassportOpen(true) }}
          onConfirmTime={confirmTime}
          onDeclineTime={declineTime}
          onWithdrawTime={withdrawTime}
          onCancelSession={cancelSession}
          onSubmitConfirmation={submitConfirmation}
          onEndPairing={endPairing}
        />
        {overlays}
      </>
    )
  }

  const hasAnythingMine = myRequest || pairings.length > 0 || tokens.length > 0 || myJoinedUpcomingEvents.length > 0

  return (
    <AppScreen>
      <TogetherStyles />
      <div className={TOGETHER_CLASS}
        style={{ maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 28 }}>

        {/* Header: title + subtitle + real Token pill. The subtitle
            names the WHOLE hub, not one feature inside it. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 16px 12px' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 27, fontWeight: 750, color: C.ink, letterSpacing: '-0.02em', fontFamily: FONT }}>
              {PAGE.title}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.ink2, lineHeight: 1.45, fontFamily: FONT }}>
              {PAGE.subtitle}
            </p>
          </div>
          {/* Token pill appears only after the first verified session:
              a brand-new user should never see a prominent "0". */}
          {!tokensFailed && reputation.verifiedCount > 0 && (
            <button type="button" onClick={() => setImpactOpen(true)}
              aria-label="My Impact"
              className="active:scale-95 transition-all"
              style={{
                flexShrink: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 7,
                border: `1px solid ${C.goldLight}`, background: C.goldBg,
                borderRadius: 99, padding: '6px 15px', cursor: 'pointer',
              }}>
              <svg width="20" height="15" viewBox="0 0 44 32" fill="none">
                <circle cx="15" cy="16" r="11" stroke="#A6822A" strokeWidth="3.4" />
                <circle cx="29" cy="16" r="11" stroke="#C9A33B" strokeWidth="3.4" />
              </svg>
              <span style={{ fontSize: 14.5, fontWeight: 750, color: C.goldDark, fontFamily: FONT }}>
                {reputation.verifiedCount}
              </span>
            </button>
          )}
        </div>

        {/* For You | My Sessions */}
        <div style={{ padding: '0 16px' }}>
          <div role="tablist" style={{
            display: 'flex', background: C.white, border: `1px solid ${C.line}`,
            borderRadius: 99, padding: 4, gap: 4,
          }}>
            {[
              { id: 'explore', label: 'For You' },
              { id: 'mine', label: `My Sessions${actionableCount ? ` · ${actionableCount}` : ''}` },
            ].map((t) => {
              const on = view === t.id
              return (
                <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => setView(t.id)}
                  style={{
                    flex: 1, minHeight: 44, border: 'none', borderRadius: 99, padding: '10px 0',
                    fontSize: 13.5, fontWeight: 650, fontFamily: FONT, cursor: 'pointer',
                    background: on ? MATCHA_SOFT : 'transparent',
                    color: on ? MATCHA_DEEP : C.ink2,
                  }}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {banner && (
          <div role="status" onClick={() => setBanner(null)}
            style={{
              margin: '10px 16px 0', padding: '9px 13px',
              background: C.goldBg, border: `1px solid ${C.goldLight}`, borderRadius: 12,
              fontSize: 12, lineHeight: 1.45, color: '#8A6E1E', fontFamily: FONT, cursor: 'pointer',
            }}>
            {banner}
          </div>
        )}

        {/* ═══ EXPLORE ═══ */}
        {view === 'explore' && (
          <>
            {/* Two equal-weight pathways. Mock Interview is one
                consulting-focused feature inside Together; Groups &
                Events is the wider community pathway and is never
                presented as secondary or as consulting-specific. */}
            <ConnectionCards selectedId={null} onSelect={chooseConnection} />

            {/* ── Groups & Events ── */}
            <div ref={groupsRef} aria-hidden="true" style={{ height: 1, scrollMarginTop: 14 }} />
            {category === 'groups' && (
              <>
                <SectionTitle
                  right={onOpenEventsList ? (
                    <button type="button" onClick={onOpenEventsList}
                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 650, color: MATCHA_DEEP, fontFamily: FONT }}>
                      Browse all →
                    </button>
                  ) : null}>
                  Upcoming groups & events
                </SectionTitle>
                {events.length === 0 ? (
                  <p style={{ margin: '0 16px', fontSize: 12.5, color: C.ink3, fontFamily: FONT }}>
                    No upcoming events right now.
                  </p>
                ) : (
                  <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {events.map((e) => (
                      <ExchangeEventCard key={e.id} event={e} onOpen={(id) => onOpenEvent?.(id)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}


        {/* ═══ MY ACTIVITY ═══ */}
        {view === 'mine' && (
          !hasAnythingMine ? (
            <div style={{ padding: '44px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, margin: 0, fontFamily: FONT }}>New to Together</p>
              <p style={{ fontSize: 12.5, color: C.ink3, margin: '6px auto 16px', lineHeight: 1.55, maxWidth: 300, fontFamily: FONT }}>
                Start something in For You, and everything you join will show up right here.
              </p>
              <button type="button" onClick={() => setView('explore')}
                style={{
                  border: 'none', borderRadius: 13, padding: '12px 22px',
                  fontSize: 13.5, fontWeight: 700, fontFamily: FONT,
                  background: MATCHA_DEEP, color: '#fff', cursor: 'pointer',
                }}>
                Find a mock interview partner →
              </button>
            </div>
          ) : (
            <>
              {/* To do — everything needing MY action, most urgent first */}
              {(incoming.length > 0 || todo.length > 0) && (
                <>
                  <SectionTitle>To do</SectionTitle>
                  <InvitationsList pairings={pairings} busyId={busyId} only="incoming"
                    onAccept={accept} onDecline={decline} onWithdraw={withdraw} />
                  <div style={{ padding: '0 16px' }}>
                    {todo.map((x) => (
                      <SessionRow key={x.p.id} {...x} titleFn={TODO_TITLES[x.st]} />
                    ))}
                  </div>
                </>
              )}

              {/* Upcoming — sessions + my events */}
              {(upcoming.length > 0 || myJoinedUpcomingEvents.length > 0) && (
                <>
                  <SectionTitle>Upcoming</SectionTitle>
                  <div style={{ padding: '0 16px' }}>
                    {upcoming.map((x) => <SessionRow key={x.p.id} {...x} titleFn={(n) => `Mock interview with ${n}`} />)}
                    {myJoinedUpcomingEvents.map((e) => <EventRow key={e.id} e={e} />)}
                  </div>
                </>
              )}

              {/* Waiting on others — collapsed, never a primary section */}
              {(outgoing.length > 0 || waiting.length > 0) && (
                <details style={{ margin: '18px 16px 0' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 650, color: C.ink2, fontFamily: FONT, padding: '4px 0' }}>
                    Waiting on others · {outgoing.length + waiting.length}
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <InvitationsList pairings={pairings} busyId={busyId} only="outgoing"
                      onAccept={accept} onDecline={decline} onWithdraw={withdraw} />
                    {waiting.map((x) => (
                      <SessionRow key={x.p.id} {...x} titleFn={WAITING_TITLES[x.st]} />
                    ))}
                  </div>
                </details>
              )}

              {/* Mock interview partners — accepted partnerships with nothing
                  currently in flight. A partnership is a lasting
                  relationship, not one session, so it stays reachable
                  and offers the next round without anyone having to
                  match again. */}
              {partnered.length > 0 && (
                <>
                  <SectionTitle>Mock interview partners</SectionTitle>
                  <p style={{ margin: '0 16px 10px', fontSize: 12, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
                    You can start another round together whenever you both have time.
                  </p>
                  <div style={{ padding: '0 16px' }}>
                    {partnered.map((x) => (
                      <SessionRow key={x.p.id} {...x}
                        subtitleFn={(s) => (
                          x.st === 'disputed' ? 'The completion details did not match'
                            : s?.verified_at
                              ? `Verified together · ${new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(new Date(s.verified_at))}`
                              : 'Mock interview partner'
                        )}
                        cta={x.st === 'disputed' ? 'Review' : 'Practise again'} />
                    ))}
                  </div>
                </>
              )}

              {/* History */}
              {(tokens.length > 0 || closedPairings.length > 0) && (
                <>
                  <SectionTitle>History</SectionTitle>
                  {tokens.length > 0 && (
                    <CompletedExchanges tokens={tokens} myUserId={userId} namesById={namesById} />
                  )}
                  {closedPairings.length > 0 && (
                    <details style={{ margin: '4px 16px 0' }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: C.ink3, fontFamily: FONT, padding: '4px 0' }}>
                        Closed items · {closedPairings.length}
                      </summary>
                      <div style={{ marginTop: 6 }}>
                        {closedPairings.map((p) => (
                          <p key={p.id} style={{ margin: '0 0 6px', fontSize: 12.5, color: C.ink3, fontFamily: FONT }}>
                            {p.status === 'ended' ? 'Left partnership' :
                              p.status === 'declined' ? 'Invitation declined' :
                              p.status === 'withdrawn' ? 'Invitation withdrawn' : 'Invitation expired'}
                            {' · '}
                            {new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' })
                              .format(new Date(p.ended_at || p.declined_at || p.invited_at))}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}

              {/* Small preferences control — never a big "My post" block */}
              {myRequest && (
                <div style={{
                  margin: '20px 16px 0', display: 'flex', alignItems: 'center', gap: 10,
                  borderTop: `1px solid ${C.line}`, paddingTop: 14,
                }}>
                  <p style={{ margin: 0, flex: 1, fontSize: 12.5, color: C.ink2, fontFamily: FONT }}>
                    Mock interview preferences · {myRequest.want_types.join(', ')} + {myRequest.help_types.join(', ')}
                  </p>
                  <button type="button" onClick={() => setSetupOpen(1)}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: MATCHA_DEEP, fontFamily: FONT }}>
                    Edit
                  </button>
                  <button type="button" onClick={withdrawRequest}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: C.ink3, fontFamily: FONT }}>
                    Leave pool
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>
      {overlays}
    </AppScreen>
  )
}
