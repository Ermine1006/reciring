import { motion, AnimatePresence } from 'framer-motion'
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
  border:    '#E5E7EB',
}

export default function NewMatchModal({ open, match, onView, onDismiss }) {
  return (
    <AnimatePresence>
      {open && match && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(17,17,17,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={onDismiss}
        >
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 340,
              background: C.white,
              borderRadius: 28,
              padding: '32px 26px 24px',
              boxShadow: '0 24px 70px rgba(0,0,0,0.22), 0 4px 16px rgba(200,169,106,0.18)',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            {/* Confetti accent */}
            <div
              style={{
                position: 'absolute',
                top: -18,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 40,
                filter: 'drop-shadow(0 4px 10px rgba(200,169,106,0.35))',
              }}
            >
              🎉
            </div>

            {/* Avatar */}
            <div className="flex justify-center mt-3 mb-4">
              <div
                style={{
                  padding: 3,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
                }}
              >
                <div style={{ background: C.white, borderRadius: '50%', padding: 2 }}>
                  <AnonymousAvatar seed={match.peerId || match.id} size={72} />
                </div>
              </div>
            </div>

            <h2
              className="font-display"
              style={{ fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 6 }}
            >
              You have a new match
            </h2>
            <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5, marginBottom: 22 }}>
              Someone just picked up your request. Say hello to start the exchange.
            </p>

            {match.request?.needs && (
              <div
                style={{
                  background: C.goldBg,
                  border: `1px solid ${C.goldLight}`,
                  borderRadius: 14,
                  padding: '10px 14px',
                  marginBottom: 22,
                  fontSize: 12,
                  color: C.goldDark,
                  lineHeight: 1.45,
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Your request
                </div>
                <div style={{ color: C.text, fontWeight: 500 }}>
                  {String(match.request.needs).slice(0, 110)}
                  {match.request.needs.length > 110 ? '…' : ''}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={onView}
                className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 6px 20px rgba(200,169,106,0.38)',
                  cursor: 'pointer',
                }}
              >
                View match
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  background: 'transparent',
                  color: C.textSub,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
