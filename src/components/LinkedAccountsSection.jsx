import { useEffect, useState } from 'react'
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
  ok:        '#059669',
  okBg:      '#ECFDF5',
  okBorder:  '#A7F3D0',
  danger:    '#DC2626',
  amber:     '#B45309',
  amberBg:   '#FEF3C7',
}

/**
 * LinkedAccountsSection — Settings block for managing the personal
 * emails a member has linked to their Mutu account. Two purposes:
 *
 *   1. Alumni continuity — the primary reason. A UofT student links a
 *      Gmail while still on campus; when their school email dies at
 *      graduation, they sign in with Gmail and land on the same
 *      account.
 *
 *   2. Recovery — a second verified email means the auth reset path
 *      still works if the primary address disappears.
 *
 * The "Link Google account" button kicks off Supabase's linkIdentity
 * flow; the user picks a Google account, comes back via /?linked=google,
 * and their Google identity is attached to the current auth user. On
 * return, the gate re-runs and inserts a matching user_emails row.
 */
export default function LinkedAccountsSection() {
  const { user, profile, linkGoogleIdentity, listMyLinkedEmails, unlinkEmail } = useAuth()

  const [emails, setEmails]   = useState([])
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [error, setError]     = useState(null)
  const [info, setInfo]       = useState(null)

  async function refresh() {
    setLoading(true)
    const { data, error: err } = await listMyLinkedEmails()
    setLoading(false)
    if (err) { setError(err.message); return }
    setEmails(data)
  }

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // On return from linkIdentity we land at /?linked=google. Show a
  // confirmation once and scrub the param.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('linked') === 'google') {
        setInfo('Google account linked. You can now sign in with either email.')
        params.delete('linked')
        const rest = params.toString()
        window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
        refresh()
      }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasGoogleLink = emails.some(e => e.email_type === 'google' || e.email_type === 'personal')
  const primaryEmail  = user?.email || profile?.email || ''
  const isPrimaryInstitutional = isInstitutionalEmail(primaryEmail)

  async function handleLinkGoogle() {
    setLinking(true); setError(null); setInfo(null)
    const { error: err } = await linkGoogleIdentity()
    // On success the browser redirects to Google; on error we surface it.
    setLinking(false)
    if (err) setError(err.message || 'Could not start the linking flow.')
  }

  async function handleUnlink(row) {
    // Don't let the user delete their only verified pathway. If the
    // remaining rows would leave them with no institutional AND no
    // linked personal, block it here.
    const remaining = emails.filter(e => e.id !== row.id)
    const stillHasInstitutional = remaining.some(e => e.email_type === 'institutional')
    const stillHasLinked        = remaining.some(e => e.email_type !== 'institutional')
    if (!stillHasInstitutional && !stillHasLinked) {
      setError("You'd have no way back in. Link another account before removing this one.")
      return
    }
    if (!window.confirm(`Unlink ${row.email}? You won't be able to sign in with it anymore.`)) return
    setError(null)
    const { error: err } = await unlinkEmail(row.id)
    if (err) { setError(err.message); return }
    refresh()
  }

  return (
    <section
      className="rounded-2xl p-5 mb-4"
      style={{ background: C.white, border: `1px solid ${C.border}` }}
    >
      <p className="text-xs uppercase tracking-wider mb-2" style={{ color: C.textMuted }}>
        Linked accounts
      </p>
      <p style={{ fontSize: 12.5, color: C.textSub, lineHeight: 1.55, marginBottom: 14, fontFamily: 'Inter, system-ui, sans-serif' }}>
        Link a personal email or Google account so you can keep using Mutu after your UofT email expires.
      </p>

      {loading ? (
        <p style={{ fontSize: 12, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>Loading…</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {emails.length === 0 && (
            <li style={{
              padding: '10px 12px', borderRadius: 10,
              background: '#FAFAFA', border: `1px dashed ${C.border}`,
              fontSize: 12.5, color: C.textMuted,
              fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5,
            }}>
              No emails on file yet. Your session email should appear here shortly — refresh if it doesn't.
            </li>
          )}
          {emails.map(row => {
            const isPrimary = row.email.toLowerCase() === primaryEmail.toLowerCase()
            const typeLabel =
              row.email_type === 'institutional' ? 'UofT'      :
              row.email_type === 'google'        ? 'Google'    :
              'Personal'
            return (
              <li key={row.id} style={{
                padding: '10px 12px', borderRadius: 10,
                background: '#FAFAFA', border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13.5, fontWeight: 500, color: C.text,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {row.email}
                  </p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: C.goldDark, background: C.goldBg,
                      border: `1px solid ${C.goldLight}`, borderRadius: 99, padding: '2px 8px',
                      fontFamily: 'Inter, system-ui, sans-serif',
                    }}>
                      {typeLabel}
                    </span>
                    {row.is_verified && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: C.ok, background: C.okBg,
                        border: `1px solid ${C.okBorder}`, borderRadius: 99, padding: '2px 8px',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}>
                        Verified
                      </span>
                    )}
                    {isPrimary && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif',
                      }}>
                        Current
                      </span>
                    )}
                  </div>
                </div>
                {!isPrimary && (
                  <button
                    type="button"
                    onClick={() => handleUnlink(row)}
                    style={{
                      fontSize: 11, fontWeight: 500, color: C.danger,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                  >
                    Unlink
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Warning banner for institutional users who haven't linked a
          backup yet — this is the exact scenario the model is
          designed to prevent. */}
      {!loading && isPrimaryInstitutional && !hasGoogleLink && (
        <div style={{
          padding: '10px 12px', marginBottom: 12,
          background: C.amberBg, border: `1px solid #FDE68A`,
          borderRadius: 10, fontSize: 12, color: C.amber,
          fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.55,
        }}>
          Your school email may expire after graduation. Link a Google account now so you keep access as an alumni member.
        </div>
      )}

      <button
        type="button"
        onClick={handleLinkGoogle}
        disabled={linking}
        style={{
          width: '100%', padding: '11px 14px',
          borderRadius: 12, cursor: linking ? 'default' : 'pointer',
          background: C.white, color: C.text,
          border: `1.5px solid ${C.border}`,
          fontSize: 13.5, fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: linking ? 0.6 : 1,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {linking ? 'Redirecting…' : (hasGoogleLink ? 'Link another Google account' : 'Link Google account')}
      </button>

      {error && (
        <p style={{ fontSize: 11.5, color: C.danger, marginTop: 10, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {error}
        </p>
      )}
      {info && (
        <p style={{ fontSize: 11.5, color: C.ok, marginTop: 10, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {info}
        </p>
      )}
    </section>
  )
}
