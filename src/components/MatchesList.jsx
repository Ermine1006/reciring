import { motion } from 'framer-motion'
import AnonymousAvatar from './AnonymousAvatar'

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

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function MatchesList({ matches = [], onOpenChat }) {
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
          People you've connected with. Tap to chat or schedule a coffee.
        </p>
      </div>

      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 48 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 28,
          }}>
            🤝
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8, fontFamily: 'Fraunces, Georgia, serif' }}>
            No matches yet
          </p>
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Swipe right on a request to create<br />your first match.
          </p>
        </div>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
          {matches.map((m, i) => (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => onOpenChat?.(m.id)}
              style={{
                borderRadius: 20, overflow: 'hidden',
                background: C.white,
                border: `1px solid ${C.border}`,
                boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                cursor: 'pointer',
              }}
            >
              {/* Gold top stripe */}
              <div style={{ height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight} 60%, transparent)` }} />

              <div style={{ padding: '14px 18px' }}>
                {/* Peer row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <AnonymousAvatar seed={m.id} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 2 }}>
                      Anonymous Peer
                    </p>
                    <p style={{
                      fontSize: 12, color: C.textSub,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {m.lastMessage || 'New match'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 10, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
                      {m.lastMessageTime || timeAgo(m.createdAt)}
                    </p>
                    {/* Unread dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: C.gold, margin: '4px 0 0 auto',
                    }} />
                  </div>
                </div>

                {/* Request snippet */}
                {m.request?.needs && (
                  <div style={{
                    background: C.goldBg, borderRadius: 10,
                    padding: '8px 12px',
                    border: `1px solid ${C.goldLight}`,
                  }}>
                    <p style={{
                      fontSize: 11, color: C.textSub,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      lineHeight: 1.4,
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      <strong style={{ color: C.goldDark }}>Needs: </strong>
                      {m.request.needs}
                    </p>
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
