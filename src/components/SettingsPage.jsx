import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
  danger:    '#DC2626',
}

export default function SettingsPage({ onClose }) {
  const { user, profile, updateProfile, signOut, deleteAccount } = useAuth()

  const [name, setName]           = useState(profile?.name || '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [isAnon, setIsAnon]       = useState(profile?.is_anonymous ?? true)
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState(null) // {type:'ok'|'err', msg}
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSave = async () => {
    setSaving(true); setStatus(null)
    const { error } = await updateProfile({
      name: name.trim() || 'Anonymous',
      avatar_url: avatarUrl.trim() || null,
      is_anonymous: isAnon,
    })
    setSaving(false)
    setStatus(error
      ? { type: 'err', msg: error.message || 'Failed to save.' }
      : { type: 'ok', msg: 'Profile updated.' })
  }

  const handleSignOut = async () => {
    if (!window.confirm('Sign out?')) return
    await signOut()
  }

  const handleDelete = async () => {
    setDeleting(true); setStatus(null)
    const { error, partial } = await deleteAccount()
    setDeleting(false)
    if (error) {
      setStatus({ type: 'err', msg: error.message || 'Delete failed.' })
      setConfirmDel(false)
      return
    }
    if (partial) {
      alert('Your profile data was deleted and you have been signed out. Full account removal requires admin action — please contact support to fully delete your auth record.')
    }
    // signOut already called inside deleteAccount → AppRoot will swap to LoginScreen
  }

  const inputStyle = {
    background: '#FAFAFA',
    border: `1.5px solid ${C.border}`,
    color: C.text,
    outline: 'none',
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pt-5 pb-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, color: C.text }}>
            Settings
          </h1>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium"
            style={{ color: C.goldDark }}
          >
            Done
          </button>
        </div>

        {/* Profile card */}
        <section
          className="rounded-2xl p-5 mb-4"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <h2 className="text-xs uppercase tracking-wider mb-4" style={{ color: C.textMuted }}>
            Profile
          </h2>

          <label className="block text-xs mb-1" style={{ color: C.textSub }}>Display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anonymous"
            className="w-full rounded-xl px-4 py-3 text-sm mb-4"
            style={inputStyle}
          />

          <label className="block text-xs mb-1" style={{ color: C.textSub }}>Avatar URL (optional)</label>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-xl px-4 py-3 text-sm mb-4"
            style={inputStyle}
          />

          <label className="block text-xs mb-1" style={{ color: C.textSub }}>Email</label>
          <input
            value={user?.email || ''}
            readOnly
            className="w-full rounded-xl px-4 py-3 text-sm mb-4"
            style={{ ...inputStyle, color: C.textSub, cursor: 'not-allowed' }}
          />

          <label className="flex items-center justify-between py-2">
            <span className="text-sm" style={{ color: C.text }}>Anonymous mode</span>
            <input
              type="checkbox"
              checked={isAnon}
              onChange={(e) => setIsAnon(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: C.gold }}
            />
          </label>

          {status && (
            <p
              className="mt-3 text-center text-xs"
              style={{ color: status.type === 'ok' ? C.goldDark : C.danger }}
            >
              {status.msg}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-4 py-3 rounded-xl text-sm font-semibold active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              color: '#fff',
              border: 'none',
              opacity: saving ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(200,169,106,0.30)',
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </section>

        {/* Support */}
        <section
          className="rounded-2xl p-5 mb-4"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <h2 className="text-xs uppercase tracking-wider mb-4" style={{ color: C.textMuted }}>
            Support
          </h2>

          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98] flex items-center justify-center gap-2"
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
        </section>

        {/* Account actions */}
        <section
          className="rounded-2xl p-5"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <h2 className="text-xs uppercase tracking-wider mb-4" style={{ color: C.textMuted }}>
            Account
          </h2>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-3 rounded-xl text-sm font-semibold mb-3 active:scale-[0.98]"
            style={{
              background: C.white,
              color: C.goldDark,
              border: `1.5px solid ${C.goldLight}`,
            }}
          >
            Sign out
          </button>

          {!confirmDel ? (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98]"
              style={{
                background: C.white,
                color: C.danger,
                border: `1.5px solid ${C.danger}`,
              }}
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
                  style={{ background: C.white, color: C.text, border: `1px solid ${C.border}` }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                  style={{ background: C.danger, color: '#fff', border: 'none', opacity: deleting ? 0.6 : 1 }}
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          )}
        </section>
      </motion.div>

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
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
              </div>

              {/* Icon */}
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#FBF6EC', border: '1.5px solid #E6D3A3',
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

              {/* Email link */}
              <a
                href="mailto:erminelyu@gmail.com?subject=ReciRing%20Support%20Request"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98] flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  color: '#fff',
                  textDecoration: 'none',
                  display: 'flex',
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(200,169,106,0.30)',
                  marginBottom: 6,
                }}
              >
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send email
              </a>
              <p className="text-center" style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
                If your mail app doesn't open, copy the address below and email us manually.
              </p>

              {/* Copy email */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('erminelyu@gmail.com').then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  })
                }}
                className="w-full py-2.5 rounded-xl text-sm font-medium active:scale-[0.98] flex items-center justify-center gap-2"
                style={{
                  background: copied ? '#ECFDF5' : C.white,
                  color: copied ? '#059669' : C.goldDark,
                  border: `1.5px solid ${copied ? '#A7F3D0' : C.goldLight}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  marginBottom: 14,
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
                style={{
                  background: C.white,
                  color: C.textSub,
                  border: `1.5px solid ${C.border}`,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
