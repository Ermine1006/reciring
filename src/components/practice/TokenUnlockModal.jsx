import { motion, AnimatePresence } from 'framer-motion'
import { MATCHA_DEEP } from '../../lib/matchaCta'

// The mutual-verification reward moment: restrained white/gold/matcha.
// Shows +1 Mutu Token, the running total, the strengthened
// relationship, and ONE quiet "Practise again" action. Never shown
// for browsing, invitations, RSVPs, or one-sided completion — and
// never interrupted by unrelated recommendations.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

function RingsToken({ size = 92 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', margin: '0 auto',
      display: 'grid', placeItems: 'center',
      background: 'radial-gradient(circle at 32% 28%, #F6EBC8 0%, #E8D9A7 34%, #C9A33B 78%, #A6822A 100%)',
      boxShadow: '0 8px 26px rgba(166,130,42,0.35), inset 0 1.5px 0 rgba(255,255,255,0.55), inset 0 -2px 6px rgba(122,94,23,0.35)',
    }}>
      <svg width={size * 0.56} height={size * 0.4} viewBox="0 0 44 32" fill="none">
        <circle cx="15" cy="16" r="11" stroke="#7A5E17" strokeWidth="2.8" />
        <circle cx="29" cy="16" r="11" stroke="#FFFDF5" strokeWidth="2.8" opacity="0.92" />
      </svg>
    </div>
  )
}

export default function TokenUnlockModal({ open, partnerName = 'your partner', verifiedCount, onPractiseAgain, onSendThanks, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(24,22,15,0.45)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 340, background: C.white, borderRadius: 24,
              border: `1px solid ${C.goldLight}`, padding: '30px 24px 20px',
              textAlign: 'center', boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
            }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 220, damping: 14 }}
            >
              <RingsToken />
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              style={{ margin: '16px 0 2px', fontSize: 15, fontWeight: 800, color: C.goldDark, fontFamily: FONT, letterSpacing: '0.02em' }}
            >
              +1 Mutu Token
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              style={{ margin: 0, fontSize: 13.5, color: C.ink, fontFamily: FONT, lineHeight: 1.5 }}
            >
              You and {partnerName} both showed up and helped each other.
              This Token is shared. It lives in both of your histories.
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              style={{ margin: '8px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}
            >
              {typeof verifiedCount === 'number' && (
                <>Verified sessions: <strong style={{ color: C.goldDark }}>{verifiedCount}</strong> · </>
              )}
              Your connection with {partnerName} just grew stronger.
            </motion.p>

            {onPractiseAgain && (
              <motion.button
                type="button"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                onClick={onPractiseAgain}
                style={{
                  marginTop: 16, width: '100%', border: `1px solid ${C.goldLight}`,
                  background: C.goldBg, color: C.goldDark, borderRadius: 12,
                  padding: '10px 0', fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                }}
              >
                Practise again
              </motion.button>
            )}

            {/* Optional, quiet, private — never a rating or a requirement. */}
            {onSendThanks && (
              <motion.button
                type="button"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
                onClick={onSendThanks}
                style={{
                  marginTop: 8, border: 'none', background: 'none', padding: 2,
                  fontSize: 12.5, fontWeight: 650, color: C.ink2, fontFamily: FONT,
                  cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                Send a thank-you
              </motion.button>
            )}

            <button
              type="button" onClick={onClose}
              style={{
                marginTop: 10, width: '100%', border: 'none', borderRadius: 12,
                padding: '11px 0', fontSize: 13, fontWeight: 700, fontFamily: FONT,
                background: MATCHA_DEEP, color: '#fff', cursor: 'pointer',
              }}
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
