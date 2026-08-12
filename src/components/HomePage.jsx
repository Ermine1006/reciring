import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, Users, UserPlus, CalendarDays, ArrowRight, MessageSquareText, ChevronRight, Sparkles } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'
import PeerAvatar from './PeerAvatar'
import SmartMatchSection from './SmartMatchSection'
import { resolveAvatarSeed } from './SettingsPage'
import { getMatchScore, DEFAULT_VIEWER_PROFILE } from '../data/matchRanking'
import { fetchUpcomingEvents, fetchMyJoinedEventIds } from '../lib/events'
import { matchaCta, MATCHA_DEEP } from '../lib/matchaCta'
import { fetchFollowups, fetchEncounters, personKey } from '../lib/eventMemory'
import { fetchConnections } from '../lib/relationships'
import { fetchPastEventPostsToShare, dismissDiscoverSharePrompt } from '../lib/marketplace'

// ── Home ──────────────────────────────────────────────────────────────
// Default landing screen: "Suggested for you" + a real "Your network"
// summary + Ask Mutu. Everything maps to existing data — community posts,
// upcoming events, encounters, follow-ups — no new tables, nothing invented.
// Warm-white ground, charcoal text, restrained gold, compact cards.

const C = {
  ground:   '#FFFFFF',
  ink:      '#1A1712',
  ink2:     '#5F584D',
  ink3:     '#9A958B',
  line:     '#ECE7DE',
  line2:    '#F3EFE8',
  gold:     '#A6822A',
  goldInk:  '#7A5E17',
  goldBtn:  '#C9A33B',
  goldBtnInk:'#2E2405',
  goldSoft: '#F8F3E5',
  goldLine: '#E8D9A7',
  avatarBg: '#D9C084',
  avatarInk:'#463516',
  eventBg:  '#1C1811',
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || 'there' }
function initials(name) {
  const p = String(name || '').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'M'
}
function oneLine(s, max = 92) {
  const t = String(s || '').trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…'
}
// Just the headline: the part before a " — " separator (posts are stored as
// "title — details"), or the first sentence. Keep it short.
function titleOf(s, max = 64) {
  let t = String(s || '').trim().replace(/\s+/g, ' ')
  t = t.split(/\s[—–]\s|\s-\s/)[0]          // before " — " / " – " / " - "
  const m = t.match(/^[^.!?]*[.!?]?/)        // up to the first sentence end
  t = (m ? m[0] : t).trim()
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…'
}
function fmtEventDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
         d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function HomePage({
  profile, viewerProfile, userId, requests = [],
  onOpenDiscover, onOpenEvent, onOpenProfile, onOpenPost, onOpenNetworking, onOpenEvents, onAskMutu,
  onSharePastPost,
}) {
  const me = profile || {}

  const [data, setData] = useState({ events: [], followUpsDue: 0, recentlyMet: 0, connections: 0, upcoming: 0, loading: true })
  // Event Board posts on past events the user can carry into Discover.
  const [pastPosts, setPastPosts] = useState([])
  const [pastOpen, setPastOpen] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [ev, fu, enc, conn, joined, past] = await Promise.all([
        fetchUpcomingEvents(),
        userId ? fetchFollowups(userId)        : Promise.resolve({ data: [] }),
        userId ? fetchEncounters(userId)       : Promise.resolve({ data: [] }),
        userId ? fetchConnections(userId)      : Promise.resolve({ data: [] }),
        userId ? fetchMyJoinedEventIds(userId) : Promise.resolve({ data: new Set() }),
        userId ? fetchPastEventPostsToShare(userId) : Promise.resolve({ data: [] }),
      ])
      if (!alive) return
      const events = ev.data || []
      const joinedSet = joined.data instanceof Set ? joined.data : new Set(joined.data || [])
      setPastPosts(past.data || [])
      setData({
        events,
        followUpsDue: (fu.data || []).length,
        recentlyMet:  new Set((enc.data || []).map(personKey)).size,
        connections:  (conn.data || []).length,
        upcoming:     events.filter(e => joinedSet.has(e.id)).length,
        loading: false,
      })
    })()
    return () => { alive = false }
  }, [userId])

  const dismissPast = async (item) => {
    setPastPosts(prev => prev.filter(p => p.id !== item.id))
    try { await Promise.all((item.postIds || []).map(id => dismissDiscoverSharePrompt(id))) } catch { /* best effort */ }
  }

  // Top person suggestion — from ranked community posts (real authors only).
  // viewerProfile is null for a thin profile; fall back to the default so the
  // ranker never dereferences a missing strengths/industries array.
  const rankViewer = (viewerProfile && Array.isArray(viewerProfile.strengths) && Array.isArray(viewerProfile.industries))
    ? viewerProfile : DEFAULT_VIEWER_PROFILE
  const personRec = useMemo(() => {
    return (requests || [])
      .filter(p => p.created_by !== userId && (p.needs || p.offers) && p.creator?.name && !p.isAnonymous)
      .map(p => ({ post: p, score: getMatchScore(p, rankViewer) }))
      .sort((a, b) => b.score - a.score)[0]?.post || null
  }, [requests, userId, rankViewer])

  const eventRec = data.events[0] || null

  // Show a single-line nudge only when key matching fields are thin.
  const needInterests = (me.industry_interests?.length || 0) < 2

  // Up to three cells, relationship signals first. "Recently met" (real
  // encounters) and "Connections" (matched / chatted, not yet met) stay
  // distinct — the same split as My Network.
  const net = [
    data.followUpsDue > 0 && { icon: <Clock size={15} strokeWidth={1.9} color={C.gold} />, n: data.followUpsDue, label: 'Follow-ups due', onClick: onOpenNetworking },
    data.recentlyMet  > 0 && { icon: <Users size={15} strokeWidth={1.9} color={C.gold} />, n: data.recentlyMet,  label: 'Recently met',  onClick: onOpenNetworking },
    data.connections  > 0 && { icon: <UserPlus size={15} strokeWidth={1.9} color={C.gold} />, n: data.connections, label: 'Connections', onClick: onOpenNetworking },
    data.upcoming     > 0 && { icon: <CalendarDays size={15} strokeWidth={1.9} color={C.gold} />, n: data.upcoming, label: 'Upcoming', onClick: onOpenEvents },
  ].filter(Boolean).slice(0, 3)

  return (
    <div className="flex-1 phone-scroll" style={{ background: C.ground }}>
      <div style={{ padding: '10px 18px 26px', maxWidth: 560, margin: '0 auto' }}>

        {/* Greeting */}
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: '4px 0 0', letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {greeting()}, {firstName(me.name)}
        </h1>
        <p style={{ fontSize: 13.5, color: C.ink2, margin: '3px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Here's your community at a glance.
        </p>

        {/* ── My Networking hero (green) ── */}
        {net.length > 0 && (
          <div style={{ background: 'linear-gradient(140deg, #93A072 0%, #6C7A4E 100%)', borderRadius: 20, padding: '16px 17px 15px', color: '#fff', marginTop: 16, boxShadow: '0 12px 26px rgba(90,106,62,0.26)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <b style={{ fontSize: 13.5, fontWeight: 600 }}>My Networking</b>
              <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.20)', borderRadius: 99, padding: '4px 11px' }}>This week</span>
            </div>
            <div style={{ display: 'flex', marginTop: 14 }}>
              {net.map((cell) => (
                <button key={cell.label} type="button" onClick={cell.onClick}
                  style={{ flex: 1, background: 'none', border: 'none', textAlign: 'left', padding: 0, cursor: cell.onClick ? 'pointer' : 'default' }}>
                  <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1, color: '#fff', letterSpacing: '-0.02em', fontFamily: 'Inter, system-ui, sans-serif' }}>{cell.n}</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontFamily: 'Inter, system-ui, sans-serif' }}>{cell.label}</div>
                </button>
              ))}
            </div>
            <button type="button" onClick={onOpenNetworking}
              style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', marginTop: 12, paddingTop: 12, border: 'none', borderTop: '1px solid rgba(255,255,255,0.22)', background: 'none', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
              View dashboard <ArrowRight size={13} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {/* ── Ask Mutu — AI assistant (directly under the dashboard) ── */}
        <button type="button" onClick={() => onAskMutu?.()}
          style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
            background: 'linear-gradient(135deg, #FBF7EE 0%, #F6EFDD 100%)', border: '1px solid #ECDEBC', borderRadius: 16, padding: '13px 14px',
            boxShadow: '0 2px 10px rgba(150,120,30,0.06)' }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(145deg, #D6B04A, #A6822A)', boxShadow: '0 4px 10px rgba(180,140,30,0.30)' }}>
            <Sparkles size={20} color="#fff" strokeWidth={2} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <b style={{ fontSize: 15.5, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>Ask Mutu</b>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#8A6E1E', background: '#F3E7C4', borderRadius: 5, padding: '2px 6px', fontFamily: 'Inter, system-ui, sans-serif' }}>AI</span>
            </span>
            <span style={{ display: 'block', fontSize: 12, color: C.ink2, marginTop: 2, fontFamily: 'Inter, system-ui, sans-serif' }}>Your AI networking assistant — ask anything.</span>
          </span>
          <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(145deg, #97A275, #78855A)', boxShadow: '0 3px 9px rgba(92,106,62,0.28)' }}>
            <ArrowRight size={15} color="#fff" strokeWidth={2.3} />
          </span>
        </button>

        {/* ── Reminder: carry a past-event post into Discover ── */}
        {pastPosts.length > 0 && (
          <button type="button" onClick={() => setPastOpen(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', marginTop: 16, background: C.goldSoft, border: `1px solid ${C.goldLine}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>↗️</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {pastPosts.length === 1 ? 'Your event post ended' : `${pastPosts.length} event posts ended`}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: C.ink2, marginTop: 1, fontFamily: 'Inter, system-ui, sans-serif' }}>
                Share {pastPosts.length === 1 ? 'it' : 'them'} in Discover so people can still help.
              </span>
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.gold, flexShrink: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>Review</span>
          </button>
        )}

        {/* ── Suggested for you ── */}
        <div style={secHead}><h2 style={secTitle}>Suggested for you</h2></div>

        {needInterests && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.goldSoft, border: `1px solid ${C.goldLine}`, borderRadius: 11, padding: '9px 12px', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: C.ink2, fontFamily: 'Inter, system-ui, sans-serif', flex: 1 }}>
              <b style={{ color: C.ink, fontWeight: 600 }}>Add two interests</b> to improve your suggestions.
            </span>
            <button type="button" onClick={onOpenProfile} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.gold, fontWeight: 700, fontSize: 12.5, fontFamily: 'Inter, system-ui, sans-serif' }}>Update</button>
          </div>
        )}

        {(personRec || eventRec) && (
          <div style={{ background: '#FFFFFF', border: '1px solid #EFEBE2', borderRadius: 18, padding: '2px 14px', boxShadow: '0 1px 3px rgba(60,45,10,0.03)' }}>
            {personRec && (
              <SuggCard
                lead={<PersonAvatar post={personRec} />}
                label="Person"
                title={personRec.creator?.name}
                sub={[personRec.creator?.headline, personRec.creator?.program].filter(Boolean).join(' · ') || 'Community member'}
                reason={titleOf(personRec.needs || personRec.offers)}
                actionLabel="View"
                actionStyle="chevron"
                onAction={() => onOpenPost?.(personRec)}
              />
            )}

            {personRec && eventRec && <div style={{ height: 1, background: '#F1EEE7' }} />}

            {eventRec && (
              <SuggCard
                lead={<EventThumb ev={eventRec} />}
                label="Event"
                title={eventRec.title}
                titleSize={15}
                sub={[fmtEventDate(eventRec.start_at), eventRec.location].filter(Boolean).join(' · ')}
                subIsMeta
                reason={eventReason(eventRec, me)}
                actionLabel="View event"
                actionStyle="gold"
                onAction={() => onOpenEvent?.(eventRec.id)}
              />
            )}
          </div>
        )}

        {(personRec || eventRec) && (
          <button type="button" onClick={onOpenDiscover} style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', padding: '2px 0 2px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>
            See all suggestions
          </button>
        )}

        {!personRec && !eventRec && !data.loading && (
          <p style={{ fontSize: 13, color: C.ink3, margin: '2px 2px 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
            No suggestions yet — {needInterests ? 'add your interests' : 'check back soon'}.
          </p>
        )}

        {/* ── People you should meet (Smart Match) ── */}
        <SmartMatchSection />
      </div>

      <PastPostsSheet
        open={pastOpen}
        posts={pastPosts}
        onShare={(post) => { setPastOpen(false); onSharePastPost?.(post) }}
        onDismiss={dismissPast}
        onClose={() => setPastOpen(false)}
      />
    </div>
  )
}

// Bottom sheet listing past-event Event Board posts the user can carry into
// Discover. "Share in Discover" opens the prefilled composer; "Not now" stops
// the reminder for that post.
function PastPostsSheet({ open, posts, onShare, onDismiss, onClose }) {
  if (!open) return null
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: '#F9F7F4', borderRadius: '24px 24px 0 0', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>
        <div style={{ padding: '6px 22px 12px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>Keep these going</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: C.ink2, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            These posts were tied to events that have ended. Share one in Discover and the whole community can help — not just attendees.
          </p>
        </div>
        <div className="phone-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 16px calc(20px + env(safe-area-inset-bottom))' }}>
          {posts.map(item => (
            <div key={item.id} style={{ background: C.ground, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              {item.need  && <PastPostSide kind="need"  post={item.need} />}
              {item.offer && <PastPostSide kind="offer" post={item.offer} spaced={Boolean(item.need)} />}
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>from {item.eventTitle}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => onShare(item)}
                  style={{ flex: 1, padding: '10px', borderRadius: 11, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', ...matchaCta }}>
                  Share in Discover
                </button>
                <button type="button" onClick={() => onDismiss(item)}
                  style={{ padding: '10px 14px', borderRadius: 11, background: C.ground, border: `1px solid ${C.line}`, color: C.ink2, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Not now
                </button>
              </div>
            </div>
          ))}
          {posts.length === 0 && (
            <p style={{ textAlign: 'center', color: C.ink3, fontSize: 13, padding: '24px 0', fontFamily: 'Inter, system-ui, sans-serif' }}>All caught up.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// One need/offer block inside a combined past-post card.
function PastPostSide({ kind, post, spaced }) {
  const isOffer = kind === 'offer'
  return (
    <div style={{ marginTop: spaced ? 10 : 0 }}>
      <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 99, marginBottom: 6, color: isOffer ? '#047857' : '#4F46E5', background: isOffer ? '#ECFDF5' : '#EEF2FF', border: `1px solid ${isOffer ? '#A7F3D0' : '#C7D2FE'}` }}>
        {isOffer ? 'Offering' : 'Looking for'}
      </span>
      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 650, color: C.ink, lineHeight: 1.3, fontFamily: 'Inter, system-ui, sans-serif' }}>{post.title}</p>
    </div>
  )
}

function eventReason(ev, me) {
  const interests = (me?.industry_interests || []).map(s => String(s).toLowerCase())
  if (ev.category && interests.includes(String(ev.category).toLowerCase())) return `Relevant to your interest in ${ev.category}.`
  const n = ev.attendee_count || 0
  if (n >= 3) return `${n} people are going — near you.`
  return 'An upcoming event near you.'
}

// ── Suggestion card ──
function SuggCard({ lead, label, title, titleSize = 16, sub, subIsMeta, reason, actionLabel, actionStyle, onAction }) {
  const btn = actionStyle === 'gold'
    ? { border: 'none', ...matchaCta }
    : { background: C.ground, border: '1px solid #D7DEC6', color: MATCHA_DEEP }
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 4px' }}>
      {lead}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</span>
        <p style={{ fontSize: titleSize, fontWeight: 650, color: C.ink, margin: '2px 0 0', lineHeight: 1.2, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{title}</p>
        <p style={{ fontSize: subIsMeta ? 12 : 12.5, color: C.ink3, margin: '1px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>{sub}</p>
        {reason && <p style={{ fontSize: 12.5, color: C.ink2, margin: '4px 0 0', lineHeight: 1.35, fontFamily: 'Inter, system-ui, sans-serif' }}>{reason}</p>}
      </div>
      {actionStyle === 'chevron' ? (
        <button type="button" onClick={onAction} aria-label={actionLabel} className="active:scale-95"
          style={{ flexShrink: 0, alignSelf: 'center', background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink3, display: 'flex' }}>
          <ChevronRight size={22} strokeWidth={2} />
        </button>
      ) : (
        <button type="button" onClick={onAction} className="active:scale-[0.98]"
          style={{ flexShrink: 0, alignSelf: 'center', padding: '8px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', ...btn }}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function PersonAvatar({ post }) {
  // Community post author — mirrors the visible name: real name → initials
  // monogram, anonymous → bean.
  return <PeerAvatar name={post.creator?.name} seed={post.creator?.id || post.id} size={56} />
}

function EventThumb({ ev }) {
  const img = /^https?:/.test(ev.image_url || '') ? ev.image_url : null
  if (img) return <img src={img} alt="" style={{ width: 60, height: 60, borderRadius: 11, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.line}` }} />
  return (
    <div style={{ width: 60, height: 60, borderRadius: 11, flexShrink: 0, background: C.eventBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CalendarDays size={22} strokeWidth={1.7} color={C.goldBtn} />
    </div>
  )
}

const secHead  = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '20px 0 10px' }
const secTitle = { fontSize: 16, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }
