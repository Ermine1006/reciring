import { motion, AnimatePresence } from 'framer-motion'
import ReputationCard from './ReputationCard'

// "My Impact" — opened from the gold token pill. Verified-data-only
// metrics + transparent badges (via ReputationCard/computeReputation).
// Community-scoped; no opaque score, no leaderboard, no streaks.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

export default function ImpactSheet({ open, reputation, communityName = 'Rotman', onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(24,22,15,0.4)', display: 'flex', alignItems: 'flex-end',
          }}
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxHeight: '82dvh', overflowY: 'auto',
              background: '#F9F7F4', borderRadius: '22px 22px 0 0',
              padding: '14px 16px calc(20px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 99, background: C.line, margin: '0 auto 14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: FONT }}>My Impact</h2>
              <span style={{ fontSize: 11, color: C.ink3, fontFamily: FONT }}>{communityName} community</span>
            </div>

            <ReputationCard reputation={reputation} />

            {/* Badges — transparent criteria, verified data only */}
            <div style={{
              marginTop: 12, background: C.white, borderRadius: 16,
              border: `1px solid ${C.line}`, padding: '13px 15px',
            }}>
              <p style={{ margin: '0 0 10px', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: C.ink3, fontFamily: FONT }}>
                Badges
              </p>
              {reputation?.badges?.map((b) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 0' }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    display: 'grid', placeItems: 'center', fontSize: 13,
                    background: b.earned
                      ? 'radial-gradient(circle at 32% 28%, #F6EBC8, #C9A33B 80%)'
                      : '#F3F1EC',
                    color: b.earned ? '#7A5E17' : C.ink3,
                    boxShadow: b.earned ? 'inset 0 1px 0 rgba(255,255,255,0.5)' : 'none',
                  }}>
                    {b.earned ? '✦' : '·'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: b.earned ? C.ink : C.ink2, fontFamily: FONT }}>
                      {b.label}
                    </p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: C.ink3, fontFamily: FONT }}>{b.desc}</p>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: b.earned ? C.goldDark : C.ink3, fontFamily: FONT }}>
                    {b.earned ? 'Earned' : `${b.value}/${b.target}`}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ margin: '12px 4px 0', fontSize: 11, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
              Every number here comes from verified sessions in this community. Nothing is
              scored, ranked, or carried between communities.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
