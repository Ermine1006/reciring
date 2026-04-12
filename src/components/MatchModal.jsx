import { motion, AnimatePresence } from 'framer-motion'

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

export default function MatchModal({ match, onClose, onConfirm, onSchedule }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0, scale: 0.96 }}
          animate={{ y: 0,  opacity: 1, scale: 1    }}
          exit={{    y: 40, opacity: 0, scale: 0.97  }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="w-full max-w-[360px] rounded-[28px] overflow-hidden"
          style={{
            background: C.white,
            boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(200,169,106,0.18)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────── */}
          <div
            className="px-7 pt-8 pb-7 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, #FBF6EC 0%, #FFFDF8 100%)',
              borderBottom: `1px solid ${C.goldLight}`,
            }}
          >
            {/* Decorative radial glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(200,169,106,0.14) 0%, transparent 68%)' }}
            />

            {/* Emoji with spring entrance */}
            <motion.div
              initial={{ scale: 0, rotate: -12 }}
              animate={{ scale: 1, rotate: 0   }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 220, damping: 16 }}
              className="text-[56px] mb-4 leading-none relative z-10"
            >
              🤝
            </motion.div>

            <h2 className="font-display text-[22px] font-semibold relative z-10" style={{ color: C.text }}>
              It's a match!
            </h2>

            {/* Gold ornamental divider */}
            <div className="mt-3 flex items-center justify-center gap-3 relative z-10">
              <div className="h-px w-10" style={{ background: `linear-gradient(90deg, transparent, ${C.goldLight})` }} />
              <p className="text-[9px] tracking-[0.28em] uppercase font-semibold" style={{ color: C.gold }}>
                mutual connection
              </p>
              <div className="h-px w-10" style={{ background: `linear-gradient(90deg, ${C.goldLight}, transparent)` }} />
            </div>
          </div>

          {/* ── Body ────────────────────────────────────────────── */}
          <div className="px-7 py-6">
            {/* Peer card */}
            <div
              className="flex items-center gap-3 rounded-[14px] px-4 py-3 mb-5"
              style={{ background: '#F9F7F4', border: '1px solid #F0ECE4' }}
            >
              <div
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold"
                style={{ background: C.goldBg, border: `1.5px solid ${C.goldLight}`, color: C.goldDark }}
              >
                RM
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: C.text }}>{match.peer}</p>
                <p className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>Ready to connect</p>
              </div>
            </div>

            {/* Pre-filled message preview */}
            <div
              className="rounded-[12px] px-4 py-3 mb-5"
              style={{ background: '#F9F7F4', border: '1px solid #F0ECE4' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5" style={{ color: C.gold }}>
                Quick intro message
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: C.textSub, fontStyle: 'italic' }}>
                "Hey! Happy to connect — want to do a quick coffee chat this week?"
              </p>
            </div>

            {/* Primary CTA — Schedule (recommended) */}
            <button
              type="button"
              onClick={() => onSchedule?.(match, 'coffee_chat')}
              className="w-full py-4 rounded-[16px] text-sm font-semibold tracking-[0.12em] uppercase transition-all duration-200 active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldDark} 100%)`,
                color: '#fff',
                boxShadow: '0 8px 24px rgba(200,169,106,0.35)',
              }}
            >
              ☕ Schedule coffee chat
            </button>
            <div className="mb-3" />

            {/* Secondary CTA — Send intro */}
            <button
              type="button"
              onClick={() => onConfirm?.(match, 'quick_intro')}
              className="w-full py-3.5 rounded-[16px] text-sm font-semibold tracking-[0.08em] transition-all duration-200 active:scale-[0.98]"
              style={{
                background: C.goldBg,
                border: `1.5px solid ${C.goldLight}`,
                color: C.goldDark,
              }}
            >
              Send quick intro
            </button>

            {/* Dismiss link */}
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-3 py-2 text-[12px] tracking-wide transition-opacity hover:opacity-60"
              style={{ color: C.textMuted }}
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
