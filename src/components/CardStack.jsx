import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { Handshake } from 'lucide-react'
import RequestCard from './RequestCard'
import RequestDetailModal from './RequestDetailModal'
import MatchModal from './MatchModal'
import { rankRequests, filterRequests, DEFAULT_VIEWER_PROFILE } from '../data/matchRanking'
import { INDUSTRIES, HELP_TYPES, TIME_OPTIONS } from '../data/requestOptions'
import { useAuth } from '../context/AuthContext'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
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
        background: active ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : C.white,
        color: active ? '#fff' : C.textSub,
        border: `1px solid ${active ? C.gold : '#E5E7EB'}`,
        boxShadow: active ? '0 2px 8px rgba(200,169,106,0.25)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

export default function CardStack({ requests, onSwipeRight, onSwipeLeft, onMatchConfirm, onReport, onBlock }) {
  const { viewerProfile } = useAuth()
  const viewer = viewerProfile || DEFAULT_VIEWER_PROFILE

  const [filters, setFilters] = useState({ industries: [], helpTypes: [], times: [] })
  const [showFilters, setShowFilters] = useState(false)

  const filterCount = filters.industries.length + filters.helpTypes.length + filters.times.length
  const hasFilters = filterCount > 0

  const ranked = useMemo(() => {
    const filtered = filterRequests(requests, filters)
    return rankRequests(filtered, viewer)
  }, [requests, filters, viewer])

  const [stack, setStack] = useState(ranked)
  const [match, setMatch] = useState(null)
  const [detailRequest, setDetailRequest] = useState(null)
  const dragX   = useMotionValue(0)
  const opacity = useTransform(dragX, [-120, 0], [0.45, 1])

  // Re-sync stack when filters or requests change
  useEffect(() => {
    setStack(rankRequests(filterRequests(requests, filters), viewer))
  }, [requests, filters])

  const toggleFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(v => v !== value)
        : [...prev[key], value],
    }))
  }

  const handleSwipeRight = useCallback(
    (request) => {
      setStack((prev) => prev.filter((r) => r.id !== request.id))
      onSwipeRight?.(request)
      // Always show the match modal — real match is created on confirm
      setMatch({ request, peer: 'Anonymous Peer' })
    },
    [onSwipeRight]
  )

  const handleSwipeLeft = useCallback(
    (request) => {
      setStack((prev) => prev.filter((r) => r.id !== request.id))
      onSwipeLeft?.(request)
    },
    [onSwipeLeft]
  )

  const topRequest  = stack[0]
  const nextRequest = stack[1]

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
          {/* Industry */}
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 6,
          }}>
            Industry
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
  if (stack.length === 0) {
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
              boxShadow: '0 8px 24px rgba(200,169,106,0.18)',
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
            <RequestCard key={nextRequest.id} request={nextRequest} isTop={false} matchReason={nextRequest._reason} />
          )}

          <motion.div style={{ opacity }} className="absolute inset-0">
            <RequestCard
              key={topRequest.id}
              request={topRequest}
              isTop
              matchReason={topRequest._reason}
              onDrag={(x) => dragX.set(x)}
              onSwipeLeft={() => handleSwipeLeft(topRequest)}
              onSwipeRight={() => handleSwipeRight(topRequest)}
              onTap={(r) => setDetailRequest(r)}
            />
          </motion.div>
        </div>

        {/* ── Action buttons (flow layout, not absolute) ──────── */}
        <div
          className="flex-shrink-0 flex justify-center z-20"
          style={{ paddingTop: 12, paddingBottom: 20, gap: 24 }}
        >
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
              background: 'linear-gradient(135deg, #C8A96A 0%, #E6D3A3 100%)',
              boxShadow: '0 8px 28px rgba(200,169,106,0.45), 0 2px 8px rgba(200,169,106,0.2)',
              border: `1px solid ${C.goldLight}`,
            }}
            aria-label="Match if you can help and want what they offer"
            title="Match if you can help and want what they offer"
          >
            <Handshake size={26} stroke="#5C3D11" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {detailRequest && (
        <RequestDetailModal
          request={detailRequest}
          matchReason={detailRequest._reason}
          onClose={() => setDetailRequest(null)}
          onMatch={(r) => handleSwipeRight(r)}
          onReport={onReport}
          onBlock={onBlock}
        />
      )}

      {match && (
        <MatchModal
          match={match}
          onClose={() => setMatch(null)}
          onConfirm={() => { onMatchConfirm?.(match); setMatch(null) }}
          onSchedule={(m) => { onMatchConfirm?.(m); setMatch(null) }}
        />
      )}
    </div>
  )
}
