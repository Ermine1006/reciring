import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import AnonymousAvatar from './AnonymousAvatar'
import PRESET_AVATARS from '../data/presetAvatars'

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
}

/** Resolve a `preset:key` avatar_url → the seed for AnonymousAvatar. */
export function resolveAvatarSeed(avatarUrl) {
  if (!avatarUrl?.startsWith('preset:')) return null
  const key = avatarUrl.slice(7)
  return PRESET_AVATARS.find(a => a.key === key)?.seed ?? null
}

export default function SettingsPage({ onClose }) {
  const { user, profile, updateProfile, signOut, deleteAccount } = useAuth()

  const [name, setName]               = useState(profile?.name || '')
  const [selectedKey, setSelectedKey]  = useState(
    profile?.avatar_url?.startsWith('preset:') ? profile.avatar_url.slice(7) : null
  )
  const [saving, setSaving]     = useState(false)
  const [status, setStatus]     = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [copied, setCopied]         = useState(false)

  const selectedAvatar = PRESET_AVATARS.find(a => a.key === selectedKey)

  const handleSave = async () => {
    setSaving(true); setStatus(null)
    const { error } = await updateProfile({
      name: name.trim() || 'Anonymous',
      avatar_url: selectedKey ? `preset:${selectedKey}` : null,
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
      alert('Your profile data was deleted and you have been signed out. Full account removal requires admin action — please contact support.')
    }
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, color: C.text }}>
            My Profile
          </h1>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium"
            style={{ color: C.goldDark, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Done
          </button>
        </div>

        {/* ── Profile section ─────────────────────────────────── */}
        <section
          className="rounded-2xl p-5 mb-4"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <h2 className="text-xs uppercase tracking-wider mb-5" style={{ color: C.textMuted }}>
            Profile
          </h2>

          {/* Current avatar — large preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
            <div style={{
              borderRadius: '50%',
              border: `3px solid ${C.goldLight}`,
              boxShadow: '0 4px 20px rgba(200,169,106,0.25)',
              marginBottom: 8,
            }}>
              <AnonymousAvatar
                seed={selectedAvatar?.seed || profile?.id || 'default'}
                size={88}
              />
            </div>
            <p style={{ fontSize: 12, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {selectedAvatar?.label || 'Default'}
            </p>
          </div>

          {/* Avatar picker grid */}
          <div style={{ marginBottom: 24 }}>
            <p
              className="text-[11px] tracking-[0.14em] uppercase font-semibold mb-3"
              style={{ color: C.textSub }}
            >
              Choose avatar
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 10,
            }}>
              {PRESET_AVATARS.map((av) => {
                const isActive = av.key === selectedKey
                return (
                  <button
                    key={av.key}
                    type="button"
                    onClick={() => setSelectedKey(av.key)}
                    title={av.label}
                    style={{
                      padding: 0, background: 'none', cursor: 'pointer',
                      border: isActive ? `2.5px solid ${C.gold}` : '2.5px solid transparent',
                      borderRadius: '50%',
                      boxShadow: isActive ? `0 0 0 2px ${C.goldLight}, 0 4px 12px rgba(200,169,106,0.3)` : 'none',
                      transform: isActive ? 'scale(1.08)' : 'scale(1)',
                      transition: 'all 0.15s ease',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <AnonymousAvatar seed={av.seed} size={52} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Display name */}
          <label className="block text-xs mb-1.5" style={{ color: C.textSub, fontWeight: 500 }}>Display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anonymous"
            className="w-full rounded-xl px-4 py-3 text-sm mb-4"
            style={inputStyle}
          />

          {/* Email (read-only) */}
          <label className="block text-xs mb-1.5" style={{ color: C.textSub, fontWeight: 500 }}>Email</label>
          <input
            value={user?.email || ''}
            readOnly
            className="w-full rounded-xl px-4 py-3 text-sm"
            style={{ ...inputStyle, color: C.textMuted, cursor: 'not-allowed', background: '#F5F5F5' }}
          />

          {/* Status message */}
          {status && (
            <p
              className="mt-4 text-center text-xs"
              style={{ color: status.type === 'ok' ? '#16A34A' : C.danger }}
            >
              {status.msg}
            </p>
          )}

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-5 py-3 rounded-xl text-sm font-semibold active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              color: '#fff',
              border: 'none',
              opacity: saving ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(200,169,106,0.30)',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </section>

        {/* ── Account section ─────────────────────────────────── */}
        <section
          className="rounded-2xl p-5"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <h2 className="text-xs uppercase tracking-wider mb-4" style={{ color: C.textMuted }}>
            Account
          </h2>

          {/* Contact Support */}
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

          {/* Log out */}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-3 rounded-xl text-sm font-semibold mb-3 active:scale-[0.98]"
            style={{
              background: C.white,
              color: C.textSub,
              border: `1.5px solid ${C.border}`,
              cursor: 'pointer',
            }}
          >
            Log out
          </button>

          {/* Delete account */}
          {!confirmDel ? (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98]"
              style={{
                background: C.white,
                color: C.danger,
                border: `1.5px solid ${C.danger}`,
                cursor: 'pointer',
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
                href="mailto:erminelyu@gmail.com?subject=ReciRing%20Support%20Request"
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
    </div>
  )
}
