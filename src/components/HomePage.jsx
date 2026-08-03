import { useEffect, useMemo, useState } from 'react'
import { Users, MessageSquareText, CalendarDays, ArrowRight, UserRound, MapPin } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'
import { whyThisConnectionMayMatter } from '../lib/opportunityMatch'
import { getMatchScore } from '../data/matchRanking'
import { fetchUpcomingEvents } from '../lib/events'

// ── AI Match Home ────────────────────────────────────────────────────
// The default landing screen. It answers "who should I meet / what should
// I do next" using data the app already has (community posts + upcoming
// events + the viewer's profile) and the existing rule-based matcher.
// No new dataset, no migration. Professional Event-style visuals — no
// cartoon art, no sparkles, no AI gradients, no full-screen empty state.

const C = {
  ivory:    '#F9F7F4',
  white:    '#FFFFFF',
  ink:      '#1A1712',
  sub:      '#5B5347',
  muted:    '#9A9186',
  gold:     '#C8A96A',
  goldDark: '#A88245',
  goldSoft: '#FBF6EC',
  goldLine: '#E7DCC6',
  line:     '#ECE7DE',
  green:    '#177245',
  greenBg:  '#EFF6F0',
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there'
}

// A grounded relevance reason for a community post, phrased about the viewer
// (avoids restating the post and the "They is looking for" grammar on
// anonymous authors).
function postRelevanceReason(post, me) {
  const has = (arr, s) => (arr || []).some(k => s.includes(String(k).toLowerCase()))
  const need  = String(post.needs || '').toLowerCase()
  const offer = String(post.offers || '').toLowerCase()
  const help  = (me.can_help_with || []).map(s => String(s).toLowerCase())
  const learn = (me.skills_to_learn || []).map(s => String(s).toLowerCase())
  if (post.needs && has(help, need))   return 'They need something you can help with.'
  if (post.offers && has(learn, offer)) return 'They offer something you want to learn.'
  const shared = (me.industry_interests || []).find(i =>
    (post.creator?.industry_interests || []).some(x => String(x).toLowerCase() === String(i).toLowerCase()))
  if (shared) return `Relevant to your interest in ${shared}.`
  return post.needs ? 'Someone in your community looking for help.' : 'An offer from your community.'
}

// A grounded one-line reason for an upcoming event — never fabricated.
function eventReason(ev, me) {
  const interests = (me?.industry_interests || []).map(s => String(s).toLowerCase())
  if (ev.category && interests.includes(String(ev.category).toLowerCase())) {
    return `A ${ev.category} event that lines up with your interest in ${ev.category}.`
  }
  const n = ev.attendee_count || 0
  if (n >= 3) return `${n} people are going — a chance to meet others relevant to your goals.`
  return 'An upcoming event where you can meet people relevant to your goals.'
}

export default function HomePage({
  profile, viewerProfile, userId, requests = [],
  onOpenDiscover, onOpenEvent, onOpenProfile,
}) {
  const me = profile || {}

  // Upcoming events — reuse the existing feed query, pick the soonest relevant.
  const [events, setEvents] = useState([])
  useEffect(() => {
    let alive = true
    fetchUpcomingEvents().then(({ data }) => { if (alive) setEvents(data || []) })
    return () => { alive = false }
  }, [])

  // Profile completeness for the matcher (drives fallbacks + the primary CTA).
  const missing = useMemo(() => {
    const m = []
    if (!(me.can_help_with?.length))      m.push('what you can help with')
    if (!(me.skills_to_learn?.length))    m.push('what you want to learn')
    if (!(me.industry_interests?.length)) m.push('your industries')
    return m
  }, [me.can_help_with, me.skills_to_learn, me.industry_interests])
  const profileIncomplete = missing.length > 0

  // Rank community posts for this viewer, attach a human "why".
  const rankedPosts = useMemo(() => {
    const mine = userId
    return (requests || [])
      .filter(p => p.created_by !== mine && (p.needs || p.offers))
      .map(p => {
        const them = { name: p.creator?.name, id: p.created_by }
        const reason = whyThisConnectionMayMatter({
          them,
          themProfile: p.creator || {},
          themPosts: [{ need_text: p.needs, offer_text: p.offers }],
          meProfile: me,
        })
        return { post: p, reason, score: getMatchScore(p, viewerProfile) }
      })
      .sort((a, b) => b.score - a.score)
  }, [requests, userId, viewerProfile, me])

  // Person to meet: the top-ranked post whose author is identifiable.
  const personRec = rankedPosts.find(r => r.post.creator?.name && !r.post.isAnonymous && r.reason)
  // A community Ask/Offer distinct from the person card.
  const postRec = rankedPosts.find(r => r.reason && r.post.id !== personRec?.post.id) || null
  // Top upcoming event.
  const eventRec = events[0] || null

  const recCount = [personRec, postRec, eventRec].filter(Boolean).length

  // The single clearest next action.
  const nextAction = profileIncomplete
    ? { label: 'Complete your profile to improve your matches', onClick: onOpenProfile }
    : personRec
      ? { label: 'Meet your top match', onClick: onOpenDiscover }
      : eventRec
        ? { label: 'Explore an event relevant to you', onClick: () => onOpenEvent?.(eventRec.id) }
        : { label: 'Explore your community', onClick: onOpenDiscover }

  return (
    <div className="flex-1 phone-scroll" style={{ background: C.ivory }}>
      <div style={{ padding: '14px 18px 28px', maxWidth: 560, margin: '0 auto' }}>

        {/* Greeting */}
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {greeting()}, {firstName(me.name)}
        </h1>
        <p style={{ fontSize: 13.5, color: C.sub, margin: '4px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Here are the best opportunities for you today.
        </p>

        {/* Primary next action */}
        <button
          type="button"
          onClick={nextAction.onClick}
          className="active:scale-[0.99]"
          style={{
            width: '100%', marginTop: 16, padding: '13px 16px', borderRadius: 12,
            background: C.goldDark, color: '#fff', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            fontSize: 14, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
            boxShadow: '0 2px 10px rgba(168,130,69,0.22)',
          }}
        >
          <span>{nextAction.label}</span>
          <ArrowRight size={17} strokeWidth={2.2} />
        </button>

        {/* Section label */}
        <p style={sectionLabel}>AI matches for you</p>

        {/* Person to meet */}
        {personRec && (
          <RecCard
            icon={<Users size={16} strokeWidth={1.9} color={C.goldDark} />}
            eyebrow="Person to meet"
            avatar={personRec.post}
            title={personRec.post.creator?.name || 'A member worth meeting'}
            subtitle={[personRec.post.creator?.program, personRec.post.creator?.headline].filter(Boolean).join(' · ')}
            reason={personRec.reason}
            actionLabel={personRec.post.needs ? 'Offer help' : 'Connect'}
            onAction={onOpenDiscover}
          />
        )}

        {/* Community Ask / Offer */}
        {postRec && (
          <RecCard
            icon={<MessageSquareText size={16} strokeWidth={1.9} color={C.goldDark} />}
            eyebrow={postRec.post.needs ? 'Someone needs help' : 'An offer for you'}
            title={(postRec.post.needs || postRec.post.offers || '').slice(0, 90)}
            reason={postRelevanceReason(postRec.post, me)}
            actionLabel="View post"
            onAction={onOpenDiscover}
          />
        )}

        {/* Upcoming event */}
        {eventRec && (
          <RecCard
            icon={<CalendarDays size={16} strokeWidth={1.9} color={C.goldDark} />}
            eyebrow="Event for you"
            title={eventRec.title}
            meta={[fmtEventDate(eventRec.start_at), eventRec.location].filter(Boolean).join(' · ')}
            reason={eventReason(eventRec, me)}
            actionLabel="View event"
            onAction={() => onOpenEvent?.(eventRec.id)}
          />
        )}

        {/* Compact fallbacks — never a big empty state. Shown when we couldn't
            surface enough real recommendations. */}
        {recCount < 2 && (
          <>
            <p style={sectionLabel}>Get better matches</p>
            {profileIncomplete && (
              <MiniRow
                icon={<UserRound size={15} strokeWidth={1.9} color={C.goldDark} />}
                title="Complete your profile"
                sub={`Add ${missing.slice(0, 2).join(' and ')} so we can match you.`}
                onClick={onOpenProfile}
              />
            )}
            <MiniRow
              icon={<MessageSquareText size={15} strokeWidth={1.9} color={C.goldDark} />}
              title="Explore community posts"
              sub="See what people are asking for and offering."
              onClick={onOpenDiscover}
            />
            {eventRec && (
              <MiniRow
                icon={<CalendarDays size={15} strokeWidth={1.9} color={C.goldDark} />}
                title="View an upcoming event"
                sub={eventRec.title}
                onClick={() => onOpenEvent?.(eventRec.id)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Recommendation card ──────────────────────────────────────────────
function RecCard({ icon, eyebrow, avatar, title, subtitle, meta, reason, actionLabel, onAction }) {
  const seed = avatar ? resolveAvatarSeed(avatar.creator?.avatar_url) : null
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 14,
      padding: 14, marginTop: 10, boxShadow: '0 1px 4px rgba(26,23,18,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        {icon}
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {eyebrow}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {avatar && (
          seed
            ? <AnonymousAvatar seed={seed} size={40} />
            : <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.goldSoft, border: `1px solid ${C.goldLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserRound size={18} strokeWidth={1.8} color={C.goldDark} />
              </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.3, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {title}
          </p>
          {subtitle && <p style={{ fontSize: 12.5, color: C.muted, margin: '2px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>{subtitle}</p>}
          {meta && (
            <p style={{ fontSize: 12.5, color: C.sub, margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Inter, system-ui, sans-serif' }}>
              <MapPin size={12} color={C.muted} /> {meta}
            </p>
          )}
        </div>
      </div>

      {/* Why it's relevant */}
      <div style={{ marginTop: 10, padding: '8px 11px', background: C.goldSoft, borderRadius: 9, border: `1px solid ${C.goldLine}` }}>
        <p style={{ fontSize: 12.5, color: C.sub, margin: 0, lineHeight: 1.45, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {reason}
        </p>
      </div>

      <button
        type="button"
        onClick={onAction}
        className="active:scale-[0.98]"
        style={{
          marginTop: 12, width: '100%', padding: '10px 14px', borderRadius: 10,
          background: C.white, color: C.goldDark, border: `1.5px solid ${C.goldLine}`,
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {actionLabel} <ArrowRight size={15} strokeWidth={2.2} />
      </button>
    </div>
  )
}

// ── Compact fallback row ─────────────────────────────────────────────
function MiniRow({ icon, title, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="active:scale-[0.99]"
      style={{
        width: '100%', textAlign: 'left', marginTop: 10, padding: '12px 14px',
        background: C.white, border: `1px solid ${C.line}`, borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
      }}
    >
      <span style={{ width: 30, height: 30, borderRadius: 8, background: C.goldSoft, border: `1px solid ${C.goldLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter, system-ui, sans-serif' }}>{sub}</span>
      </span>
      <ArrowRight size={16} strokeWidth={2} color={C.muted} />
    </button>
  )
}

function fmtEventDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const sectionLabel = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: C.muted, margin: '22px 0 2px', fontFamily: 'Inter, system-ui, sans-serif',
}
