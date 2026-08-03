import { useEffect, useMemo, useState } from 'react'
import { Clock, Users, UserPlus, CalendarDays, ArrowRight, MessageSquareText } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'
import { getMatchScore, DEFAULT_VIEWER_PROFILE } from '../data/matchRanking'
import { fetchUpcomingEvents, fetchMyJoinedEventIds } from '../lib/events'
import { fetchFollowups, fetchEncounters, personKey } from '../lib/eventMemory'
import { fetchConnections } from '../lib/relationships'

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
  gold:     '#A67C33',
  goldInk:  '#7A5A22',
  goldBtn:  '#C6A25A',
  goldBtnInk:'#241B0C',
  goldSoft: '#FBF6EC',
  goldLine: '#EBDBAE',
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
}) {
  const me = profile || {}

  const [data, setData] = useState({ events: [], followUpsDue: 0, recentlyMet: 0, connections: 0, upcoming: 0, loading: true })
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [ev, fu, enc, conn, joined] = await Promise.all([
        fetchUpcomingEvents(),
        userId ? fetchFollowups(userId)        : Promise.resolve({ data: [] }),
        userId ? fetchEncounters(userId)       : Promise.resolve({ data: [] }),
        userId ? fetchConnections(userId)      : Promise.resolve({ data: [] }),
        userId ? fetchMyJoinedEventIds(userId) : Promise.resolve({ data: new Set() }),
      ])
      if (!alive) return
      const events = ev.data || []
      const joinedSet = joined.data instanceof Set ? joined.data : new Set(joined.data || [])
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
          Here's what's worth your attention today.
        </p>

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

        {personRec && (
          <SuggCard
            lead={<PersonAvatar post={personRec} />}
            label="Person"
            title={personRec.creator?.name}
            sub={[personRec.creator?.headline, personRec.creator?.program].filter(Boolean).join(' · ') || 'Community member'}
            reason={titleOf(personRec.needs || personRec.offers)}
            actionLabel="View"
            actionStyle="out"
            onAction={() => onOpenPost?.(personRec)}
          />
        )}

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

        {/* ── Your network ── */}
        {net.length > 0 && (
          <>
            <div style={secHead}><h2 style={secTitle}>Your network</h2></div>
            <div style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {net.map((cell, i) => (
                <button key={cell.label} type="button" onClick={cell.onClick}
                  style={{ flex: 1, textAlign: 'left', background: C.ground, border: 'none', borderLeft: i === 0 ? 'none' : `1px solid ${C.line2}`, padding: '13px 10px', cursor: cell.onClick ? 'pointer' : 'default', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {cell.icon}
                    <span style={{ fontSize: 20, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{cell.n}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.ink2, marginTop: 5 }}>{cell.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Ask Mutu ── */}
        <div style={secHead}><h2 style={secTitle}>Ask Mutu</h2></div>
        <button type="button" onClick={() => onAskMutu?.()}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C.line}`, borderRadius: 14, padding: '10px 10px 10px 13px', background: C.ground, cursor: 'pointer', textAlign: 'left' }}>
          <MessageSquareText size={17} strokeWidth={1.7} color={C.ink3} />
          <span style={{ flex: 1, fontSize: 13.5, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>Ask about your network…</span>
          <span style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${C.goldLine}`, color: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ArrowRight size={15} strokeWidth={2.1} />
          </span>
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {['Who should I follow up with?', 'Who did I meet recently?'].map(q => (
            <button key={q} type="button" onClick={() => onAskMutu?.(q)}
              style={{ border: `1px solid ${C.line}`, borderRadius: 99, padding: '8px 13px', fontSize: 12, color: C.ink2, fontWeight: 500, background: C.ground, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Inter, system-ui, sans-serif' }}>
              {q}
            </button>
          ))}
        </div>
      </div>
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
    ? { background: C.goldBtn, border: `1px solid ${C.goldBtn}`, color: C.goldBtnInk }
    : { background: C.ground, border: `1px solid ${C.goldLine}`, color: C.gold }
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: C.ground, border: `1px solid ${C.line}`, borderRadius: 14, padding: 12, marginBottom: 10 }}>
      {lead}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</span>
        <p style={{ fontSize: titleSize, fontWeight: 650, color: C.ink, margin: '2px 0 0', lineHeight: 1.2, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{title}</p>
        <p style={{ fontSize: subIsMeta ? 12 : 12.5, color: C.ink3, margin: '1px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>{sub}</p>
        {reason && <p style={{ fontSize: 12.5, color: C.ink2, margin: '4px 0 0', lineHeight: 1.35, fontFamily: 'Inter, system-ui, sans-serif' }}>{reason}</p>}
      </div>
      <button type="button" onClick={onAction} className="active:scale-[0.98]"
        style={{ flexShrink: 0, alignSelf: 'center', padding: '8px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', ...btn }}>
        {actionLabel}
      </button>
    </div>
  )
}

function PersonAvatar({ post }) {
  const seed = resolveAvatarSeed(post.creator?.avatar_url)
  if (seed) return <AnonymousAvatar seed={seed} size={56} />
  return (
    <div style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: C.avatarInk, background: C.avatarBg, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {initials(post.creator?.name)}
    </div>
  )
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
