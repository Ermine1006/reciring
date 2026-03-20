import { useState, useCallback, useEffect } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { Handshake } from 'lucide-react'
import RequestCard from './RequestCard'
import MatchModal from './MatchModal'

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

export default function CardStack({ requests, onSwipeRight, onSwipeLeft, onMatchConfirm }) {
  const [stack, setStack] = useState(requests)
  const [match, setMatch] = useState(null)
  const dragX   = useMotionValue(0)
  const opacity = useTransform(dragX, [-120, 0], [0.45, 1])

  useEffect(() => {
    setStack((prev) => {
      const prevIds = new Set(prev.map((r) => r.id))
      const added   = requests.filter((r) => !prevIds.has(r.id))
      if (added.length === 0) return prev
      return [...added, ...prev]
    })
  }, [requests])

  const handleSwipeRight = useCallback(
    (request) => {
      setStack((prev) => prev.filter((r) => r.id !== request.id))
      onSwipeRight?.(request)
      if (Math.random() > 0.6) setMatch({ request, peer: 'A fellow Rotman MBA' })
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

  /* ── Empty state ──────────────────────────────────────────────── */
  if (stack.length === 0) {
    return (
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
          All caught up
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: C.textSub }}>
          No more requests for now.<br />Check back later or post your own.
        </p>
      </motion.div>
    )
  }

  return (
    <div className="relative flex-1 w-full">
      {nextRequest && (
        <RequestCard key={nextRequest.id} request={nextRequest} isTop={false} />
      )}

      <motion.div style={{ opacity }} className="absolute inset-0">
        <RequestCard
          key={topRequest.id}
          request={topRequest}
          isTop
          onDrag={(x) => dragX.set(x)}
          onSwipeLeft={() => handleSwipeLeft(topRequest)}
          onSwipeRight={() => handleSwipeRight(topRequest)}
        />
      </motion.div>

      {/* ── Action buttons ──────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 flex justify-center z-20"
        style={{ bottom: 20, gap: 24 }}
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

      {match && (
        <MatchModal
          match={match}
          onClose={() => setMatch(null)}
          onConfirm={() => onMatchConfirm?.(match)}
        />
      )}
    </div>
  )
}
