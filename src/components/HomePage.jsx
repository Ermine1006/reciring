import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Users, CalendarDays, ChevronRight } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'
import { whyThisConnectionMayMatter } from '../lib/opportunityMatch'
import { getMatchScore } from '../data/matchRanking'
import { fetchUpcomingEvents } from '../lib/events'

// ── AI Match Home ────────────────────────────────────────────────────
// Default landing screen. Surfaces "who to meet / what to do next" from data
// the app already has (community posts + upcoming events + the viewer's
// profile) via the existing rule-based matcher. No new dataset, no migration.
//
// Blocks: AI picks (a person, an event, a ready-to-send conversation starter)
// and a lightweight network insight. Warm-white ground, charcoal text,
// restrained gold, compact cards. Conversation openers are template-built
// from the match's real shared interest — never fabricated or API-fetched.

const C = {
  ground:   '#FFFFFF',
  card:     '#FAFAF7',
  cardLine: '#EFEBE2',
  ink:      '#18160F',
  ink2:     '#6E6A61',
  ink3:     '#9A958B',
  gold:     '#B4842E',
  goldInk:  '#7A5A22',
  goldSoft: '#FBF6E8',
  goldLine: '#EBDBAE',
  goldRing: '#C9A85A',
  track:    '#ECE6D8',
  eventBg:  '#1C1811',
  avatarBg: '#D9C084',
  avatarInk:'#463516',
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
const lc = s => String(s || '').toLowerCase()
const eq = (a, b) => lc(a) === lc(b)

function personReason(post, me) {
  const shared = (me.industry_interests || []).filter(i =>
    (post.creator?.industry_interests || []).some(x => eq(x, i)))
  if (shared.length >= 2) return `You both like ${shared[0]} and ${shared[1]}.`
  if (shared.length === 1) return `You both like ${shared[0]}.`
  return whyThisConnectionMayMatter({
    them: { name: post.creator?.name }, themProfile: post.creator || {},
    themPosts: [{ need_text: post.needs, offer_text: post.offers }], meProfile: me,
  }) || 'A member worth meeting in your community.'
}

function eventReason(ev, me) {
  const interests = (me?.industry_interests || []).map(lc)
  if (ev.category && interests.includes(lc(ev.category))) return `Based on your interest in ${ev.category}.`
  const n = ev.attendee_count || 0
  if (n >= 3) return `${n} people are going — relevant to your goals.`
  return 'An upcoming event relevant to your goals.'
}

export default function HomePage({
  profile, viewerProfile, userId, requests = [],
  onOpenDiscover, onOpenEvent, onOpenProfile, onOpenPost,
}) {
  const me = profile || {}

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    fetchUpcomingEvents().then(({ data }) => { if (alive) { setEvents(data || []); setLoading(false) } })
    return () => { alive = false }
  }, [])

  const strengths = (me.can_help_with?.length ? me.can_help_with : me.industry_interests) || []
  const completeness = useMemo(() => {
    const f = [me.name, me.headline || me.program, me.industry_interests?.length,
              me.can_help_with?.length, me.skills_to_learn?.length, resolveAvatarSeed(me.avatar_url)]
    return Math.round((f.filter(Boolean).length / f.length) * 100)
  }, [me])

  const rankedPosts = useMemo(() => {
    return (requests || [])
      .filter(p => p.created_by !== userId && (p.needs || p.offers))
      .map(p => ({ post: p, score: getMatchScore(p, viewerProfile) }))
      .sort((a, b) => b.score - a.score)
  }, [requests, userId, viewerProfile])

  const personRec = rankedPosts.find(r => r.post.creator?.name && !r.post.isAnonymous)?.post || null
  const eventRec = events[0] || null

  return (
    <div className="flex-1 phone-scroll" style={{ background: C.ground }}>
      <div style={{ padding: '12px 16px 26px', maxWidth: 560, margin: '0 auto' }}>

        {/* Greeting */}
        <h1 style={{ fontSize: 17, fontWeight: 650, color: C.ink, margin: 0, letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {greeting()}, {firstName(me.name)}
        </h1>
        <p style={{ fontSize: 13, color: C.ink2, margin: '3px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Here are the best opportunities for you today.
        </p>

        {/* ── AI picks ─────────────────────────────────────────── */}
        <SectionHead icon={<Sparkles size={15} strokeWidth={1.9} color={C.gold} />} title="AI picks for you" onViewAll={onOpenDiscover} />

        {loading && !personRec && !eventRec ? (
          <><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            {personRec && (
              <Card onClick={onOpenPost ? () => onOpenPost(personRec) : undefined}>
                <EyebrowRow label="People" right={<Users size={15} strokeWidth={1.8} color={C.ink3} />} />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <PersonAvatar post={personRec} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={nameStyle}>{personRec.creator?.name}</p>
                    <p style={metaStyle}>{[personRec.creator?.headline, personRec.creator?.program].filter(Boolean).join(' · ') || 'Community member'}</p>
                    <p style={reasonStyle}>{personReason(personRec, me)}</p>
                  </div>
                </div>
              </Card>
            )}

            {eventRec && (
              <Card onClick={() => onOpenEvent?.(eventRec.id)}>
                <EyebrowRow label="Event" />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <EventCover ev={eventRec} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={nameStyle}>{eventRec.title}</p>
                    <p style={metaStyle}>{[fmtEventDate(eventRec.start_at), eventRec.location].filter(Boolean).join(' · ')}</p>
                    <p style={reasonStyle}>{eventReason(eventRec, me)}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Nudge to complete the profile (replaces the conversation
                starter) — shown whenever there's room to improve matches. */}
            {completeness < 100 && (
              <div style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 650, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>Improve your recommendations</p>
                <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: C.ink2, lineHeight: 1.45, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Add two more interests or update what you can offer.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={onOpenProfile} style={{ ...btn, background: C.goldRing, color: C.avatarInk, border: 'none' }}>Update profile</button>
                  <button type="button" onClick={onOpenDiscover} style={btn}>Browse Discover</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Network insight ──────────────────────────────────── */}
        <SectionHead title="Your network insight" onViewAll={onOpenProfile} />
        {strengths.length > 0 ? (
          <Card>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.35, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  You are strong in <span style={{ color: C.goldInk }}>{strengths.slice(0, 2).join(' and ')}</span>.
                </p>
                <p style={{ margin: '5px 0 0', fontSize: 12.5, color: C.ink2, lineHeight: 1.45, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  You may benefit from meeting more operators and builders outside {strengths[0]}.
                </p>
              </div>
              <Ring pct={completeness} />
            </div>
          </Card>
        ) : (
          <Card onClick={onOpenProfile}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.35, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  See where your network is strong
                </p>
                <p style={{ margin: '5px 0 0', fontSize: 12.5, color: C.ink2, lineHeight: 1.45, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Add your industries and what you can offer to unlock your network insight.
                </p>
                <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 650, color: C.gold, display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Update profile <ChevronRight size={13} strokeWidth={2.2} />
                </p>
              </div>
              <Ring pct={completeness} />
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Building blocks ──────────────────────────────────────────────────
function SectionHead({ icon, title, onViewAll }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon}
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }}>{title}</h2>
      </div>
      {onViewAll && (
        <button type="button" onClick={onViewAll} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>
          View all
        </button>
      )}
    </div>
  )
}

function Card({ children, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      className={onClick ? 'active:scale-[0.995]' : undefined}
      style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 16, padding: '13px 14px', marginBottom: 10, cursor: onClick ? 'pointer' : 'default' }}
    >
      {children}
    </div>
  )
}

function EyebrowRow({ label, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</span>
      {right}
    </div>
  )
}

function PersonAvatar({ post }) {
  const seed = resolveAvatarSeed(post.creator?.avatar_url)
  if (seed) return <AnonymousAvatar seed={seed} size={44} />
  return (
    <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: C.avatarInk, background: C.avatarBg, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {initials(post.creator?.name)}
    </div>
  )
}

function EventCover({ ev }) {
  const img = /^https?:/.test(ev.image_url || '') ? ev.image_url : null
  if (img) return <img src={img} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: C.eventBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CalendarDays size={20} strokeWidth={1.7} color={C.goldRing} />
    </div>
  )
}

function Ring({ pct }) {
  const r = 15, circ = 2 * Math.PI * r
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return (
    <svg width="42" height="42" viewBox="0 0 40 40" style={{ flexShrink: 0 }} aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke={C.track} strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={C.goldRing} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 20 20)" />
      <text x="20" y="20" dominantBaseline="central" textAnchor="middle" fontSize="10" fontWeight="700" fill={C.goldInk} fontFamily="Inter, system-ui, sans-serif">{pct}%</text>
    </svg>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 16, padding: '13px 14px', marginBottom: 10 }} aria-hidden="true">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.track }} className="home-skel" />
        <div style={{ flex: 1 }}>
          <div style={{ height: 12, width: '55%', borderRadius: 4, background: C.track }} className="home-skel" />
          <div style={{ height: 10, width: '38%', borderRadius: 4, background: C.track, marginTop: 7 }} className="home-skel" />
          <div style={{ height: 10, width: '70%', borderRadius: 4, background: C.track, marginTop: 8 }} className="home-skel" />
        </div>
      </div>
      <style>{`@keyframes homeSkel{0%,100%{opacity:.5}50%{opacity:.85}}.home-skel{animation:homeSkel 1.3s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.home-skel{animation:none}}`}</style>
    </div>
  )
}

function fmtEventDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
         d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const nameStyle   = { fontSize: 15, fontWeight: 650, color: C.ink, margin: 0, lineHeight: 1.25, letterSpacing: '-0.005em', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const metaStyle   = { fontSize: 12.5, color: C.ink3, margin: '2px 0 0', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const reasonStyle = { fontSize: 13, color: C.ink2, margin: '5px 0 0', lineHeight: 1.4, fontFamily: 'Inter, system-ui, sans-serif' }
const btn = {
  minHeight: 36, padding: '8px 14px', borderRadius: 10,
  background: C.ground, color: C.ink, border: `1px solid ${C.cardLine}`,
  fontSize: 12.5, fontWeight: 650, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
}
