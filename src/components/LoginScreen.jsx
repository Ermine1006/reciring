import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { isInstitutionalEmail, isGmailEmail } from '../config/auth'
import { checkAccessCode, accessCodeReasonLabel } from '../lib/accessCodes'
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

  // 'signin' (default) | 'signup' | 'forgot'.
  //   • signin/signup toggle via the pill tab at the top of the form.
  //   • forgot is entered via the "Forgot password?" link; the
  //     set-new-password step lives on the dedicated /reset-password
  //     route (ResetPasswordPage) — routing there is deterministic
  //     and doesn't rely on the PASSWORD_RECOVERY event, which was
  //     the source of the bug where the reset link opened the login
  //     page instead.
  const [mode, setMode]         = useState('signin')

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  // Access code = invite OR referral. Single input, both types are
  // validated against the same access_codes table (see
  // src/lib/accessCodes.js).
  const [accessCode, setAccessCode] = useState('')
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

  // On mount, look for ?error=invite_required in the URL. AuthContext
  // writes this when it kicks a Gmail user out post-OAuth, so a hard
  // reload after the reject still shows the banner. Clean the URL
  // after reading so the message doesn't stick across navigation.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('error')
      if (code === 'invite_required' || code === 'gmail_requires_invite_or_referral') {
        setError('Gmail login requires an invite code or a referral from an existing Mutu member.')
        params.delete('error')
        const remaining = params.toString()
        const cleaned = window.location.pathname + (remaining ? `?${remaining}` : '')
        window.history.replaceState({}, '', cleaned)
      } else if (code === 'unsupported_domain' || code === 'unsupported_email') {
        setError("This email isn't eligible for Mutu yet. Sign up with your UofT email, or use an invite or referral code.")
        params.delete('error')
        const remaining = params.toString()
        const cleaned = window.location.pathname + (remaining ? `?${remaining}` : '')
        window.history.replaceState({}, '', cleaned)
      }
    } catch {}
  }, [])

  // Sign in / Create account submit. Reads `mode` from state so the
  // signature stays clean — no parameter overriding the state name.
  //
  // Sign in: any email is allowed at this stage; Supabase is the
  //   authority on whether credentials are valid. When it returns the
  //   default "Invalid login credentials" message we remap to a copy
  //   that hints at the "account doesn't exist yet" case, which is
  //   what most first-time users actually hit.
  //
  // Create account: institutional-only. Gmail users belong to the
  //   OAuth flow in Section 2 (invite code / referral / linked); the
  //   password signup path enforces UofT/Rotman up front so we don't
  //   spawn phantom Supabase auth users on Gmail addresses that will
  //   never redeem an invite.
  const handleSubmit = async () => {
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

    if (mode === 'signup') {
      // Institutional-only. Gmail users use Section 2 (Google OAuth
      // with invite/referral). Personal domains aren't supported for
      // signup at all right now.
      if (!isInstitutional) {
        if (isGmail) {
          setError('Use your UofT email to create an account here, or continue with Google below (with an invite or referral code if you\'re new).')
        } else {
          setError("This email isn't eligible for Mutu. Use your UofT email (@utoronto.ca, @mail.utoronto.ca, @rotman.utoronto.ca, or @alum.utoronto.ca).")
        }
        return
      }

      setLoading(true)
      const { data, error: authError } = await signUp(trimmed, password)
      setLoading(false)

      if (authError) {
        // Common signup errors: "User already registered" (they meant
        // to sign in), rate limit, weak password. Pass Supabase's
        // message through — it's usually specific enough.
        if (/already.*registered|already.*exists/i.test(authError.message || '')) {
          setError("An account with this email already exists. Switch to Sign in above.")
        } else {
          setError(authError.message)
        }
        return
      }
      // Supabase returns a user object but no session when email
      // confirmation is required in project settings.
      if (!data?.session) {
        setInfo('Check your UofT email to confirm your account, then sign in.')
      }
      return
    }

    // mode === 'signin'
    setLoading(true)
    const { data, error: authError } = await signIn(trimmed, password)
    setLoading(false)

    if (authError) {
      const msg = String(authError.message || '')
      // Remap the notorious "Invalid login credentials" default so
      // brand-new users understand they need to create an account
      // first. Wrong-password gets the same copy; the tab toggle
      // right above the field makes the fix one click away.
      if (/invalid.*credentials|invalid.*login/i.test(msg)) {
        setError('Email or password is incorrect. If you are new to Mutu, click "Create account" above.')
      } else if (/email.*not.*confirmed/i.test(msg)) {
        setError('Confirm your account first — check your inbox for the Mutu confirmation email.')
      } else {
        setError(msg)
      }
    }
  }

  // sessionStorage stash used to bridge the access code across the
  // Google OAuth redirect. Same helper as in AuthContext — wrapped so
  // a private-browsing SecurityError doesn't crash the flow.
  function safeStashSession(key, value) {
    try { if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value) }
    catch {}
  }
  function safeClearStash(key) {
    try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(key) }
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
      setError("This email isn't eligible for Mutu yet. Sign up with your UofT email, or use an invite or referral code.")
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
      className="safe-screen w-full min-h-[100dvh] flex items-center justify-center px-6"
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
            : 'Use your UofT email to join directly. Already verified members can continue with their linked Google account. New Gmail users need an invite code or a referral from an existing member.'}
        </p>

        {/* Sign in / Create account pill toggle — swaps the submit
            button copy and the underlying Supabase call. Only shown
            outside forgot mode. */}
        {mode !== 'forgot' && (
          <div
            role="tablist"
            className="mb-4 flex rounded-xl overflow-hidden"
            style={{ background: '#F5F0E5', padding: 3, gap: 2 }}
          >
            {[
              { id: 'signin', label: 'Sign in' },
              { id: 'signup', label: 'Create account' },
            ].map(t => {
              const active = mode === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setMode(t.id); setError(null); setInfo(null) }}
                  className="flex-1 py-2 text-xs font-semibold tracking-wide rounded-lg"
                  style={{
                    background: active ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : 'transparent',
                    color: active ? '#fff' : C.textSub,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: active ? '0 2px 6px rgba(200,169,106,0.28)' : 'none',
                    transition: 'all 0.18s',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        <form onSubmit={(e) => {
          e.preventDefault()
          if (mode === 'forgot') return handleForgotSubmit()
          return handleSubmit()
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

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200"
                style={inputStyle(!!error)}
              />
              {/* Forgot password link — sign-in mode only. */}
              {mode === 'signin' && (
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
              )}
              {/* Signup-mode helper: emphasize institutional-only. */}
              {mode === 'signup' && (
                <p className="mt-2" style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                  Password signup is for UofT / Rotman emails. Gmail users, use "Continue with Google" below (with an invite or referral code if you're new).
                </p>
              )}
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
            {(mode === 'signin' || mode === 'signup') && (
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
                  {loading
                    ? 'Please wait…'
                    : (mode === 'signup' ? 'Create account' : 'Sign in')}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-1">
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>or</span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>

                {/* Section 2 — Google login. Two audiences share this
                    button: (a) existing linked members (no code needed;
                    the post-OAuth gate finds their linked email), and
                    (b) new Gmail users with an invite or referral code
                    (typed into the input above the button). */}
                <p className="text-center" style={{
                  fontSize: 13, fontWeight: 600, color: C.text,
                  margin: '4px 0 6px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  New to Mutu with Gmail?
                </p>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter invite or referral code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="w-full rounded-xl px-4 py-3 text-sm mb-1"
                  style={{
                    background: '#FBF6EC',
                    border: `1.5px solid ${C.goldLight}`,
                    color: C.text,
                    outline: 'none',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    letterSpacing: '0.04em',
                  }}
                />

                {/* Google OAuth. We do NOT block on an empty code here
                    — existing linked members need to sign in without
                    entering anything. If a code IS provided, stash it
                    so the post-OAuth gate redeems it; the code is
                    re-validated server-side via redeem_access_code, so
                    the client stash is not a security boundary. */}
                <button
                  type="button"
                  onClick={async () => {
                    setError(null); setInfo(null)
                    const trimmedCode = accessCode.trim()
                    if (trimmedCode) {
                      // Cheap client-side pre-check gives a fast reject on
                      // typo'd codes so the user doesn't sit through Google
                      // consent. The RPC re-validates on the callback.
                      const check = await checkAccessCode(trimmedCode)
                      if (!check.code) {
                        setError(accessCodeReasonLabel(check.reason || 'code_not_found'))
                        return
                      }
                      safeStashSession('mutu_access_code', trimmedCode)
                    } else {
                      // Clear any stale code so a previous test doesn't
                      // leak into this attempt.
                      safeClearStash('mutu_access_code')
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
                <p className="text-center" style={{
                  fontSize: 11, color: C.textMuted, lineHeight: 1.5,
                  margin: '4px 0 0',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  Already linked your Google account? Continue with Google without a code.
                </p>
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
