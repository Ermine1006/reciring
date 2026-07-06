import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
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

/**
 * ResetPasswordPage — dedicated route rendered at /reset-password.
 *
 * Detects itself entirely via URL, not via Supabase's PASSWORD_RECOVERY
 * event. The event fires reliably on the legacy hash flow but not
 * always on the newer PKCE flow (URL uses ?code=… in query, not
 * #type=recovery in hash), which is what broke the last version. The
 * route-based approach is deterministic.
 *
 * Flow:
 *   1. Supabase sends the reset email with a link back to
 *      https://<origin>/reset-password?code=... (PKCE) or
 *      https://<origin>/reset-password#access_token=…&type=recovery (hash)
 *   2. Vercel SPA rewrite serves index.html; we mount, the Supabase
 *      client handles the code exchange OR the hash session, and the
 *      user has a session to updateUser({ password }) against.
 *   3. On success, we clear the URL (query + hash) and route to /
 *      showing "Password updated" then the login page.
 */
export default function ResetPasswordPage() {
  const { updatePassword, session } = useAuth()

  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [success, setSuccess]           = useState(false)

  // If the user opened /reset-password directly with no recovery
  // context (no code in query, no tokens in hash, no session), the
  // reset can't succeed. Surface it up front rather than after a
  // failed submit.
  const hasRecoveryContext =
    Boolean(session)
    || new URLSearchParams(window.location.search).has('code')
    || window.location.hash.includes('access_token=')
    || window.location.hash.includes('type=recovery')

  const canSubmit =
    !loading
    && password.length >= 6
    && password === confirm

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.'); return
    }
    if (password !== confirm) {
      setError('Passwords do not match.'); return
    }

    setLoading(true)
    const { error: err } = await updatePassword(password)
    setLoading(false)
    if (err) {
      // Common error: "Auth session missing" — the recovery link was
      // consumed already or the session expired. Show something the
      // user can act on.
      const msg = /session/i.test(err.message)
        ? 'Reset link expired or already used. Request a fresh one from the login page.'
        : (err.message || 'Could not update password.')
      setError(msg)
      return
    }
    setSuccess(true)
    // Clear any lingering recovery tokens from the URL so a reload
    // doesn't re-enter the flow with a stale session.
    window.history.replaceState({}, '', '/')
  }

  // Auto-return to login 3s after success so the user isn't stuck on
  // the confirmation screen.
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => { window.location.href = '/' }, 3000)
    return () => clearTimeout(t)
  }, [success])

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
          {success ? 'Password updated' : 'Set a new password'}
        </h1>
        <p className="text-center mb-6" style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
          {success
            ? 'You can now sign in with your new password. Redirecting…'
            : 'Choose a new password of at least 6 characters.'}
        </p>

        {success ? (
          <button
            type="button"
            onClick={() => { window.location.href = '/' }}
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
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
              autoFocus
              autoComplete="new-password"
              className="w-full rounded-xl px-4 py-3 text-sm mb-3 transition-all duration-200"
              style={{
                background: '#FAFAFA',
                border: `1.5px solid ${error ? '#EF4444' : C.border}`,
                color: C.text, outline: 'none',
              }}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full rounded-xl px-4 py-3 text-sm transition-all duration-200"
              style={{
                background: '#FAFAFA',
                border: `1.5px solid ${error ? '#EF4444' : C.border}`,
                color: C.text, outline: 'none',
              }}
            />

            {!hasRecoveryContext && (
              <p className="mt-3 text-center" style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                No active reset session detected. If you got here from an email link and see this,
                request a fresh reset from the login page.
              </p>
            )}

            {error && (
              <p className="mt-3 text-center" style={{ fontSize: 12, color: '#EF4444', lineHeight: 1.5 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98] mt-5"
              style={{
                background: canSubmit ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : '#E5E7EB',
                color: canSubmit ? '#fff' : C.textMuted,
                boxShadow: canSubmit ? '0 6px 20px rgba(200,169,106,0.35)' : 'none',
                border: 'none',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Saving…' : 'Save new password'}
            </button>

            <button
              type="button"
              onClick={() => { window.location.href = '/' }}
              className="w-full py-2.5 rounded-xl text-sm font-medium mt-1"
              style={{ background: 'transparent', border: 'none', color: C.textSub, cursor: 'pointer' }}
            >
              ← Back to sign in
            </button>
          </form>
        )}
      </motion.div>
    </div>
  )
}
