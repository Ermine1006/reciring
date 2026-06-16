import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

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
  success:   '#16A34A',
  danger:    '#DC2626',
  amber:     '#B45309',
}

// Templates registered on /api/broadcast. Add to this list as more are
// implemented (announcement, weekly_digest, etc.). Keep the `id` field
// matching the server-side key in api/broadcast.js TEMPLATES.
const TEMPLATES = [
  { id: 'welcome', label: 'Welcome email', description: 'The standard new-user welcome.' },
]

// Lightweight email shape check — not RFC-strict, just catches typos.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseRecipients(raw) {
  const tokens = String(raw || '')
    .split(/[,\n;]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)

  const seen = new Set()
  const valid = []
  const invalid = []
  for (const t of tokens) {
    if (seen.has(t)) continue
    seen.add(t)
    if (EMAIL_RE.test(t)) valid.push(t)
    else                  invalid.push(t)
  }
  return { valid, invalid }
}

export default function AdminEmailTest({ onClose }) {
  const { session } = useAuth()
  const [template, setTemplate] = useState('welcome')
  const [recipientsText, setRecipientsText] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState(null) // { sent, failed, unsubscribed, errors, recipients }
  const [error, setError]     = useState(null)

  // Subscription admin (resubscribe / unsubscribe by email)
  const [subEmail, setSubEmail]       = useState('')
  const [subAction, setSubAction]     = useState('subscribe') // 'subscribe' | 'unsubscribe'
  const [subSaving, setSubSaving]     = useState(false)
  const [subResult, setSubResult]     = useState(null)
  const [subError, setSubError]       = useState(null)

  const handleSubscriptionUpdate = async () => {
    const target = subEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(target)) { setSubError('Enter a valid email.'); return }
    if (!session)                { setSubError('You are not signed in.'); return }

    setSubSaving(true); setSubError(null); setSubResult(null)

    let resp
    try {
      resp = await fetch('/api/admin/subscription', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: target, action: subAction }),
      })
    } catch (err) {
      setSubSaving(false)
      setSubError(err?.message || 'Network error')
      return
    }

    let body = {}
    try { body = await resp.json() } catch {}

    setSubSaving(false)
    if (!resp.ok) { setSubError(body.error || `Failed (${resp.status})`); return }
    setSubResult(body)
  }

  const { valid, invalid } = parseRecipients(recipientsText)
  const canSend = valid.length > 0 && valid.length <= 10 && !sending

  const handleSend = async () => {
    if (!session) { setError('You are not signed in.'); return }
    if (valid.length === 0) { setError('Enter at least one valid email.'); return }
    if (valid.length > 10) { setError('Test send is capped at 10 recipients. Use the broadcast endpoint for larger lists.'); return }

    setSending(true); setError(null); setResult(null)

    let resp
    try {
      resp = await fetch('/api/broadcast', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ template, recipients: valid }),
      })
    } catch (err) {
      setSending(false)
      setError(err?.message || 'Network error')
      return
    }

    let body = {}
    try { body = await resp.json() } catch {}

    setSending(false)
    if (!resp.ok) {
      setError(body.error || `Send failed (${resp.status})`)
      return
    }

    setResult({
      ...body,
      recipients: valid,
    })
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
          <div>
            <p className="text-[10px] tracking-[0.28em] font-semibold uppercase mb-1" style={{ color: C.gold }}>
              Admin
            </p>
            <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, color: C.text }}>
              Send test email
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium"
            style={{ color: C.goldDark, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Done
          </button>
        </div>

        {/* Template */}
        <section
          className="rounded-2xl p-5 mb-4"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>
            Template
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TEMPLATES.map(t => {
              const active = template === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: active ? C.goldBg : '#FAFAFA',
                    border: `1.5px solid ${active ? C.gold : C.border}`,
                    cursor: 'pointer',
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, color: active ? C.goldDark : C.text, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {t.label}
                  </p>
                  <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0', fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
                    {t.description}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        {/* Recipients */}
        <section
          className="rounded-2xl p-5 mb-4"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>
            Recipients
          </p>
          <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
            Up to 10 emails. One per line, or separated by commas / semicolons.
          </p>

          <textarea
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder={`example1@test.com\nexample2@test.com\nexample3@test.com`}
            rows={6}
            className="w-full rounded-xl px-4 py-3 text-sm font-mono"
            style={{
              background: '#FAFAFA',
              border: `1.5px solid ${C.border}`,
              color: C.text,
              outline: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              lineHeight: 1.5,
              resize: 'vertical',
              minHeight: 120,
            }}
          />

          {/* Live validation summary */}
          {(valid.length > 0 || invalid.length > 0) && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {valid.length > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: C.success, background: '#F0FDF4', border: '1px solid #BBF7D0',
                  borderRadius: 99, padding: '4px 10px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  ✓ {valid.length} valid
                </span>
              )}
              {invalid.length > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: C.amber, background: '#FFFBEB', border: '1px solid #FDE68A',
                  borderRadius: 99, padding: '4px 10px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  ⚠ {invalid.length} invalid (skipped)
                </span>
              )}
              {valid.length > 10 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: C.danger, background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 99, padding: '4px 10px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  Over cap (10 max)
                </span>
              )}
            </div>
          )}
        </section>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide active:scale-[0.98] mb-4"
          style={{
            background: canSend
              ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
              : '#F3F4F6',
            color: canSend ? '#fff' : C.textMuted,
            border: 'none',
            boxShadow: canSend ? '0 6px 20px rgba(200,169,106,0.35)' : 'none',
            cursor: canSend ? 'pointer' : 'default',
          }}
        >
          {sending
            ? 'Sending…'
            : valid.length === 0
              ? 'Send test'
              : `Send test to ${valid.length} recipient${valid.length === 1 ? '' : 's'}`}
        </button>

        {error && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: '#FEF2F2', border: `1px solid #FECACA` }}
          >
            <p style={{ fontSize: 13, color: C.danger, fontWeight: 500, fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }}>
              {error}
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <section
            className="rounded-2xl p-5"
            style={{ background: C.white, border: `1px solid ${C.border}` }}
          >
            <p className="text-xs uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>
              Result
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <ResultBadge label="Sent"         count={result.sent}         color={C.success}  bg="#F0FDF4" border="#BBF7D0" />
              <ResultBadge label="Failed"       count={result.failed}       color={C.danger}   bg="#FEF2F2" border="#FECACA" />
              <ResultBadge label="Unsubscribed" count={result.unsubscribed} color={C.amber}    bg="#FFFBEB" border="#FDE68A" />
            </div>

            {result.errors && result.errors.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.danger, marginBottom: 6, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Errors
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {result.errors.map((e, i) => (
                    <li key={i} style={{
                      fontSize: 12, color: C.text,
                      padding: '8px 12px',
                      background: '#FEF2F2', border: '1px solid #FECACA',
                      borderRadius: 8, marginBottom: 6,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      lineHeight: 1.45,
                      wordBreak: 'break-word',
                    }}>
                      <span style={{ fontWeight: 600, color: C.danger }}>{e.recipient}:</span>{' '}
                      <span style={{ color: C.textSub }}>{e.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p style={{ fontSize: 11, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5, margin: '10px 0 0' }}>
              Every send (success, failure, or unsubscribed skip) is also recorded in <code style={{ background: '#F5F5F5', padding: '1px 5px', borderRadius: 4, fontFamily: 'ui-monospace, monospace' }}>email_logs</code> with the full Resend ID.
            </p>
          </section>
        )}

        {/* ── Manage subscription (resubscribe / unsubscribe) ───── */}
        <section
          className="rounded-2xl p-5 mt-6"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>
            Manage subscription
          </p>
          <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 14, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
            Resubscribe a user who unsubscribed during testing, or manually opt someone out. Every change is recorded in <code style={{ background: '#F5F5F5', padding: '1px 5px', borderRadius: 4, fontFamily: 'ui-monospace, monospace' }}>email_subscriptions</code> with your user id.
          </p>

          <input
            type="email"
            value={subEmail}
            onChange={(e) => setSubEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-xl px-4 py-3 text-sm mb-3"
            style={{
              background: '#FAFAFA',
              border: `1.5px solid ${C.border}`,
              color: C.text,
              outline: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
            }}
          />

          {/* Action toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { id: 'subscribe',   label: 'Resubscribe',  color: C.success, bg: '#F0FDF4', border: '#BBF7D0' },
              { id: 'unsubscribe', label: 'Unsubscribe',  color: C.amber,   bg: '#FFFBEB', border: '#FDE68A' },
            ].map(opt => {
              const active = subAction === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSubAction(opt.id)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: active ? opt.bg : '#FAFAFA',
                    border: `1.5px solid ${active ? opt.border : C.border}`,
                    cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    color: active ? opt.color : C.textSub,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleSubscriptionUpdate}
            disabled={subSaving || !subEmail.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide active:scale-[0.98]"
            style={{
              background: (subSaving || !subEmail.trim())
                ? '#F3F4F6'
                : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              color: (subSaving || !subEmail.trim()) ? C.textMuted : '#fff',
              border: 'none',
              boxShadow: (subSaving || !subEmail.trim())
                ? 'none'
                : '0 4px 14px rgba(200,169,106,0.3)',
              cursor: (subSaving || !subEmail.trim()) ? 'default' : 'pointer',
            }}
          >
            {subSaving ? 'Updating…' : subAction === 'subscribe' ? 'Resubscribe user' : 'Unsubscribe user'}
          </button>

          {subError && (
            <div
              className="rounded-xl p-3 mt-3"
              style={{ background: '#FEF2F2', border: `1px solid #FECACA` }}
            >
              <p style={{ fontSize: 12, color: C.danger, fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }}>
                {subError}
              </p>
            </div>
          )}

          {subResult && (
            <div
              className="rounded-xl p-3 mt-3"
              style={{
                background: subResult.status === 'subscribed' ? '#F0FDF4' : '#FFFBEB',
                border: `1px solid ${subResult.status === 'subscribed' ? '#BBF7D0' : '#FDE68A'}`,
              }}
            >
              <p style={{
                fontSize: 13, fontWeight: 600,
                color: subResult.status === 'subscribed' ? C.success : C.amber,
                fontFamily: 'Inter, system-ui, sans-serif', margin: '0 0 4px',
              }}>
                {subResult.status === 'subscribed' ? '✓ Resubscribed' : '⚠ Unsubscribed'}
              </p>
              <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', margin: 0, lineHeight: 1.5 }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: C.text }}>{subResult.email}</span>
                {' '}is now <strong>{subResult.status}</strong>
                {subResult.previous && subResult.previous !== subResult.status && (
                  <> (was <em>{subResult.previous}</em>)</>
                )}.
              </p>
            </div>
          )}
        </section>
      </motion.div>
    </div>
  )
}

function ResultBadge({ label, count, color, bg, border }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 80,
      background: bg, border: `1px solid ${border}`,
      borderRadius: 12,
      padding: '10px 12px',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.1 }}>
        {count ?? 0}
      </p>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B7280', margin: '4px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {label}
      </p>
    </div>
  )
}
