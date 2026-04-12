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

function Stars({ count }) {
  return (
    <span style={{ color: C.gold, fontSize: 14, letterSpacing: 1 }}>
      {'★'.repeat(count)}
      <span style={{ color: '#E5E7EB' }}>{'★'.repeat(5 - count)}</span>
    </span>
  )
}

export default function PendingReviewsList({ matches = [], pastReviews = [], allMatches = [], onSelect }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-5 py-7"
    >
      {/* Section header */}
      <div className="mb-7">
        <p className="text-[10px] tracking-[0.28em] font-semibold uppercase mb-1" style={{ color: C.gold }}>
          Feedback
        </p>
        <h2 className="font-display text-[24px] font-semibold" style={{ color: C.text }}>
          My reviews
        </h2>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: C.textSub }}>
          Rate your matches and see your past reviews.
        </p>
      </div>

      {/* ── Pending reviews ─────────────────────────────────── */}
      {matches.length > 0 && (
        <>
          <p
            className="text-[11px] tracking-[0.16em] uppercase font-semibold mb-3"
            style={{ color: C.textSub }}
          >
            Pending ({matches.length})
          </p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
            {matches.map((m, i) => (
              <motion.li
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => onSelect?.(m.id)}
                style={{
                  borderRadius: 20, overflow: 'hidden',
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight} 60%, transparent)` }} />
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                        Matched {timeAgo(m.createdAt)}
                      </p>
                    </div>
                    <div style={{
                      flexShrink: 0, padding: '5px 12px',
                      borderRadius: 10, fontSize: 11, fontWeight: 600,
                      color: C.goldDark, background: C.goldBg,
                      border: `1px solid ${C.goldLight}`,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>
                      Review
                    </div>
                  </div>
                  {m.request?.needs && (
                    <div style={{
                      marginTop: 10,
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
        </>
      )}

      {/* ── Past reviews ────────────────────────────────────── */}
      <p
        className="text-[11px] tracking-[0.16em] uppercase font-semibold mb-3"
        style={{ color: C.textSub }}
      >
        Past reviews ({pastReviews.length})
      </p>

      {pastReviews.length === 0 && matches.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 28,
          }}>
            ★
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8, fontFamily: 'Fraunces, Georgia, serif' }}>
            No reviews yet
          </p>
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, fontFamily: 'Inter, system-ui, sans-serif' }}>
            After you match and connect,<br />your reviews will appear here.
          </p>
        </div>
      ) : pastReviews.length === 0 ? (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', paddingTop: 16 }}>
          No past reviews yet.
        </p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
          {pastReviews.map((r, i) => {
            const match = allMatches.find(m => m.id === r.match_id)
            return (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                style={{
                  borderRadius: 20, overflow: 'hidden',
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <AnonymousAvatar seed={r.match_id} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 2 }}>
                        Anonymous Peer
                      </p>
                      <Stars count={r.rating} />
                    </div>
                    <p style={{ fontSize: 11, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', flexShrink: 0 }}>
                      {timeAgo(r.created_at)}
                    </p>
                  </div>

                  {r.comment ? (
                    <p style={{
                      fontSize: 12, color: C.textSub, lineHeight: 1.5,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontStyle: 'italic',
                      padding: '8px 12px',
                      background: '#F9F7F4', borderRadius: 10,
                    }}>
                      "{r.comment}"
                    </p>
                  ) : (
                    <p style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>
                      No written review
                    </p>
                  )}

                  {match?.request?.needs && (
                    <p style={{
                      fontSize: 11, color: C.textMuted, marginTop: 8,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      Re: {match.request.needs}
                    </p>
                  )}
                </div>
              </motion.li>
            )
          })}
        </ul>
      )}
    </motion.div>
  )
}
