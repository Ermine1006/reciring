import { motion } from 'framer-motion'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#F0ECE4',
}

const MOCK_MATCHES = [
  {
    id: 'm1',
    peer:    'Fellow Rotman MBA',
    request: 'Connect to someone at Bain',
    status:  'Scheduled',
    date:    'Tomorrow, 3 pm',
    initials: 'RM',
  },
  {
    id: 'm2',
    peer:    'Rotman Peer',
    request: 'Finance midterm study buddy',
    status:  'Completed',
    date:    'Last week',
    initials: 'RP',
  },
]

export default function MatchesList() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-5 py-7"
    >
      {/* Section header */}
      <div className="mb-7">
        <p className="text-[10px] tracking-[0.28em] font-semibold uppercase mb-1" style={{ color: C.gold }}>
          Your network
        </p>
        <h2 className="font-display text-[24px] font-semibold" style={{ color: C.text }}>
          Matches
        </h2>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: C.textSub }}>
          People you're connected with. Schedule coffee chats and leave a review after.
        </p>
      </div>

      <ul className="space-y-3">
        {MOCK_MATCHES.map((m, i) => (
          <motion.li
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-[20px] overflow-hidden"
            style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
            }}
          >
            {/* Top gold accent stripe */}
            <div style={{ height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight} 60%, transparent)` }} />

            <div className="px-5 py-4">
              {/* Peer row */}
              <div className="flex items-center gap-3 mb-3">
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold"
                  style={{ background: C.goldBg, border: `1.5px solid ${C.goldLight}`, color: C.goldDark }}
                >
                  {m.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight truncate" style={{ color: C.text }}>{m.peer}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: C.textSub }}>{m.request}</p>
                </div>
              </div>

              {/* Footer row */}
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] tracking-[0.12em] uppercase font-semibold px-3 py-1 rounded-full"
                  style={{
                    background: m.status === 'Completed' ? C.goldBg          : '#F3F4F6',
                    border:     m.status === 'Completed' ? `1px solid ${C.goldLight}` : '1px solid #E5E7EB',
                    color:      m.status === 'Completed' ? C.goldDark         : C.textSub,
                  }}
                >
                  {m.status}
                </span>
                <span className="text-[11px]" style={{ color: C.textMuted }}>{m.date}</span>
              </div>

              {m.status === 'Completed' && (
                <button
                  type="button"
                  className="mt-3 w-full py-2.5 rounded-[12px] text-xs font-semibold tracking-[0.1em] uppercase transition-all duration-200 active:scale-[0.98]"
                  style={{
                    background: C.goldBg,
                    border: `1.5px solid ${C.goldLight}`,
                    color: C.goldDark,
                  }}
                >
                  Leave a review →
                </button>
              )}
            </div>
          </motion.li>
        ))}
      </ul>

      {/* Empty-state hint */}
      <p className="text-center text-[12px] mt-8" style={{ color: C.textMuted }}>
        New matches appear here after you help a peer.
      </p>
    </motion.div>
  )
}
