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
  const { signIn, signUp, signInWithGoogle } = useAuth()

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
            placeholder="your@email.com"
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

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            {/* Google OAuth */}
            <button
              type="button"
              onClick={async () => {
                setError(null); setInfo(null); setLoading(true)
                const { error: oauthErr } = await signInWithGoogle()
                setLoading(false)
                if (oauthErr) setError(oauthErr.message)
              }}
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2.5"
              style={{
                background: C.white,
                color: C.text,
                border: `1.5px solid ${C.border}`,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
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
