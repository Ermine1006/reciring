import { useState, useEffect, useCallback, useMemo } from 'react'
import MarketplacePostCard from './MarketplacePostCard'
import MarketplacePostComposer from './MarketplacePostComposer'
import EventPostCard from './EventPostCard'
import MarketplaceInterestSheet from './MarketplaceInterestSheet'
import {
  fetchMarketplaceFeed, fetchMyMarketplacePosts, fetchMyInterests,
  fetchInterestsForOwner, createMarketplacePost, updateMarketplacePost,
  deleteMarketplacePost, expressInterest, acceptInterest, declineInterest,
  fetchMarketplaceInterestStats,
} from '../lib/marketplace'
import { notifyNewMatch } from '../lib/email'
import EventMatchList from './EventMatchList'
import { matchaCta } from '../lib/matchaCta'

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#111111', textSub: '#6B7280', textMuted: '#9CA3AF', white: '#FFFFFF',
  border: '#F0ECE4', green: '#2E6B4F',
}

/**
 * The Marketplace tab inside an event. Attendees post one "need" + one "offer",
 * browse others anonymously, and express interest. Owners accept → identity
 * reveal + private chat (handled by the DB trigger; onOpenChat navigates there).
 */
export default function EventMarketplace({ eventId, userId, isHost = false, allowPromotion = false, onOpenChat, onPrepare }) {
  const [feed, setFeed]           = useState([])
  const [myPosts, setMyPosts]     = useState([])
  const [myInterests, setMyInt]   = useState([])       // interests I sent
  const [ownerInt, setOwnerInt]   = useState([])       // interests in my posts (anon)
  const [stats, setStats]         = useState(null)     // host interest stats
  const [loading, setLoading]     = useState(true)

  const [composer, setComposer]   = useState(null)     // { mode, type, initial }
  const [composerBusy, setCBusy]  = useState(false)
  const [composerErr, setCErr]    = useState(null)
  const [managePostId, setManage] = useState(null)     // which of my posts' interests to show
  const [busyId, setBusyId]       = useState(null)
  const [toast, setToast]         = useState(null)

  const loadAll = useCallback(async () => {
    if (!eventId || !userId) return
    const [f, mp, mi, oi, st] = await Promise.all([
      fetchMarketplaceFeed(eventId, userId),
      fetchMyMarketplacePosts(eventId, userId),
      fetchMyInterests(eventId, userId),
      fetchInterestsForOwner(eventId, userId),
      isHost ? fetchMarketplaceInterestStats(eventId) : Promise.resolve({ data: null }),
    ])
    setFeed(f.data || [])
    setMyPosts(mp.data || [])
    setMyInt(mi.data || [])
    setOwnerInt(oi.data || [])
    setStats(st.data || null)
    setLoading(false)
  }, [eventId, userId, isHost])

  useEffect(() => { setLoading(true); loadAll() }, [loadAll])

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600) }

  // Map post_id → my interest row (for browse cards).
  const interestByPost = useMemo(() => {
    const m = {}
    for (const it of myInterests) m[it.post_id] = it
    return m
  }, [myInterests])

  // One combined Event Post per attendee — group the need/offer rows by
  // author (grouping only; no data change). Never two cards for one person.
  const groupedFeed = useMemo(() => {
    const by = new Map()
    for (const p of feed) {
      const g = by.get(p.user_id) || {
        userId: p.user_id, program: p.poster_program, headline: p.poster_headline,
        industry: p.poster_industry, need: null, offer: null, _order: p.created_at,
      }
      if (p.type === 'need') g.need = p
      else if (p.type === 'offer') g.offer = p
      if (p.created_at < g._order) g._order = p.created_at
      by.set(p.user_id, g)
    }
    return [...by.values()]
  }, [feed])

  // My own need + offer grouped into one Event Post.
  const myNeed  = myPosts.find(p => p.type === 'need')  || null
  const myOffer = myPosts.find(p => p.type === 'offer') || null
  const hasMyPost = Boolean(myNeed || myOffer)

  // Interest counts per one of MY posts.
  const ownerByPost = useMemo(() => {
    const m = {}
    for (const it of ownerInt) {
      if (!m[it.post_id]) m[it.post_id] = { total: 0, pending: 0, rows: [] }
      m[it.post_id].rows.push(it)
      if (it.status !== 'cancelled' && it.status !== 'declined') m[it.post_id].total++
      if (it.status === 'pending') m[it.post_id].pending++
    }
    return m
  }, [ownerInt])

  const haveNeed  = myPosts.some(p => p.type === 'need')
  const haveOffer = myPosts.some(p => p.type === 'offer')

  // ── Handlers ──────────────────────────────────────────────
  const submitComposer = async ({ type, title, description, tags, urgency, promoteToDiscover }) => {
    setCBusy(true); setCErr(null)
    const isEdit = composer?.mode === 'edit'
    const res = isEdit
      ? await updateMarketplacePost(composer.initial.id, { title, description, tags, urgency, promoteToDiscover })
      : await createMarketplacePost({ eventId, userId, type, title, description, tags, urgency, promoteToDiscover })
    setCBusy(false)
    if (res.error) { setCErr(res.error.message || 'Could not save'); return }
    setComposer(null)
    flash(isEdit ? 'Post updated' : 'Posted to the marketplace')
    loadAll()
  }

  const sendInterest = async (post) => {
    // Optimistic: mark pending immediately.
    setMyInt(prev => [...prev, { id: `tmp-${post.id}`, post_id: post.id, status: 'pending', match_id: null }])
    const { error } = await expressInterest({ postId: post.id, eventId, ownerId: post.user_id, requesterId: userId })
    if (error) { flash(error.message ? `Couldn't send interest: ${error.message}` : 'Could not send interest'); loadAll(); return }
    flash("Interest sent — they'll be notified")
    loadAll()
  }

  const accept = async (interest) => {
    setBusyId(interest.id)
    const { error, matchId } = await acceptInterest(interest.id)
    setBusyId(null)
    if (error) { flash('Could not accept'); return }
    setManage(null)
    await loadAll()
    // Email the person whose interest was accepted — fire-and-forget.
    if (matchId) notifyNewMatch(matchId).catch(() => {})
    if (matchId) onOpenChat?.(matchId)   // reveal + open the private chat
  }

  const decline = async (interest) => {
    setBusyId(interest.id)
    const { error } = await declineInterest(interest.id)
    setBusyId(null)
    if (error) { flash('Could not decline'); return }
    loadAll()
  }

  // ── Host stats (computed from what the host can read) ─────
  const hostTopics = useMemo(() => {
    if (!isHost) return null
    const all = [...feed, ...myPosts]
    const needs = all.filter(p => p.type === 'need')
    const offers = all.filter(p => p.type === 'offer')
    const tally = (arr) => {
      const c = {}
      for (const p of arr) for (const t of (p.tags || [])) c[t] = (c[t] || 0) + 1
      return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
    }
    return {
      total: all.length, needs: needs.length, offers: offers.length,
      topRequested: tally(needs), topOffered: tally(offers),
    }
  }, [isHost, feed, myPosts])

  if (loading) {
    return <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 14, padding: '40px 0' }}>Loading Event Board…</p>
  }

  const managePost = myPosts.find(p => p.id === managePostId) || null

  return (
    <div>
      {/* Intro */}
      <p style={{ margin: '4px 0 16px', fontSize: 13.5, color: C.textSub, lineHeight: 1.55, fontFamily: 'Inter, system-ui, sans-serif' }}>
        Share what you're looking for and what you can offer, then browse other attendees and connect
        before the event — names stay hidden until someone accepts.
      </p>

      {/* Host stats now live in the host-only Manage page, not on the Board. */}

      {/* Your event post — one combined card; Edit opens Prepare */}
      <p style={sectionLabel}>Your event post</p>
      {hasMyPost ? (
        <EventPostCard
          entry={{ userId, need: myNeed, offer: myOffer }}
          mine
          interestCount={(ownerByPost[myNeed?.id]?.total || 0) + (ownerByPost[myOffer?.id]?.total || 0)}
          pendingCount={(ownerByPost[myNeed?.id]?.pending || 0) + (ownerByPost[myOffer?.id]?.pending || 0)}
          onEdit={() => (onPrepare ? onPrepare() : setComposer({ mode: 'edit', type: myNeed ? 'need' : 'offer', initial: myNeed || myOffer }))}
          onDelete={async () => {
            const targets = [myNeed, myOffer].filter(Boolean)
            if (targets.length === 0) return
            if (!window.confirm('Delete your event post? This removes it from the board.')) return
            for (const p of targets) {
              const { error } = await deleteMarketplacePost(p.id)
              if (error) { flash('Could not delete'); return }
            }
            flash('Post deleted')
            loadAll()
          }}
          onManage={() => {
            const target = [myNeed, myOffer].find(p => p && ownerByPost[p.id]?.pending) || myNeed || myOffer
            setManage(target?.id)
          }}
        />
      ) : (
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: C.textSub, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Let attendees know what you're looking for or can offer.
          </p>
          <button type="button" onClick={() => (onPrepare ? onPrepare() : setComposer({ mode: 'create', type: 'need' }))}
            style={{ width: '100%', marginTop: 12, padding: '12px', borderRadius: 11, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', ...matchaCta }}>
            Create event post
          </button>
        </div>
      )}

      {/* Suggested people — relevant attendees with a factual reason (no %). */}
      {userId && <EventMatchList eventId={eventId} userId={userId} title="Suggested people" />}

      {/* Attendee posts — one combined card per person */}
      <p style={{ ...sectionLabel, marginTop: 22 }}>Attendee posts</p>
      {groupedFeed.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
            No one else has shared a post yet. Be the first — others will see it when they open the Event Board.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groupedFeed.map(g => (
            <EventPostCard
              key={g.userId}
              entry={g}
              myInterest={interestByPost[g.need?.id] || interestByPost[g.offer?.id] || null}
              onInterested={sendInterest}
              onOpenChat={onOpenChat}
            />
          ))}
        </div>
      )}

      {/* Composer + manage sheet */}
      <MarketplacePostComposer
        open={Boolean(composer)}
        mode={composer?.mode || 'create'}
        type={composer?.type || 'need'}
        initial={composer?.initial || null}
        busy={composerBusy}
        error={composerErr}
        allowPromotion={allowPromotion}
        onSubmit={submitComposer}
        onClose={() => { setComposer(null); setCErr(null) }}
      />

      <MarketplaceInterestSheet
        open={Boolean(managePost)}
        post={managePost}
        interests={managePost ? (ownerByPost[managePost.id]?.rows || []) : []}
        busyId={busyId}
        onAccept={accept}
        onDecline={decline}
        onOpenChat={(mid) => { setManage(null); onOpenChat?.(mid) }}
        onClose={() => setManage(null)}
      />

      {toast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 92, transform: 'translateX(-50%)',
          background: C.ink, color: C.white, padding: '10px 18px', borderRadius: 999,
          fontSize: 13, fontWeight: 600, zIndex: 100, boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          fontFamily: 'Inter, system-ui, sans-serif', maxWidth: '90%', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function Stat({ n, label }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.goldDark, fontFamily: 'Fraunces, Georgia, serif' }}>{n}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</p>
    </div>
  )
}

function TopList({ title, items }) {
  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>{title}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((t, i) => (
          <span key={i} style={{ fontSize: 11.5, color: C.goldDark, background: C.white, border: `1px solid ${C.goldLight}`, borderRadius: 999, padding: '3px 10px', fontFamily: 'Inter, system-ui, sans-serif' }}>{t}</span>
        ))}
      </div>
    </div>
  )
}

const cardStyle = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 12 }
const sectionLabel = { fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', margin: '0 0 10px' }
const addBtn = { flex: 1, padding: '13px', borderRadius: 12, background: C.white, border: `1.5px dashed ${C.goldLight}`, color: C.goldDark, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }
