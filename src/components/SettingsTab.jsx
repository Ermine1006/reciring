import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { setMyEmailSubscription } from '../lib/email'
import { isAdmin } from '../data/adminEmails'

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
  danger:    '#DC2626',
  success:   '#16A34A',
}

function Section({ title, children }) {
  return (
    <section
      className="rounded-2xl p-5 mb-4"
      style={{ background: C.white, border: `1px solid ${C.border}` }}
    >
      <h2 className="text-xs uppercase tracking-wider mb-5" style={{ color: C.textMuted }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * SettingsTab — app-level settings extracted from the old SettingsPage.
 * Lives inside ProfilePage's "Settings" sub-tab.
 *
 * Sections:
 *   - Email preferences (toggle + status, RLS-safe)
 *   - Admin (only for admin emails) — links to test-email page
 *   - Account (Contact Support, Log out, Delete account)
 *
 * Profile editing (display name, program, skills, etc.) lives in
 * SettingsPage which is now reused as the "My Profile" sub-tab.
 */
export default function SettingsTab({ onOpenAdminEmailTest }) {
  const { user, profile, signOut, deleteAccount } = useAuth()

  // Email subscription
  const [emailSubscribed, setEmailSubscribed] = useState(
    profile?.email_subscribed !== false,
  )
  const [emailToggleSaving, setEmailToggleSaving] = useState(false)
  const [emailToggleError, setEmailToggleError]   = useState(null)

  const handleEmailToggle = async () => {
    if (emailToggleSaving) return
    const next = !emailSubscribed
    setEmailSubscribed(next)
    setEmailToggleSaving(true)
    setEmailToggleError(null)
    const { error } = await setMyEmailSubscription(next)
    setEmailToggleSaving(false)
    if (error) {
      setEmailSubscribed(!next)
      setEmailToggleError(error.message || 'Could not update preference')
    }
  }

  // Account actions
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [delError, setDelError]     = useState(null)
  const [showSupport, setShowSupport] = useState(false)
  const [copied, setCopied]         = useState(false)

  const handleSignOut = async () => {
    if (!window.confirm('Sign out?')) return
    await signOut()
  }

  const handleDelete = async () => {
    setDeleting(true); setDelError(null)
    const { error, partial } = await deleteAccount()
    setDeleting(false)
    if (error) {
      setDelError(error.message || 'Delete failed.')
      setConfirmDel(false)
      return
    }
    if (partial) {
      alert('Your profile data was deleted and you have been signed out. Full account removal requires admin action — please contact support.')
    }
  }

  const userIsAdmin = isAdmin(user?.email)

  return (
    <>
      {/* ── Email Preferences ─────────────────────────────────── */}
      <Section title="Email Preferences">
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 14, fontWeight: 600, color: C.text,
              fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
            }}>
              Receive Mutu emails
            </p>
            <p style={{
              fontSize: 12, color: C.textMuted, lineHeight: 1.5,
              fontFamily: 'Inter, system-ui, sans-serif',
              margin: '4px 0 0',
            }}>
              Receive product updates, community announcements, new features, and event invitations.
            </p>
          </div>
          <button
            type="button"
            onClick={handleEmailToggle}
            disabled={emailToggleSaving}
            role="switch"
            aria-checked={emailSubscribed}
            aria-label="Receive Mutu emails"
            style={{
              flexShrink: 0,
              width: 52, height: 30,
              borderRadius: 99,
              border: 'none',
              background: emailSubscribed
                ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                : '#D1D5DB',
              position: 'relative',
              cursor: emailToggleSaving ? 'wait' : 'pointer',
              transition: 'background 0.2s ease',
              opacity: emailToggleSaving ? 0.7 : 1,
              boxShadow: emailSubscribed
                ? '0 2px 8px rgba(200,169,106,0.3)'
                : 'inset 0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3, left: emailSubscribed ? 25 : 3,
                width: 24, height: 24,
                borderRadius: '50%',
                background: C.white,
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                transition: 'left 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </button>
        </div>

        <p style={{
          fontSize: 11, color: C.textMuted, marginTop: 12,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          Current status:{' '}
          <span style={{
            fontWeight: 600,
            color: emailSubscribed ? C.success : C.danger,
          }}>
            {emailSubscribed ? 'Subscribed' : 'Unsubscribed'}
          </span>
        </p>

        {emailToggleError && (
          <p style={{ marginTop: 10, fontSize: 12, color: C.danger, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {emailToggleError}
          </p>
        )}

        {!emailSubscribed && (
          <p style={{
            marginTop: 12, padding: '10px 12px',
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
            fontSize: 12, color: '#92400E', lineHeight: 1.5,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            You're currently opted out of non-essential Mutu emails. Toggle on anytime to start receiving updates again — your unsubscribe record is updated automatically.
          </p>
        )}
      </Section>

      {/* ── Admin (only for admin emails) ─────────────────────── */}
      {userIsAdmin && (
        <Section title="Admin">
          <button
            type="button"
            onClick={onOpenAdminEmailTest}
            className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              background: C.goldBg,
              color: C.goldDark,
              border: `1.5px solid ${C.goldLight}`,
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email center
          </button>
          <p style={{
            fontSize: 11, color: C.textMuted, marginTop: 10, lineHeight: 1.5,
            fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center',
          }}>
            Compose broadcasts, send test emails, manage subscriptions.
          </p>
        </Section>
      )}

      {/* ── Account ──────────────────────────────────────────── */}
      <Section title="Account">
        <button
          type="button"
          onClick={() => setShowSupport(true)}
          className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98] flex items-center justify-center gap-2 mb-3"
          style={{
            background: C.white,
            color: C.goldDark,
            border: `1.5px solid ${C.goldLight}`,
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Contact Support
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full py-3 rounded-xl text-sm font-semibold mb-3 active:scale-[0.98]"
          style={{ background: C.white, color: C.textSub, border: `1.5px solid ${C.border}`, cursor: 'pointer' }}
        >
          Log out
        </button>

        {delError && (
          <p style={{
            fontSize: 12, color: C.danger, marginBottom: 10,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {delError}
          </p>
        )}

        {!confirmDel ? (
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98]"
            style={{ background: C.white, color: C.danger, border: `1.5px solid ${C.danger}`, cursor: 'pointer' }}
          >
            Delete account
          </button>
        ) : (
          <div
            className="rounded-xl p-3"
            style={{ background: '#FEF2F2', border: `1px solid ${C.danger}` }}
          >
            <p className="text-xs mb-3" style={{ color: C.danger, lineHeight: 1.5 }}>
              This will permanently delete your profile data and sign you out. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: C.white, color: C.text, border: `1px solid ${C.border}`, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: C.danger, color: '#fff', border: 'none', opacity: deleting ? 0.6 : 1, cursor: 'pointer' }}
              >
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* Support modal */}
      <AnimatePresence>
        {showSupport && (
          <>
            <motion.div
              key="support-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSupport(false)}
              style={{
                position: 'absolute', inset: 0, zIndex: 60,
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(4px)',
              }}
            />
            <motion.div
              key="support-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 61,
                background: C.white,
                borderRadius: '24px 24px 0 0',
                padding: '16px 24px 32px',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
              </div>

              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <svg width="22" height="22" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, textAlign: 'center', marginBottom: 6 }}>
                Contact Support
              </h3>
              <p style={{ fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
                Having trouble? Send us a note and we'll get back to you as soon as possible.
              </p>

              <a
                href="mailto:hello@muturing.com?subject=Mutu%20Support%20Request"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98] flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  color: '#fff', textDecoration: 'none', display: 'flex',
                  border: 'none', boxShadow: '0 4px 14px rgba(200,169,106,0.30)',
                  marginBottom: 6,
                }}
              >
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send email
              </a>
              <p className="text-center" style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
                If your mail app doesn't open, copy the address below.
              </p>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('hello@muturing.com').then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  })
                }}
                className="w-full py-2.5 rounded-xl text-sm font-medium active:scale-[0.98] flex items-center justify-center gap-2"
                style={{
                  background: copied ? '#ECFDF5' : C.white,
                  color: copied ? '#059669' : C.goldDark,
                  border: `1.5px solid ${copied ? '#A7F3D0' : C.goldLight}`,
                  cursor: 'pointer', transition: 'all 0.2s ease', marginBottom: 14,
                }}
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" fill="none" stroke="#059669" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copy email address
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowSupport(false)}
                className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98]"
                style={{ background: C.white, color: C.textSub, border: `1.5px solid ${C.border}`, cursor: 'pointer' }}
              >
                Close
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
