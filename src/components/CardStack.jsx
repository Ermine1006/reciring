import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import { Handshake } from 'lucide-react'
import RequestCard from './RequestCard'
import EventPreviewCard from './EventPreviewCard'
import RequestDetailModal from './RequestDetailModal'
import MatchModal from './MatchModal'
import { rankRequests, filterRequests, DEFAULT_VIEWER_PROFILE } from '../data/matchRanking'
import { INDUSTRIES, HELP_TYPES, TIME_OPTIONS } from '../data/requestOptions'
import { useAuth } from '../context/AuthContext'
import { track } from '../lib/analytics'
import { matchaCta } from '../lib/matchaCta'

const C = {
  gold:      '#C9A33B',
  goldDark:  '#A6822A',
  goldLight: '#E8D9A7',
  goldBg:    '#F8F3E5',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 99, whiteSpace: 'nowrap',
        fontSize: 11, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
        cursor: 'pointer', transition: 'all 0.15s',
        background: active ? `linear-gradient(135deg, #97A275, #78855A)` : C.white,
        color: active ? '#fff' : C.textSub,
        border: `1px solid ${active ? '#8A9668' : '#E5E7EB'}`,
        boxShadow: active ? '0 2px 8px rgba(120,133,90,0.25)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

export default function CardStack({ requests, eventPromos, unmatchedPostIds, interactionMap, onSwipeRight, onSwipeLeft, onUnpass, onCardViewed, onMatchConfirm, onOpenChat, onScheduleChat, onReport, onBlock, onRestorePassed, onOpenEventPromo, onPromoImpression }) {
  const { viewerProfile } = useAuth()
  const viewer = viewerProfile || DEFAULT_VIEWER_PROFILE

  const [filters, setFilters] = useState({ industries: [], helpTypes: [], times: [] })
  const [showFilters, setShowFilters] = useState(false)

  const filterCount = filters.industries.length + filters.helpTypes.length + filters.times.length
  const hasFilters = filterCount > 0

  // Defaulting these to empty so the props stay optional in tests / demo.
  const unmatchedSet  = unmatchedPostIds || new Set()
  const interactions  = interactionMap   || new Map()

  // Session-only ORDERED list: cards the user has acted on this session,
  // oldest-acted first. New / re-acted ids go to the end. This ordering
  // is key — when the user finishes a full pass through all cards, the
  // next swipe on the "newly-top" card must push it past the others, so
  // the stack keeps cycling. A plain Set would no-op on re-add and the
  // feed would freeze. The persistent state still lives in interactionMap;
  // this list is purely for in-session visual order.
  const [recentlyActedOrder, setRecentlyActedOrder] = useState(() => [])

  const markRecentlyActed = useCallback((id) => {
    setRecentlyActedOrder(prev => {
      // Remove any prior entry for this id and re-append at the end.
      // This guarantees the just-acted card lands at the absolute bottom,
      // even when the user is cycling through an already-fully-swiped feed.
      const withoutId = prev.filter(x => x !== id)
      withoutId.push(id)
      return withoutId
    })
  }, [])

  // Ranked + sorted by the 4-tier system, then passed posts removed. Beta
  // feedback: a post the user swiped left ("pass") should NOT resurface — it
  // stays hidden (persisted in post_interactions). Users can bring passed
  // posts back from the empty state.
  const ranked = useMemo(() => {
    const filtered = filterRequests(requests, filters)
    const rankedList = rankRequests(filtered, viewer, unmatchedSet, interactions)
    return rankedList.filter(r => interactions.get(r.id) !== 'swiped_left')
  }, [requests, filters, viewer, unmatchedSet, interactions])

  // How many currently-loaded posts the user has passed (for the "bring back"
  // affordance). Counts only posts still present in the feed.
  const passedCount = useMemo(
    () => requests.reduce((n, r) => n + (interactions.get(r.id) === 'swiped_left' ? 1 : 0), 0),
    [requests, interactions]
  )

  // Final stack: tier-ranked fresh cards first, then acted cards in the
  // order they were acted on (oldest first, most recent last). This
  // guarantees the freshly-swiped card always ends up at the bottom,
  // even if every card was already acted on.
  const stack = useMemo(() => {
    if (recentlyActedOrder.length === 0) return ranked
    const actedSet = new Set(recentlyActedOrder)
    const byId = new Map()
    const fresh = []
    for (const r of ranked) {
      if (actedSet.has(r.id)) byId.set(r.id, r)
      else                    fresh.push(r)
    }
    const actedInOrder = recentlyActedOrder
      .map(id => byId.get(id))
      .filter(Boolean)
    return [...fresh, ...actedInOrder]
  }, [ranked, recentlyActedOrder])

  // Event-promo cards dismissed this session (requirement: don't keep showing
  // the same event once the user skips it).
  const [dismissedPromos, setDismissedPromos] = useState(() => new Set())
  const promoQueue = useMemo(
    () => (eventPromos || []).filter(p => !dismissedPromos.has(p.id)),
    [eventPromos, dismissedPromos]
  )

  // Final deck: interleave one event-promo card after every 5 regular cards,
  // so promos support rather than overwhelm Discover. A short deck still
  // surfaces one promo so acquisition isn't gated on having 5+ posts.
  const deck = useMemo(() => {
    if (promoQueue.length === 0) return stack
    if (stack.length === 0) return promoQueue.slice(0, 3)
    const out = []
    let pi = 0
    for (let i = 0; i < stack.length; i++) {
      out.push(stack[i])
      if ((i + 1) % 5 === 0 && pi < promoQueue.length) out.push(promoQueue[pi++])
    }
    if (pi === 0 && promoQueue.length > 0) out.push(promoQueue[0]) // short-deck fallback
    return out
  }, [stack, promoQueue])

  const isPromo = (item) => item?.kind === 'event_promo'

  const dismissPromo = useCallback((promo) => {
    setDismissedPromos(prev => {
      const next = new Set(prev)
      next.add(promo.id)
      return next
    })
  }, [])

  // How many event-promo cards were skipped this session (they live in local
  // state, not post_interactions, so "bring back" must clear them too).
  const dismissedPromoCount = useMemo(
    () => (eventPromos || []).reduce((n, p) => n + (dismissedPromos.has(p.id) ? 1 : 0), 0),
    [eventPromos, dismissedPromos]
  )

  // Restore everything the user skipped: passed posts (via the parent) AND
  // dismissed event-promo cards (session-local here).
  const restoreAllPassed = useCallback(() => {
    if (dismissedPromos.size) setDismissedPromos(new Set())
    onRestorePassed?.()
  }, [dismissedPromos, onRestorePassed])

  const [match, setMatch] = useState(null)
  const [detailRequest, setDetailRequest] = useState(null)
  const dragX   = useMotionValue(0)

  const toggleFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(v => v !== value)
        : [...prev[key], value],
    }))
  }

  const handleSwipeRight = useCallback(
    async (request) => {
      // Event-promo cards never create a match — a right swipe / CTA opens the
      // event (the acquisition funnel), then the card is dismissed for the
      // session so it doesn't reappear behind the detail page.
      if (isPromo(request)) {
        onOpenEventPromo?.(request)
        dismissPromo(request)
        return
      }
      // Push to bottom immediately so the modal opens over a different
      // card if creation takes a tick. Once matchedPostIds refreshes,
      // the card disappears entirely.
      markRecentlyActed(request.id)
      onSwipeRight?.(request)
      // A successful connect (new OR reactivated) returns a matchId and opens
      // the "It's a match!" modal — that IS the confirmation, mirroring how a
      // left-swipe just advances. No separate flash pill.
      const result = (await onMatchConfirm?.(request)) || {}
      if (result.error || !result.matchId) return
      setMatch({ id: result.matchId, request, peer: 'Anonymous Peer' })
    },
    [onSwipeRight, onMatchConfirm, markRecentlyActed, onOpenEventPromo, dismissPromo]
  )

  const handleSwipeLeft = useCallback(
    (request) => {
      // Event-promo left swipe = dismiss for this session (no persistence).
      if (isPromo(request)) { dismissPromo(request); return }
      // Persistent: records 'swiped_left' in App.jsx → updates interactionMap
      // → the deck filters it out. Remember it so the user can rewind the pass.
      markRecentlyActed(request.id)
      setLastPassed(request)
      onSwipeLeft?.(request)
    },
    [onSwipeLeft, markRecentlyActed, dismissPromo]
  )

  // Rewind / undo the last pass: un-pass the post (parent removes swiped_left +
  // deletes the row) and drop it from the acted-order so it returns to the top.
  const [lastPassed, setLastPassed] = useState(null)
  const handleUndoPass = useCallback(() => {
    if (!lastPassed) return
    const card = lastPassed
    setLastPassed(null)
    setRecentlyActedOrder(prev => prev.filter(x => x !== card.id))
    onUnpass?.(card.id)
  }, [lastPassed, onUnpass])

  const handleCardTap = useCallback(
    (request) => {
      // Tapping an event-promo card opens the event (same as the CTA).
      if (isPromo(request)) { onOpenEventPromo?.(request); dismissPromo(request); return }
      // Record 'viewed' before opening the detail modal. The recorder
      // refuses to downgrade an existing 'swiped_left' to 'viewed', so
      // re-viewing a previously-skipped post doesn't promote it back.
      onCardViewed?.(request)
      setDetailRequest(request)
    },
    [onCardViewed, onOpenEventPromo, dismissPromo]
  )

  const topRequest  = deck[0]
  const nextRequest = deck[1]

  // Fire a preview-impression the first time each promo reaches the top slot.
  const [impressed, setImpressed] = useState(() => new Set())
  useEffect(() => {
    if (!isPromo(topRequest)) return
    if (impressed.has(topRequest.id)) return
    setImpressed(prev => new Set(prev).add(topRequest.id))
    onPromoImpression?.(topRequest)
  }, [topRequest, impressed, onPromoImpression])

  // Funnel: fire a one-time exposure the first time each *non-promo* card
  // reaches the top slot — the top of the matching funnel. Guarded by a
  // session Set so scrolling back to a card doesn't double-count it.
  const [exposed, setExposed] = useState(() => new Set())
  useEffect(() => {
    if (!topRequest || isPromo(topRequest)) return
    if (exposed.has(topRequest.id)) return
    setExposed(prev => new Set(prev).add(topRequest.id))
    track('discover_card_exposed', {
      post_id: topRequest.id,
      score: topRequest._score,
      tier: topRequest._tier,
    })
  }, [topRequest, exposed])

  /* ── Filter bar ───────────────────────────────────────────────── */
  const filterBar = (
    <div style={{ flexShrink: 0, background: '#F9F7F4' }}>
      {/* Toggle + clear row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px 0', gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowFilters(f => !f)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 99,
            background: hasFilters ? C.goldBg : C.white,
            border: `1px solid ${hasFilters ? C.goldLight : '#E5E7EB'}`,
            fontSize: 12, fontWeight: 600, color: hasFilters ? C.goldDark : C.textSub,
            fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" d="M3 6h18M7 12h10M10 18h4" />
          </svg>
          Filters{hasFilters ? ` (${filterCount})` : ''}
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setFilters({ industries: [], helpTypes: [], times: [] })}
            style={{
              padding: '6px 12px', borderRadius: 99,
              background: 'transparent', border: 'none',
              fontSize: 11, fontWeight: 500, color: C.textMuted,
              fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Expandable chip sections */}
      {showFilters && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ overflow: 'hidden', padding: '8px 16px 12px' }}
        >
          {/* Career focus */}
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 6,
          }}>
            Career focus
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {INDUSTRIES.map(ind => (
              <FilterChip
                key={ind}
                label={ind}
                active={filters.industries.includes(ind)}
                onClick={() => toggleFilter('industries', ind)}
              />
            ))}
          </div>

          {/* Help type */}
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 6,
          }}>
            Help type
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {HELP_TYPES.map(ht => (
              <FilterChip
                key={ht}
                label={ht}
                active={filters.helpTypes.includes(ht)}
                onClick={() => toggleFilter('helpTypes', ht)}
              />
            ))}
          </div>

          {/* Time commitment */}
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 6,
          }}>
            Time commitment
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TIME_OPTIONS.map(t => (
              <FilterChip
                key={t}
                label={t}
                active={filters.times.includes(t)}
                onClick={() => toggleFilter('times', t)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )

  /* ── Empty state ──────────────────────────────────────────────── */
  if (deck.length === 0) {
    return (
      <div className="flex flex-col flex-1">
        {filterBar}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center flex-1 px-8 py-12 text-center"
        >
          <div
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: C.goldBg,
              border: `1.5px solid ${C.goldLight}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 24px rgba(201,163,59,0.18)',
            }}
          >
            <svg width="30" height="30" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <p
            className="font-display"
            style={{ fontSize: 24, fontWeight: 600, color: C.text, marginBottom: 8 }}
          >
            {hasFilters ? 'No matching requests' : 'All caught up'}
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: C.textSub, marginBottom: hasFilters ? 16 : 0 }}>
            {hasFilters
              ? 'Try broadening your filters or check back later.'
              : <>No more requests for now.<br />Check back later or post your own.</>
            }
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setFilters({ industries: [], helpTypes: [], times: [] })}
              style={{
                padding: '10px 24px', borderRadius: 99,
                background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
                color: C.goldDark, fontSize: 13, fontWeight: 600,
                fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
              }}
            >
              Clear filters
            </button>
          )}
          {/* Bring back posts the user passed (beta feedback: let me revisit).
              Includes skipped event-promo cards so they can be recovered too. */}
          {!hasFilters && (passedCount + dismissedPromoCount) > 0 && (onRestorePassed || dismissedPromoCount > 0) && (
            <button
              type="button"
              onClick={restoreAllPassed}
              style={{
                marginTop: 18, padding: '10px 24px', borderRadius: 99,
                background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
                color: C.goldDark, fontSize: 13, fontWeight: 600,
                fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
              }}
            >
              ↩ Bring back {passedCount + dismissedPromoCount} passed {(passedCount + dismissedPromoCount) === 1 ? 'card' : 'cards'}
            </button>
          )}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1" style={{ minHeight: 0 }}>
      {filterBar}
      <div className="flex flex-col flex-1" style={{ minHeight: 0 }}>
        {/* ── Card region ─────────────────────────────────────── */}
        <div className="relative flex-1" style={{ minHeight: 0 }}>
          {nextRequest && (
            isPromo(nextRequest)
              ? <EventPreviewCard key={nextRequest.id} promo={nextRequest} isTop={false} />
              : <RequestCard key={nextRequest.id} request={nextRequest} isTop={false} matchReason={nextRequest._reason} matchReasons={nextRequest._reasons} />
          )}

          {/* Top card stays fully opaque while dragging. It used to fade to
              0.45 on left swipe, which dimmed the PASS stamp along with it
              (the stamp lives inside this card) and let the card behind bleed
              through the edges — beta feedback: "can't see PASS on left
              swipe". Rotation + translation + the stamp carry the gesture. */}
          <motion.div className="absolute inset-0">
            {isPromo(topRequest) ? (
              <EventPreviewCard
                key={topRequest.id}
                promo={topRequest}
                isTop
                onDrag={(x) => dragX.set(x)}
                onSwipeLeft={() => handleSwipeLeft(topRequest)}
                onSwipeRight={() => handleSwipeRight(topRequest)}
                onTap={handleCardTap}
              />
            ) : (
              <RequestCard
                key={topRequest.id}
                request={topRequest}
                isTop
                matchReason={topRequest._reason}
                matchReasons={topRequest._reasons}
                onDrag={(x) => dragX.set(x)}
                onSwipeLeft={() => handleSwipeLeft(topRequest)}
                onSwipeRight={() => handleSwipeRight(topRequest)}
                onTap={handleCardTap}
              />
            )}
          </motion.div>
        </div>

        {/* ── Action buttons (flow layout, not absolute) ──────── */}
        <div
          className="flex-shrink-0 flex justify-center items-center z-20"
          style={{ paddingTop: 12, paddingBottom: 20, gap: 20 }}
        >
          {/* Rewind — undo the last pass (only when there's one to undo) */}
          {lastPassed && (
            <button
              type="button"
              onClick={handleUndoPass}
              className="flex items-center justify-center transition-all duration-200 active:scale-90"
              style={{
                width: 48, height: 48, borderRadius: '50%',
                background: C.white, border: `1.5px solid ${C.goldLight}`,
                boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
              }}
              aria-label="Undo last pass"
              title="Undo last pass"
            >
              <svg width="20" height="20" fill="none" stroke="#C9A33B" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l-4-4 4-4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10h10a4 4 0 010 8h-2" />
              </svg>
            </button>
          )}

          {/* Pass */}
          <button
            type="button"
            onClick={() => handleSwipeLeft(topRequest)}
            className="flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              width: 60, height: 60, borderRadius: '50%',
              background: C.white,
              border: '1.5px solid #E5E7EB',
              boxShadow: '0 6px 20px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
            }}
            aria-label="Pass"
          >
            <svg width="20" height="20" fill="none" stroke="#9CA3AF" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Match */}
          <button
            type="button"
            onClick={() => handleSwipeRight(topRequest)}
            className="flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              width: 68, height: 68, borderRadius: '50%',
              border: `1px solid ${C.goldLight}`,
              ...matchaCta,
            }}
            aria-label="Match if you'd like to help"
            title="Match if you'd like to help"
          >
            <Handshake size={26} stroke="#FFFFFF" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {detailRequest && (
        <RequestDetailModal
          request={detailRequest}
          matchReason={detailRequest._reason}
          matchReasons={detailRequest._reasons}
          onClose={() => setDetailRequest(null)}
          onMatch={(r) => handleSwipeRight(r)}
          onReport={onReport}
          onBlock={onBlock}
        />
      )}

      {match && (
        <MatchModal
          match={match}
          // Dismiss = close the popup only. The match record stays in
          // the DB; the user can still find it in their Matches inbox.
          // No status change, no chat opened, no redirect.
          onClose={() => setMatch(null)}
          // "Send quick intro" — navigate to chat (match already exists)
          onConfirm={() => { onOpenChat?.(match.id); setMatch(null) }}
          // "Schedule coffee chat" — navigate to chat AND auto-open scheduler
          onSchedule={() => { onScheduleChat?.(match.id); setMatch(null) }}
        />
      )}
    </div>
  )
}
