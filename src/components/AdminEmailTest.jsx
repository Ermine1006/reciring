import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import AdminEmailComposer from './AdminEmailComposer'
import AdminEmailPreview from './AdminEmailPreview'

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

// Template presets shown in the radio. `apiTemplate` is the key the
// backend (api/broadcast.js → TEMPLATES) recognises. `locked` means
// subject + body come straight from the template file and admins can't
// override (welcome is the only one). `allowBroadcast` controls
// whether the "Send Broadcast to all" button is enabled — welcome
// shouldn't be broadcast to existing subscribed users.
const TEMPLATES = [
  {
    id:             'welcome',
    label:          'Welcome Email',
    description:    'Standard new-user welcome. Subject + body fixed.',
    apiTemplate:    'welcome',
    locked:         true,
    allowBroadcast: false,
    defaultSubject: '',
    defaultBody:    '',
    eyebrow:        '',
  },
  {
    id:             'events_launch',
    label:          'Events Launch 🎉',
    description:    'Premium launch email for the Events feature. Fixed layout, hero + screenshot + founder note.',
    apiTemplate:    'events_launch',
    locked:         true,
    allowBroadcast: true,
    defaultSubject: '',
    defaultBody:    '',
    eyebrow:        '',
  },
  {
    id:             'product_update',
    label:          'Product Update',
    description:    'Announce new features or releases.',
    apiTemplate:    'broadcast_message',
    locked:         false,
    allowBroadcast: true,
    defaultSubject: "What's new at Mutu",
    defaultBody:    "Hi —\n\nWe just shipped some updates we think you'll like:\n\n• \n• \n\nOpen the app to try them out.\n\n— The Mutu Team",
    eyebrow:        'Product Update',
  },
  {
    id:             'community_announcement',
    label:          'Community Announcement',
    description:    'Share community news, events, or recognition.',
    apiTemplate:    'broadcast_message',
    locked:         false,
    allowBroadcast: true,
    defaultSubject: 'A note from the Mutu community',
    defaultBody:    "Hi —\n\nQuick update from the team:\n\n\n\n— The Mutu Team",
    eyebrow:        'Community',
  },
  {
    id:             'custom',
    label:          'Custom',
    description:    'Blank slate — write your own subject and body.',
    apiTemplate:    'broadcast_message',
    locked:         false,
    allowBroadcast: true,
    defaultSubject: '',
    defaultBody:    '',
    eyebrow:        '',
  },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Serialize the composer / legacy body into the payload shape
// broadcast-message expects. Custom uses `blocks`; others use `body`.
function buildTemplateData(template, isCustom, subject, body, blocks) {
  if (isCustom) {
    return {
      subject: subject.trim(),
      blocks,
      eyebrow: template.eyebrow,
    }
  }
  return {
    subject: subject.trim(),
    body,
    eyebrow: template.eyebrow,
  }
}

// A block "has content" if the admin actually typed something. Empty
// dividers count as content (they're intentional). Empty CTA labels
// or URLs count as content too — the renderer handles missing URLs
// gracefully and the admin may still want the button.
function hasBlockContent(b) {
  if (!b) return false
  if (b.type === 'divider') return true
  if (b.type === 'bullets' || b.type === 'numbers') {
    return Array.isArray(b.items) && b.items.some(t => String(t || '').trim())
  }
  if (b.type === 'cta') {
    return Boolean(String(b.text || '').trim() || String(b.url || '').trim())
  }
  return Boolean(String(b.text || '').trim())
}

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

  const [templateId, setTemplateId]         = useState('welcome')
  const [subject, setSubject]               = useState('')
  const [body, setBody]                     = useState('')
  // Block-based body used only by the Custom template. The composer
  // owns nothing; state lives here so the preview + payload builder
  // can read from the same source of truth. Sample blocks keep the
  // first-open experience useful instead of a blank canvas.
  const [blocks, setBlocks]                 = useState(() => [
    { type: 'title',     text: 'Hi Mutu community —' },
    { type: 'paragraph', text: 'Add your message here. Use **bold**, *italic*, or [links](https://muturing.com).' },
  ])
  const [recipientsText, setRecipientsText] = useState('')
  const [sending, setSending]               = useState(false)
  const [sendMode, setSendMode]             = useState(null) // 'test' | 'broadcast'
  const [result, setResult]                 = useState(null)
  const [error, setError]                   = useState(null)

  const template = TEMPLATES.find(t => t.id === templateId) || TEMPLATES[0]

  // When template changes, reset subject + body to that template's
  // defaults. Welcome stays empty (locked).
  useEffect(() => {
    setSubject(template.defaultSubject || '')
    setBody(template.defaultBody || '')
    setResult(null); setError(null)
  }, [templateId])

  const { valid, invalid } = parseRecipients(recipientsText)

  // A composer-based template (Custom) needs the block list to be
  // non-empty. Legacy templates need a plain-text body.
  const isCustom = template.id === 'custom'
  const hasContent = isCustom
    ? blocks.length > 0 && blocks.some(b => hasBlockContent(b))
    : Boolean(body.trim())

  // Test send: needs at least 1 valid recipient (cap 10) and content
  // when the template isn't locked.
  const canSendTest =
    !sending
    && valid.length > 0
    && valid.length <= 10
    && (template.locked || (subject.trim() && hasContent))

  // Broadcast: same content gate; locked templates can't broadcast.
  const canSendBroadcast =
    !sending
    && template.allowBroadcast
    && subject.trim()
    && hasContent

  // ── Send paths ────────────────────────────────────────────

  async function postBroadcast(payload) {
    let resp
    try {
      resp = await fetch('/api/broadcast', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      return { ok: false, error: err?.message || 'Network error' }
    }
    let body = {}
    try { body = await resp.json() } catch {}
    if (!resp.ok) return { ok: false, error: body.error || `Failed (${resp.status})` }
    return { ok: true, body }
  }

  const handleTest = async () => {
    if (!session)        { setError('You are not signed in.'); return }
    if (!canSendTest)    return
    setSending(true); setSendMode('test'); setError(null); setResult(null)

    const payload = {
      template:   template.apiTemplate,
      recipients: valid,
      data: template.locked ? undefined : buildTemplateData(template, isCustom, subject, body, blocks),
    }

    const { ok, body: respBody, error: err } = await postBroadcast(payload)
    setSending(false)
    if (!ok) { setError(err); return }
    setResult({ ...respBody, mode: 'test', recipients: valid })
  }

  const handleBroadcast = async () => {
    if (!session)             { setError('You are not signed in.'); return }
    if (!canSendBroadcast)    return
    const ok = window.confirm(
      `Send this email to ALL subscribed users? This cannot be undone.\n\nTemplate: ${template.label}\nSubject: ${subject.trim()}`
    )
    if (!ok) return

    setSending(true); setSendMode('broadcast'); setError(null); setResult(null)

    const payload = {
      template: template.apiTemplate,
      audience: 'all',
      data: buildTemplateData(template, isCustom, subject, body, blocks),
    }

    const { ok: success, body: respBody, error: err } = await postBroadcast(payload)
    setSending(false)
    if (!success) { setError(err); return }
    setResult({ ...respBody, mode: 'broadcast' })
  }

  // ── Subscription admin (kept from previous version) ──────

  const [subEmail, setSubEmail]   = useState('')
  const [subAction, setSubAction] = useState('subscribe')
  const [subSaving, setSubSaving] = useState(false)
  const [subResult, setSubResult] = useState(null)
  const [subError, setSubError]   = useState(null)

  const handleSubscriptionUpdate = async () => {
    const target = subEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(target)) { setSubError('Enter a valid email.'); return }
    if (!session)                { setSubError('You are not signed in.'); return }
    setSubSaving(true); setSubError(null); setSubResult(null)
    let resp
    try {
      resp = await fetch('/api/admin/subscription', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target, action: subAction }),
      })
    } catch (err) { setSubSaving(false); setSubError(err?.message || 'Network error'); return }
    let body = {}
    try { body = await resp.json() } catch {}
    setSubSaving(false)
    if (!resp.ok) { setSubError(body.error || `Failed (${resp.status})`); return }
    setSubResult(body)
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
              Email center
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
              const active = templateId === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: active ? C.goldBg : '#FAFAFA',
                    border: `1.5px solid ${active ? C.gold : C.border}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: active ? C.goldDark : C.text, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
                      {t.label}
                    </p>
                    {t.locked && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: C.textMuted, background: '#F3F4F6', border: `1px solid ${C.border}`,
                        borderRadius: 99, padding: '2px 7px',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}>
                        Locked
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0', fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
                    {t.description}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        {/* Subject */}
        <section
          className="rounded-2xl p-5 mb-4"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>
            Subject
          </p>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 200))}
            disabled={template.locked}
            placeholder={template.locked ? 'Set by the welcome template' : 'Email subject'}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${C.border}`,
              background: template.locked ? '#F5F5F5' : '#FAFAFA',
              fontSize: 14,
              fontFamily: 'Inter, system-ui, sans-serif',
              outline: 'none',
              color: template.locked ? C.textMuted : C.text,
              cursor: template.locked ? 'not-allowed' : 'text',
            }}
          />
        </section>

        {/* Body — composer for Custom, plain textarea otherwise */}
        <section
          className="rounded-2xl p-5 mb-4"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>
            Body
          </p>
          <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
            {isCustom
              ? 'Build the email from blocks. Paragraphs support **bold**, *italic*, and [links](url).'
              : 'Plain text only. Blank lines = paragraphs. HTML is escaped for safety.'}
          </p>

          {isCustom ? (
            <AdminEmailComposer blocks={blocks} onChange={setBlocks} />
          ) : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={template.locked}
              placeholder={template.locked ? 'Set by the welcome template' : 'Write your message…'}
              rows={9}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 12,
                border: `1.5px solid ${C.border}`,
                background: template.locked ? '#F5F5F5' : '#FAFAFA',
                fontSize: 13.5,
                fontFamily: 'Inter, system-ui, sans-serif',
                outline: 'none',
                color: template.locked ? C.textMuted : C.text,
                cursor: template.locked ? 'not-allowed' : 'text',
                resize: 'vertical',
                lineHeight: 1.55,
                minHeight: 180,
              }}
            />
          )}
        </section>

        {/* Preview — Custom only. Other templates render their own
            layouts on the server; a shared preview would misrepresent
            them. Custom uses the shared blocks renderer so the iframe
            is byte-for-byte what recipients get. */}
        {isCustom && (
          <section
            className="rounded-2xl p-5 mb-4"
            style={{ background: C.white, border: `1px solid ${C.border}` }}
          >
            <p className="text-xs uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>
              Preview
            </p>
            <AdminEmailPreview
              subject={subject}
              eyebrow={template.eyebrow}
              blocks={blocks}
            />
          </section>
        )}

        {/* Recipients (test list) */}
        <section
          className="rounded-2xl p-5 mb-4"
          style={{ background: C.white, border: `1px solid ${C.border}` }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>
            Test recipients
          </p>
          <p style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
            Up to 10 emails for <strong style={{ color: C.text }}>Send Test</strong>. Comma, semicolon, or newline separated. Ignored when broadcasting.
          </p>
          <textarea
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder={"example1@test.com\nexample2@test.com"}
            rows={4}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${C.border}`,
              background: '#FAFAFA',
              color: C.text,
              outline: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              lineHeight: 1.5,
              resize: 'vertical',
              minHeight: 100,
            }}
          />
          {(valid.length > 0 || invalid.length > 0) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {valid.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.success, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 99, padding: '4px 10px', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  ✓ {valid.length} valid
                </span>
              )}
              {invalid.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 99, padding: '4px 10px', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  ⚠ {invalid.length} invalid (skipped)
                </span>
              )}
              {valid.length > 10 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.danger, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 99, padding: '4px 10px', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Over test cap (10 max)
                </span>
              )}
            </div>
          )}
        </section>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            onClick={handleTest}
            disabled={!canSendTest}
            className="active:scale-[0.98]"
            style={{
              flex: 1,
              padding: '13px 0',
              borderRadius: 12,
              background: canSendTest ? C.white : '#F3F4F6',
              color:      canSendTest ? C.goldDark : C.textMuted,
              border: `1.5px solid ${canSendTest ? C.goldLight : C.border}`,
              fontSize: 13, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: canSendTest ? 'pointer' : 'default',
            }}
          >
            {sending && sendMode === 'test' ? 'Sending…' : `Send Test${valid.length ? ` (${valid.length})` : ''}`}
          </button>
          <button
            type="button"
            onClick={handleBroadcast}
            disabled={!canSendBroadcast}
            className="active:scale-[0.98]"
            style={{
              flex: 1,
              padding: '13px 0',
              borderRadius: 12,
              background: canSendBroadcast ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : '#F3F4F6',
              color:      canSendBroadcast ? '#fff' : C.textMuted,
              border: 'none',
              boxShadow: canSendBroadcast ? '0 6px 18px rgba(200,169,106,0.34)' : 'none',
              fontSize: 13, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: canSendBroadcast ? 'pointer' : 'default',
            }}
          >
            {sending && sendMode === 'broadcast' ? 'Sending…' : 'Send Broadcast'}
          </button>
        </div>

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

        {result && (
          <section
            className="rounded-2xl p-5 mb-4"
            style={{ background: C.white, border: `1px solid ${C.border}` }}
          >
            <p className="text-xs uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>
              Result · {result.mode === 'broadcast' ? 'Broadcast' : 'Test'}
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <ResultBadge label="Sent"         count={result.sent}         color={C.success}  bg="#F0FDF4" border="#BBF7D0" />
              <ResultBadge label="Failed"       count={result.failed}       color={C.danger}   bg="#FEF2F2" border="#FECACA" />
              <ResultBadge label="Unsubscribed" count={result.unsubscribed} color={C.amber}    bg="#FFFBEB" border="#FDE68A" />
            </div>
            {result.errors && result.errors.length > 0 && (
              <div style={{ marginBottom: 4 }}>
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
                      fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.45, wordBreak: 'break-word',
                    }}>
                      <span style={{ fontWeight: 600, color: C.danger }}>{e.recipient}:</span>{' '}
                      <span style={{ color: C.textSub }}>{e.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p style={{ fontSize: 11, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5, margin: '10px 0 0' }}>
              Every send (success, failure, unsubscribed skip) is recorded in <code style={{ background: '#F5F5F5', padding: '1px 5px', borderRadius: 4, fontFamily: 'ui-monospace, monospace' }}>email_logs</code> with the full Resend ID.
            </p>
          </section>
        )}

        {/* ── Manage subscription ──────────────────────────── */}
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
                    flex: 1, padding: '10px 12px', borderRadius: 12,
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
              background: (subSaving || !subEmail.trim()) ? '#F3F4F6' : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              color: (subSaving || !subEmail.trim()) ? C.textMuted : '#fff',
              border: 'none',
              boxShadow: (subSaving || !subEmail.trim()) ? 'none' : '0 4px 14px rgba(200,169,106,0.3)',
              cursor: (subSaving || !subEmail.trim()) ? 'default' : 'pointer',
            }}
          >
            {subSaving ? 'Updating…' : subAction === 'subscribe' ? 'Resubscribe user' : 'Unsubscribe user'}
          </button>

          {subError && (
            <div className="rounded-xl p-3 mt-3" style={{ background: '#FEF2F2', border: `1px solid #FECACA` }}>
              <p style={{ fontSize: 12, color: C.danger, fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }}>
                {subError}
              </p>
            </div>
          )}

          {subResult && (
            <div className="rounded-xl p-3 mt-3" style={{
              background: subResult.status === 'subscribed' ? '#F0FDF4' : '#FFFBEB',
              border: `1px solid ${subResult.status === 'subscribed' ? '#BBF7D0' : '#FDE68A'}`,
            }}>
              <p style={{
                fontSize: 13, fontWeight: 600,
                color: subResult.status === 'subscribed' ? C.success : C.amber,
                fontFamily: 'Inter, system-ui, sans-serif', margin: '0 0 4px',
              }}>
                {subResult.status === 'subscribed' ? '✓ Resubscribed' : '⚠ Unsubscribed'}
              </p>
              <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', margin: 0, lineHeight: 1.5 }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: C.text }}>{subResult.email}</span>{' '}
                is now <strong>{subResult.status}</strong>
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
