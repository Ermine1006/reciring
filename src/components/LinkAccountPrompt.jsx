import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { isInstitutionalEmail } from '../config/auth'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#4B5563',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
}

const DISMISS_KEY = 'mutu:linkPromptDismissed'

/**
 * One-shot nudge that shows AFTER onboarding for institutional users
 * (UofT / Rotman) who haven't yet linked a Google account. Explains
 * that their school email may expire and offers to start the Google
 * linking flow now.
 *
 * Behavior:
 *   • Only shows when: signed-in institutional user + hasn't linked
 *     Google + hasn't dismissed the prompt on this device.
 *   • Dismissal persists in localStorage per-user so the modal never
 *     nags twice on the same account. Clearing storage or a new
 *     device brings it back — desirable, since a user might change
 *     their mind after finishing school.
 *   • Mounted at the AppShell level so it lifts above the tab bar.
 */
export default function LinkAccountPrompt() {
  const { user, listMyLinkedEmails, linkGoogleIdentity } = useAuth()

  const [checked, setChecked]   = useState(false)
  const [visible, setVisible]   = useState(false)
  const [linking, setLinking]   = useState(false)
  const [error, setError]       = useState(null)

  const email = user?.email || ''
  const isInstitutional = isInstitutionalEmail(email)
  const dismissKey = user ? `${DISMISS_KEY}:${user.id}` : DISMISS_KEY

  // Decide whether to show, once per mount. The linked-emails query
  // is cheap (single indexed lookup) and only runs for institutional
  // users so it doesn't add latency for the alumni / invited paths.
  useEffect(() => {
    if (!user || !isInstitutional) { setChecked(true); return }
    if (safeGet(dismissKey) === '1')      { setChecked(true); return }
    listMyLinkedEmails().then(({ data }) => {
      const alreadyLinked = (data || []).some(
        e => e.email_type === 'google' || e.email_type === 'personal'
      )
      setVisible(!alreadyLinked)
      setChecked(true)
    })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked || !visible) return null

  async function handleLink() {
    setLinking(true); setError(null)
    const { error: err } = await linkGoogleIdentity()
    setLinking(false)
    if (err) setError(err.message || 'Could not start the linking flow.')
    // On success the browser redirects to Google — no need to setVisible.
  }

  function handleDefer() {
    safeSet(dismissKey, '1')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(17,17,17,0.45)', backdropFilter: 'blur(4px)',
        }}
      />
      <motion.div
        key="card"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 61,
          width: 'calc(100% - 32px)', maxWidth: 360,
          background: C.white, borderRadius: 24,
          padding: '28px 24px 22px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(200,169,106,0.18)',
        }}
      >
        {/* Gold cap on the icon */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `linear-gradient(135deg, ${C.goldBg}, ${C.goldLight})`,
          border: `1.5px solid ${C.gold}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: 26, color: C.goldDark,
        }}>
          🎓
        </div>

        <h3 style={{
          textAlign: 'center', fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 18, fontWeight: 600, color: C.text,
          margin: '0 0 6px',
        }}>
          Keep access after graduation
        </h3>
        <p style={{
          textAlign: 'center', fontSize: 13, color: C.textSub,
          lineHeight: 1.55, fontFamily: 'Inter, system-ui, sans-serif',
          margin: '0 0 20px',
        }}>
          Your school email may expire after graduation. Link a personal email or Google account so you can continue using Mutu as an alumni member.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={handleLink}
            disabled={linking}
            style={{
              width: '100%', padding: '13px 16px',
              borderRadius: 14, border: 'none',
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              color: '#fff', fontSize: 14, fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: linking ? 'default' : 'pointer',
              boxShadow: '0 6px 18px rgba(200,169,106,0.32)',
              opacity: linking ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
            </svg>
            {linking ? 'Redirecting…' : 'Link Google account'}
          </button>
          <button
            type="button"
            onClick={handleDefer}
            style={{
              width: '100%', padding: '10px 16px',
              background: 'transparent', border: 'none',
              color: C.textMuted, fontSize: 13, fontWeight: 500,
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: 'pointer',
            }}
          >
            I'll do this later
          </button>
        </div>

        {error && (
          <p style={{
            marginTop: 12, textAlign: 'center', fontSize: 12, color: '#DC2626',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {error}
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

// localStorage wrappers — SecurityError-safe for private browsing.
function safeGet(k) { try { return window.localStorage.getItem(k) } catch { return null } }
function safeSet(k, v) { try { window.localStorage.setItem(k, v) } catch {} }
