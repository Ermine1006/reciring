import { motion } from 'framer-motion'
import ReciRingLogo from './ReciRingLogo'

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

export default function EmailConfirmed({ onGoToLogin }) {
  return (
    <div
      className="w-full min-h-[100dvh] flex items-center justify-center px-6"
      style={{ background: '#EEE9E0' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%', maxWidth: 380,
          background: C.white,
          borderRadius: 28,
          padding: '44px 30px 36px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.10), 0 4px 16px rgba(200,169,106,0.12)',
          textAlign: 'center',
        }}
      >
        <div className="flex justify-center mb-6">
          <ReciRingLogo size={36} />
        </div>

        {/* Success icon */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#ECFDF5', border: '2px solid #A7F3D0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="28" height="28" fill="none" stroke="#16A34A" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1
          className="font-display mb-2"
          style={{ fontSize: 22, fontWeight: 600, color: C.text }}
        >
          Email confirmed
        </h1>
        <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, marginBottom: 28 }}>
          Your account is verified and ready to go.<br />
          Sign in with your email and password.
        </p>

        <button
          type="button"
          onClick={onGoToLogin}
          className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
            color: '#fff',
            boxShadow: '0 6px 20px rgba(200,169,106,0.35)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Go to sign in
        </button>
      </motion.div>
    </div>
  )
}
