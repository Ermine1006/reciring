import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { isAllowedEmail, ALLOWED_EMAIL_DOMAIN } from '../config/auth'
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
  border:    '#E5E7EB',
}

export default function LoginScreen() {
  const { signIn, signUp } = useAuth()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [info, setInfo]         = useState(null)

  const handle = async (mode) => {
    setError(null)
    setInfo(null)

    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !password) {
      setError('Email and password required.')
      return
    }
    if (!isAllowedEmail(trimmed)) {
      setError(`Please use your ${ALLOWED_EMAIL_DOMAIN} email.`)
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const fn = mode === 'signup' ? signUp : signIn
    const { data, error: authError } = await fn(trimmed, password)
    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }
    // If email confirmation is enabled, signUp returns a user but no session
    if (mode === 'signup' && !data?.session) {
      setInfo('Check your email to confirm your account, then sign in.')
    }
  }

  const inputStyle = (hasError) => ({
    background: '#FAFAFA',
    border: `1.5px solid ${hasError ? '#EF4444' : C.border}`,
    color: C.text,
    outline: 'none',
  })

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
        }}
      >
        <div className="flex justify-center mb-6">
          <ReciRingLogo size={36} />
        </div>

        <h1
          className="text-center font-display mb-2"
          style={{ fontSize: 22, fontWeight: 600, color: C.text }}
        >
          Welcome to ReciRing
        </h1>
        <p className="text-center mb-6" style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
          Sign in or create your account.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); handle('signin') }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ALLOWED_EMAIL_DOMAIN ? `you@${ALLOWED_EMAIL_DOMAIN}` : 'your@email.com'}
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-sm mb-3 transition-all duration-200"
            style={inputStyle(!!error)}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 characters)"
            className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200"
            style={inputStyle(!!error)}
          />

          {error && (
            <p className="mt-3 text-center" style={{ fontSize: 12, color: '#EF4444' }}>
              {error}
            </p>
          )}
          {info && (
            <p className="mt-3 text-center" style={{ fontSize: 12, color: C.goldDark }}>
              {info}
            </p>
          )}

          <div className="flex flex-col gap-2 mt-5">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                color: '#fff',
                boxShadow: '0 6px 20px rgba(200,169,106,0.35)',
                border: 'none',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Please wait…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => handle('signup')}
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
              style={{
                background: C.white,
                color: C.goldDark,
                border: `1.5px solid ${C.goldLight}`,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              Sign up
            </button>
          </div>
        </form>

        <p className="text-center mt-6" style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
          By continuing, you agree to stay anonymous to peers until you choose to reveal your name.
        </p>
      </motion.div>
    </div>
  )
}
