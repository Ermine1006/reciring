// Block-based composition for admin broadcast emails. Shared between:
//   • Client (AdminEmailComposer) — preview + serialize
//   • Server (api/_templates/broadcast-message.js) — render final HTML
//
// The renderer produces inline-styled, table-based HTML that Gmail,
// Apple Mail, and Outlook 2016+ render consistently. All user text is
// HTML-escaped before insertion; inline formatting is a whitelisted
// markdown subset. No script tags, no data URIs, no <style> blocks —
// everything is inline styles on <td>/<div>/<a>/<h*>.
//
// Block schema (JSON, safe to send over the wire):
//
//   { type: 'title',      text: string }
//   { type: 'heading',    text: string }
//   { type: 'paragraph',  text: string }          // supports inline md
//   { type: 'bullets',    items: string[] }       // each supports inline md
//   { type: 'numbers',    items: string[] }
//   { type: 'divider' }
//   { type: 'quote',      text: string }          // highlighted card
//   { type: 'cta',        text: string, url: string }
//
// Anything outside this list is silently dropped at renderBlocksToHtml
// time — the server enforces the same whitelist so a malicious payload
// can't smuggle raw HTML in.

export const BLOCK_TYPES = new Set([
  'title', 'heading', 'paragraph', 'bullets', 'numbers', 'divider', 'quote', 'cta',
])

// Brand tokens — kept in sync with events-launch.js and welcome.js.
const C = {
  bgPage:      '#EEE9E0',
  bgCard:      '#FFFFFF',
  bgHighlight: '#FBF6EC',
  gold:        '#C8A96A',
  goldDark:    '#A88245',
  goldLight:   '#E6D3A3',
  text:        '#111111',
  textBody:    '#4B5563',
  textMuted:   '#9CA3AF',
  border:      '#F0ECE4',
  serif:       "'Playfair Display',Georgia,serif",
  sans:        "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

/**
 * Render a full Reciring-branded email from a subject + blocks. The
 * output is a complete HTML document ready to send via Resend.
 *
 * Options:
 *   subject         — used in <title> only; caller passes it separately
 *                     to Resend
 *   eyebrow         — small caps label above the first title block
 *   blocks          — Block[] (validated/filtered internally)
 *   appUrl          — footer link back to the app
 *   unsubscribeUrl  — appended to footer if provided
 */
export function renderBlocksEmail({ subject, eyebrow, blocks, appUrl, unsubscribeUrl }) {
  const safeTitle  = escapeHtml((subject || 'A message from Mutu').trim())
  const safeApp    = escapeHtml(appUrl || 'https://muturing.com')
  const safeUnsub  = escapeHtml(unsubscribeUrl || '')
  const safeEyebrow = escapeHtml((eyebrow || '').trim())

  const bodyHtml = renderBlocksToHtml(blocks)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
</head>
<body style="margin:0; padding:0; background:${C.bgPage}; font-family:${C.sans}; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgPage}; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgCard}; border-radius:24px; max-width:560px; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,0.08);">

          <!-- Gold accent stripe -->
          <tr>
            <td style="height:4px; background:linear-gradient(90deg,${C.goldLight} 0%,${C.gold} 50%,${C.goldDark} 100%);"></td>
          </tr>

          <!-- Header wordmark -->
          <tr>
            <td style="padding:28px 40px 0 40px; text-align:center;">
              <p style="font-family:${C.serif}; font-size:18px; font-weight:500; color:${C.goldDark}; letter-spacing:0.18em; margin:0;">
                M U T U
              </p>
              ${safeEyebrow ? `<p style="font-size:11px; letter-spacing:0.22em; text-transform:uppercase; font-weight:700; color:${C.gold}; margin:18px 0 0;">${safeEyebrow}</p>` : ''}
            </td>
          </tr>

          <!-- Body blocks -->
          <tr>
            <td style="padding:24px 40px 32px 40px;">
              ${bodyHtml || `<p style="font-size:15px; color:${C.textBody}; line-height:1.6; margin:0;">(No content)</p>`}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px; text-align:center; border-top:1px solid ${C.border};">
              <p style="font-size:11px; color:${C.textMuted}; margin:0 0 8px; line-height:1.6;">
                Sent from Mutu — the Rotman peer network.
              </p>
              <p style="font-size:11px; color:${C.textMuted}; margin:0; line-height:1.6;">
                <a href="${safeApp}" style="color:${C.goldDark}; text-decoration:none;">muturing.com</a>${safeUnsub ? `
                &nbsp;·&nbsp;
                <a href="${safeUnsub}" style="color:${C.textMuted}; text-decoration:none;">Unsubscribe</a>` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Render the body-block section only (no header/footer/wrapper). Useful
 * for the in-app preview panel when you want to embed the block output
 * without re-rendering the full shell. Returns an HTML string.
 */
export function renderBlocksToHtml(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return ''

  const parts = []
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    if (!BLOCK_TYPES.has(raw.type))      continue
    const html = renderBlock(raw)
    if (html) parts.push(html)
  }
  return parts.join('\n')
}

/**
 * Serialize blocks to a plain-text version for email clients that
 * request text/plain (mostly deliverability + accessibility). Preserves
 * structure with unicode bullets, numbered lines, and blank-line
 * separators.
 */
export function renderBlocksToText(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return ''

  const out = []
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    if (!BLOCK_TYPES.has(raw.type))      continue
    const text = blockToText(raw)
    if (text) out.push(text)
  }
  return out.join('\n\n')
}

// ────────────────────────────────────────────────────────────────
// Block renderers
// ────────────────────────────────────────────────────────────────

function renderBlock(b) {
  switch (b.type) {
    case 'title':
      return `<h1 style="font-family:${C.serif}; font-size:28px; font-weight:500; color:${C.text}; margin:0 0 14px; letter-spacing:-0.01em; line-height:1.25;">${escapeHtml(b.text || '')}</h1>`

    case 'heading':
      return `<h2 style="font-family:${C.sans}; font-size:18px; font-weight:600; color:${C.text}; margin:22px 0 10px; line-height:1.35;">${escapeHtml(b.text || '')}</h2>`

    case 'paragraph':
      return `<p style="font-size:15px; color:${C.textBody}; line-height:1.65; margin:0 0 14px;">${renderInline(b.text || '')}</p>`

    case 'bullets': {
      const items = Array.isArray(b.items) ? b.items : []
      if (items.length === 0) return ''
      const li = items.map(t => `<li style="margin-bottom:6px;">${renderInline(String(t || ''))}</li>`).join('')
      return `<ul style="font-size:15px; color:${C.textBody}; line-height:1.65; margin:0 0 14px; padding-left:20px;">${li}</ul>`
    }

    case 'numbers': {
      const items = Array.isArray(b.items) ? b.items : []
      if (items.length === 0) return ''
      const li = items.map(t => `<li style="margin-bottom:6px;">${renderInline(String(t || ''))}</li>`).join('')
      return `<ol style="font-size:15px; color:${C.textBody}; line-height:1.65; margin:0 0 14px; padding-left:22px;">${li}</ol>`
    }

    case 'divider':
      return `<div style="height:1px; background:${C.border}; margin:22px 0;"></div>`

    case 'quote':
      // Highlight card — gold-tinted background, gold left border.
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td style="background:${C.bgHighlight}; border-left:4px solid ${C.gold}; border-radius:10px; padding:14px 18px; font-size:14px; color:${C.text}; line-height:1.6; font-style:italic;">${renderInline(b.text || '')}</td></tr></table>`

    case 'cta': {
      const label = escapeHtml((b.text || 'Learn more').trim() || 'Learn more')
      const href  = safeUrl(b.url)
      if (!href) {
        // Missing/invalid URL — render as disabled-looking button
        return `<div style="text-align:center; margin:20px 0;"><span style="display:inline-block; background:${C.border}; color:${C.textMuted}; font-weight:600; font-size:14px; padding:12px 28px; border-radius:12px;">${label}</span></div>`
      }
      return `<div style="text-align:center; margin:24px 0;"><a href="${href}" style="display:inline-block; background:linear-gradient(135deg,${C.gold} 0%,${C.goldDark} 100%); color:#FFFFFF; text-decoration:none; font-weight:600; font-size:14px; padding:13px 30px; border-radius:12px; box-shadow:0 6px 20px rgba(200,169,106,0.35);">${label}</a></div>`
    }

    default:
      return ''
  }
}

function blockToText(b) {
  switch (b.type) {
    case 'title':     return String(b.text || '').toUpperCase()
    case 'heading':   return String(b.text || '')
    case 'paragraph': return stripInline(String(b.text || ''))
    case 'bullets': {
      const items = Array.isArray(b.items) ? b.items : []
      return items.map(t => `• ${stripInline(String(t || ''))}`).join('\n')
    }
    case 'numbers': {
      const items = Array.isArray(b.items) ? b.items : []
      return items.map((t, i) => `${i + 1}. ${stripInline(String(t || ''))}`).join('\n')
    }
    case 'divider':  return '— — —'
    case 'quote':    return `“${stripInline(String(b.text || ''))}”`
    case 'cta': {
      const label = String(b.text || 'Learn more').trim() || 'Learn more'
      const url   = safeUrl(b.url) || ''
      return url ? `${label}: ${url}` : label
    }
    default: return ''
  }
}

// ────────────────────────────────────────────────────────────────
// Inline markdown → sanitized HTML
// ────────────────────────────────────────────────────────────────
//
// Supported subset:
//   **bold**  → <strong>
//   *italic*  → <em>
//   [text](url) → <a href> (URL sanitized; http/https/mailto only)
//
// Everything else is treated as literal text and HTML-escaped. The
// implementation escapes FIRST, then re-scans for the markers on the
// escaped string. That way an admin can't sneak in raw HTML by
// including `<script>` in their text — the `<` is already `&lt;` when
// the markdown pass runs.

function renderInline(text) {
  const s = escapeHtml(String(text || ''))
  return applyInlineMarkdown(s)
}

function stripInline(text) {
  // For plain-text output: strip the markdown markers but keep the
  // visible label. `[text](url)` becomes `text (url)`.
  return String(text || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `${label} (${url})`)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
}

function applyInlineMarkdown(escaped) {
  // Order matters: links first (they can contain characters the other
  // markers use), then bold (double-star), then italic (single-star).
  let s = escaped

  // Links: [text](url). `text` may contain escaped HTML but not `]`;
  // `url` may not contain `)`. Both are re-escaped by escapeHtml before
  // reaching here, so `[` is `[` and `(` is `(` — the pattern works.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const href = safeUrl(decodeHtml(url))
    if (!href) return label // drop the link, keep the label
    return `<a href="${href}" style="color:${C.goldDark}; text-decoration:underline;">${label}</a>`
  })

  // Bold: **text**. Non-greedy, single line.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic: *text*. Non-greedy, avoids matching leftover ** by using [^*].
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')

  // Preserve intentional line breaks inside a paragraph.
  s = s.replace(/\n/g, '<br>')

  return s
}

// ────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────

const URL_PROTOCOL_ALLOWLIST = new Set(['http:', 'https:', 'mailto:'])

/**
 * Return a URL as a string only if it uses an allowed protocol. Returns
 * null for javascript:, data:, file:, ftp:, or any bogus input. The
 * accepted string is HTML-escaped before return so it's safe to drop
 * straight into an href attribute.
 */
export function safeUrl(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    // URL parser needs a base for relative inputs; using the app origin
    // means bare paths like "/discover" resolve safely.
    const parsed = new URL(trimmed, 'https://muturing.com')
    if (!URL_PROTOCOL_ALLOWLIST.has(parsed.protocol)) return null
    return escapeHtml(parsed.toString())
  } catch {
    return null
  }
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeHtml(s) {
  // Only reverse the entities escapeHtml produces — this is used
  // internally to pull the URL back out of the escaped stream before
  // we hand it to safeUrl.
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
