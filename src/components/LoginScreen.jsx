import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { isInstitutionalEmail, isGmailEmail } from '../config/auth'
import { checkInviteByEmail, checkInviteByCode, inviteReasonLabel } from '../lib/invites'
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

// Support email surfaced in the Forgot-email helper. Kept next to the
// gold token so future tweaks stay in one place.
const SUPPORT_EMAIL = 'hello@muturing.com'

export default function LoginScreen() {
  const {
    signIn, signUp, signInWithGoogle, resetPassword,
    accessDenied, clearAccessDenied,
  } = useAuth()

  // 'signin' → default; 'forgot' → email-only reset form.
  // The set-new-password step lives on the dedicated /reset-password
  // route (ResetPasswordPage) — routing there is deterministic and
  // doesn't rely on the PASSWORD_RECOVERY event, which was the source
  // of the bug where the reset link opened the login page instead.
  const [mode, setMode]         = useState('signin')

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [info, setInfo]         = useState(null)
  const [showForgotEmail, setShowForgotEmail] = useState(false)

  const emailLower = email.trim().toLowerCase()
  const isGmail          = isGmailEmail(emailLower)
  const isInstitutional  = isInstitutionalEmail(emailLower)

  // If the user was bounced out by the post-signin gate, hydrate the
  // error banner from the context flag once and clear it so subsequent
  // attempts don't keep showing a stale message.
  useEffect(() => {
    if (accessDenied) {
      setError(accessDenied)
      clearAccessDenied()
    }
  }, [accessDenied]) // eslint-disable-line react-hooks/exhaustive-deps

  const handle = async (mode) => {
    setError(null)
    setInfo(null)

    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !password) {
      setError('Email and password required.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    // Domain gate. Institutional → straight through; Gmail → need a
    // valid invite (by email OR by code the user typed here); anything
    // else → blocked outright.
    if (!isInstitutional && !isGmail) {
      setError("This email domain isn't supported. Please use your UofT email, or ask an admin to invite you.")
      return
    }

    if (isGmail) {
      setLoading(true)
      const gate = await checkGmailInvite(trimmed, inviteCode)
      if (!gate.ok) {
        setLoading(false)
        setError(gate.reason)
        return
      }
      // Stash the code so the post-signin gate in AuthContext can
      // redeem it (it also re-validates server-side). This handles the
      // race where two clients try to redeem the same code — only one
      // will land, and the other gets a fresh error at that stage.
      if (gate.stashCode) safeStashSession('mutu:pendingInviteCode', gate.stashCode)
      setLoading(false)
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

  // Reused for both password + OAuth paths. Returns:
  //   { ok: true, stashCode: string | null }
  //   { ok: false, reason: string }
  async function checkGmailInvite(emailAddr, code) {
    // Pre-issued email invite → no code required.
    const byEmail = await checkInviteByEmail(emailAddr)
    if (byEmail.invite) return { ok: true, stashCode: null }
    if (byEmail.reason) return { ok: false, reason: inviteReasonLabel(byEmail.reason) }

    // Fall back to the code the user typed.
    const trimmedCode = String(code || '').trim()
    if (!trimmedCode) {
      return {
        ok: false,
        reason: 'Mutu is currently invite-only for Gmail accounts. Enter your invite code above, or use your UofT email.',
      }
    }
    const byCode = await checkInviteByCode(emailAddr, trimmedCode)
    if (byCode.invite) return { ok: true, stashCode: trimmedCode }
    return { ok: false, reason: inviteReasonLabel(byCode.reason || 'invite_not_found') }
  }

  // sessionStorage stash used to bridge the invite code across the
  // Google OAuth redirect. Same helper as in AuthContext — wrapped so
  // a private-browsing SecurityError doesn't crash the flow.
  function safeStashSession(key, value) {
    try { if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value) }
    catch {}
  }

  // ── Forgot password: send the reset email ─────────────────
  const handleForgotSubmit = async () => {
    setError(null); setInfo(null)
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) { setError('Enter your email above.'); return }
    // Reset links go to whoever owns the address, so keep this permissive
    // — the invite gate re-validates on the following sign-in.
    if (!isInstitutional && !isGmail) {
      setError("This email domain isn't supported. Please use your UofT email, or ask an admin to invite you.")
      return
    }
    setLoading(true)
    const { error: err } = await resetPassword(trimmed)
    setLoading(false)
    // Neutral confirmation regardless of whether the address exists —
    // never leak account existence via the reset flow.
    if (err && !/rate/i.test(err.message)) console.warn('[ReciRing] reset password error:', err.message)
    setInfo("If an account exists, we'll send you a reset link. Check your inbox.")
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
          {mode === 'forgot' ? 'Reset your password' : 'Welcome to Mutu'}
        </h1>
        <p className="text-center mb-6" style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
          {mode === 'forgot'
            ? "Enter your email and we'll send you a reset link."
            : 'Use your UofT email to sign up directly. Gmail login is available by invitation only.'}
        </p>

        <form onSubmit={(e) => {
          e.preventDefault()
          if (mode === 'forgot') return handleForgotSubmit()
          return handle('signin')
        }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.name@mail.utoronto.ca"
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-sm mb-3 transition-all duration-200"
            style={inputStyle(!!error)}
          />

          {mode === 'signin' && (
            <>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200"
                style={inputStyle(!!error)}
              />
              {/* Invite code — only shown when the email is Gmail-family.
                  Empty by default; users with a pre-issued email invite
                  can leave it blank and still sign in. */}
              {isGmail && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Invite code (optional if you were pre-invited)"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200"
                    style={{
                      background: '#FBF6EC',
                      border: `1.5px solid ${C.goldLight}`,
                      color: C.text,
                      outline: 'none',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      letterSpacing: '0.04em',
                    }}
                  />
                  <p className="mt-1.5" style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                    Gmail login is invite-only. Ask an admin for a code, or use your UofT email.
                  </p>
                </div>
              )}
              {/* Forgot password link */}
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); setInfo(null) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, color: C.goldDark,
                    padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              </div>
            </>
          )}

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
            {mode === 'signin' && (
              <>
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

                {/* Google OAuth — sign up or sign in.
                    If the email field already has a Gmail address, we
                    pre-validate the invite here so the user doesn't
                    round-trip through Google's consent screen only to
                    be kicked back out. If the field is blank, we let
                    them through and the post-signin gate catches any
                    unauthorized Google account after the callback. */}
                <button
                  type="button"
                  onClick={async () => {
                    setError(null); setInfo(null)
                    if (emailLower && isGmail) {
                      setLoading(true)
                      const gate = await checkGmailInvite(emailLower, inviteCode)
                      if (!gate.ok) {
                        setLoading(false)
                        setError(gate.reason)
                        return
                      }
                      if (gate.stashCode) safeStashSession('mutu:pendingInviteCode', gate.stashCode)
                    }
                    setLoading(true)
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
              </>
            )}

            {mode === 'forgot' && (
              <>
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
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(null); setInfo(null) }}
                  className="w-full py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'transparent', border: 'none', color: C.textSub, cursor: 'pointer' }}
                >
                  ← Back to sign in
                </button>
              </>
            )}

          </div>
        </form>

        {/* Forgot email — signin only. Toggles a small helper card. */}
        {mode === 'signin' && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowForgotEmail(v => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, color: C.textSub, padding: 0,
              }}
            >
              {showForgotEmail ? 'Hide help' : 'Forgot email?'}
            </button>
            {showForgotEmail && (
              <div style={{
                marginTop: 10,
                padding: '12px 14px',
                borderRadius: 12,
                background: C.goldBg,
                border: `1px solid ${C.goldLight}`,
                textAlign: 'left',
                fontSize: 12, lineHeight: 1.55, color: C.text,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                <p style={{ margin: '0 0 6px', fontWeight: 600, color: C.goldDark }}>
                  Mutu uses your email as your username.
                </p>
                <p style={{ margin: 0, color: C.textSub }}>
                  Try your UofT email first — most members use{' '}
                  <span style={{ color: C.text, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>@mail.utoronto.ca</span>
                  {' '}or{' '}
                  <span style={{ color: C.text, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>@rotman.utoronto.ca</span>.
                  Still stuck? Email{' '}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    style={{ color: C.goldDark, textDecoration: 'underline' }}
                  >
                    {SUPPORT_EMAIL}
                  </a>.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-center mt-6" style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
          By continuing, you agree to stay anonymous to peers until you choose to reveal your name.
        </p>

      </motion.div>
    </div>
  )
}
