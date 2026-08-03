import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronRight, Star, MapPin, CalendarDays, UserRound } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'
import { whyThisConnectionMayMatter } from '../lib/opportunityMatch'
import { getMatchScore } from '../data/matchRanking'
import { fetchUpcomingEvents } from '../lib/events'

// ── AI Match Home ────────────────────────────────────────────────────
// Default landing screen: "who should I meet / what to do next", from data
// the app already has (community posts + upcoming events + the viewer's
// profile) via the existing rule-based matcher. No new dataset, no migration.
//
// Visual system (shared "Event language"): warm white ground, charcoal text,
// restrained gold, compact 14px cards with thin neutral borders and no
// shadows, one clear action per card, a small gold "relevance" mark on each
// reason. No gold-circle icons, no sparkles, no gradients, no empty state.

const C = {
  ground:   '#FFFFFF',
  ivory:    '#FAF8F4',
  ink:      '#18160F',
  ink2:     '#6E6A61',
  ink3:     '#9A958B',
  line:     '#E9E5DD',
  line2:    '#F1EEE7',
  gold:     '#A67C33',
  goldInk:  '#7A5A22',
  goldBtn:  '#CBA85E',
  goldBtnInk: '#1B1710',
  initialBg: '#F0E9DB',
  initialInk:'#5E4B26',
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there'
}
function initials(name) {
  const p = String(name || '').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'M'
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
  if (post.needs && has(help, need))    return 'Their need matches a skill you offer.'
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
    return `Relevant to your interest in ${ev.category}.`
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

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    fetchUpcomingEvents().then(({ data }) => { if (alive) { setEvents(data || []); setLoading(false) } })
    return () => { alive = false }
  }, [])

  const missing = useMemo(() => {
    const m = []
    if (!(me.can_help_with?.length))      m.push('what you can help with')
    if (!(me.skills_to_learn?.length))    m.push('what you want to learn')
    if (!(me.industry_interests?.length)) m.push('your industries')
    return m
  }, [me.can_help_with, me.skills_to_learn, me.industry_interests])
  const profileIncomplete = missing.length > 0

  const rankedPosts = useMemo(() => {
    const mine = userId
    return (requests || [])
      .filter(p => p.created_by !== mine && (p.needs || p.offers))
      .map(p => {
        const reason = whyThisConnectionMayMatter({
          them: { name: p.creator?.name, id: p.created_by },
          themProfile: p.creator || {},
          themPosts: [{ need_text: p.needs, offer_text: p.offers }],
          meProfile: me,
        })
        return { post: p, reason, score: getMatchScore(p, viewerProfile) }
      })
      .sort((a, b) => b.score - a.score)
  }, [requests, userId, viewerProfile, me])

  const personRec = rankedPosts.find(r => r.post.creator?.name && !r.post.isAnonymous && r.reason)
  const postRec = rankedPosts.find(r => r.reason && r.post.id !== personRec?.post.id) || null
  const eventRec = events[0] || null
  const recCount = [personRec, postRec, eventRec].filter(Boolean).length

  const nextAction = profileIncomplete
    ? { label: 'Complete your profile to improve matches', onClick: onOpenProfile }
    : personRec
      ? { label: 'Meet your top match', onClick: onOpenDiscover }
      : eventRec
        ? { label: 'Explore an event relevant to you', onClick: () => onOpenEvent?.(eventRec.id) }
        : { label: 'Explore your community', onClick: onOpenDiscover }

  return (
    <div className="flex-1 phone-scroll" style={{ background: C.ground }}>
      <div style={{ padding: '12px 16px 26px', maxWidth: 560, margin: '0 auto' }}>

        {/* Greeting — compact */}
        <h1 style={{ fontSize: 17, fontWeight: 650, color: C.ink, margin: 0, letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {greeting()}, {firstName(me.name)}
        </h1>
        <p style={{ fontSize: 13, color: C.ink2, margin: '3px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Here are the best opportunities for you today.
        </p>

        {/* Single clear next action — the page's one gold primary */}
        <button
          type="button"
          onClick={nextAction.onClick}
          className="active:scale-[0.99]"
          style={{
            width: '100%', marginTop: 14, minHeight: 44, padding: '11px 15px', borderRadius: 11,
            background: C.goldBtn, color: C.goldBtnInk, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            fontSize: 13.5, fontWeight: 650, fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <span>{nextAction.label}</span>
          <ArrowRight size={16} strokeWidth={2.2} />
        </button>

        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '20px 0 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-0.005em', fontFamily: 'Inter, system-ui, sans-serif' }}>Recommended for you</h2>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.goldInk, background: '#F3EFE7', borderRadius: 5, padding: '2px 6px', fontFamily: 'Inter, system-ui, sans-serif' }}>Personalized</span>
          </div>
          <button type="button" onClick={onOpenDiscover} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 12, fontWeight: 600, color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>
            View all <ChevronRight size={13} strokeWidth={2.2} />
          </button>
        </div>

        {loading && recCount === 0 ? (
          <>
            <SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            {/* Person */}
            {personRec && (
              <RecCard
                eyebrow="Person"
                lead={<Avatar post={personRec.post} />}
                title={personRec.post.creator?.name || 'A member worth meeting'}
                meta={[personRec.post.creator?.headline, personRec.post.creator?.program].filter(Boolean).join(' · ')}
                reason={personRec.reason}
                actionLabel="View profile"
                onAction={onOpenDiscover}
              />
            )}

            {/* Ask / Offer */}
            {postRec && (
              <RecCard
                eyebrow={postRec.post.needs ? 'Ask' : 'Offer'}
                eyebrowNote="from your community"
                title={(postRec.post.needs || postRec.post.offers || '').slice(0, 90)}
                meta={[postRec.post.creator?.program, postRec.post.category].filter(Boolean).join(' · ')}
                reason={postRelevanceReason(postRec.post, me)}
                actionLabel={postRec.post.needs ? 'View request' : 'View offer'}
                onAction={onOpenDiscover}
              />
            )}

            {/* Event */}
            {eventRec && (
              <RecCard
                eyebrow="Event"
                lead={<EventCover ev={eventRec} />}
                title={eventRec.title}
                metaIcon={<CalendarDays size={12} strokeWidth={1.9} color={C.ink3} />}
                meta={[fmtEventDate(eventRec.start_at), eventRec.location].filter(Boolean).join(' · ')}
                reason={eventReason(eventRec, me)}
                actionLabel="View event"
                onAction={() => onOpenEvent?.(eventRec.id)}
              />
            )}

            {/* Compact limited-data card — never a full-screen empty state */}
            {recCount < 2 && (
              <div style={{ background: C.ivory, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginTop: 11 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>Improve your recommendations</p>
                <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: C.ink2, lineHeight: 1.45, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {profileIncomplete ? `Add ${missing.slice(0, 2).join(' and ')} so we can match you.` : 'Explore your community to surface more matches.'}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={onOpenProfile} style={{ ...btn, background: C.goldBtn, color: C.goldBtnInk, border: 'none' }}>Update profile</button>
                  <button type="button" onClick={onOpenDiscover} style={btn}>Browse Discover</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Recommendation card ──────────────────────────────────────────────
function RecCard({ eyebrow, eyebrowNote, lead, title, meta, metaIcon, reason, actionLabel, onAction }) {
  return (
    <div style={{ background: C.ground, border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px', marginTop: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: eyebrow === 'Ask' || eyebrow === 'Offer' ? C.goldInk : C.ink2, fontFamily: 'Inter, system-ui, sans-serif' }}>{eyebrow}</span>
        {eyebrowNote && <><span style={{ width: 3, height: 3, borderRadius: '50%', background: C.ink3 }} /><span style={{ fontSize: 12, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>{eyebrowNote}</span></>}
      </div>

      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        {lead}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: lead ? 15 : 14.5, fontWeight: lead ? 650 : 600, color: C.ink, margin: 0, lineHeight: 1.3, letterSpacing: '-0.005em', fontFamily: 'Inter, system-ui, sans-serif' }}>{title}</p>
          {meta && (
            <p style={{ fontSize: 12.5, color: C.ink3, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {metaIcon}{meta}
            </p>
          )}
        </div>
      </div>

      {/* Matching reason — factual, one small gold relevance mark */}
      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line2}` }}>
        <Star size={13} strokeWidth={1.8} color={C.gold} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: C.ink2, fontFamily: 'Inter, system-ui, sans-serif' }}>{reason}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 11 }}>
        <button type="button" onClick={onAction} className="active:scale-[0.98]" style={btn}>
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

function Avatar({ post }) {
  const seed = resolveAvatarSeed(post.creator?.avatar_url)
  if (seed) return <AnonymousAvatar seed={seed} size={44} />
  return (
    <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: C.initialInk, background: C.initialBg, border: `1px solid ${C.line}`, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {initials(post.creator?.name)}
    </div>
  )
}

function EventCover({ ev }) {
  const img = /^https?:/.test(ev.image_url || '') ? ev.image_url : null
  if (img) {
    return <img src={img} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.line}` }} />
  }
  return (
    <div style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg,#2E3A46 0%,#3C4A57 55%,#556472 100%)', border: `1px solid ${C.line}` }}>
      <span style={{ position: 'absolute', left: 6, bottom: 5, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {(ev.category || 'Event').slice(0, 10)}
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: C.ground, border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px', marginTop: 11 }} aria-hidden="true">
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.line2 }} className="home-skel" />
        <div style={{ flex: 1 }}>
          <div style={{ height: 12, width: '55%', borderRadius: 4, background: C.line2 }} className="home-skel" />
          <div style={{ height: 10, width: '38%', borderRadius: 4, background: C.line2, marginTop: 7 }} className="home-skel" />
        </div>
      </div>
      <div style={{ height: 10, width: '80%', borderRadius: 4, background: C.line2, marginTop: 14 }} className="home-skel" />
      <style>{`@keyframes homeSkel{0%,100%{opacity:.55}50%{opacity:.9}}.home-skel{animation:homeSkel 1.3s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.home-skel{animation:none}}`}</style>
    </div>
  )
}

function fmtEventDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const btn = {
  minHeight: 36, padding: '8px 14px', borderRadius: 9,
  background: C.ground, color: C.ink, border: `1px solid ${C.line}`,
  fontSize: 12.5, fontWeight: 650, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
}
