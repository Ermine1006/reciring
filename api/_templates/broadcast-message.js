// Generic broadcast / announcement template.
//
// Powers Product Update / Community Announcement / Custom modes in the
// admin email center. Admins write subject + body in plain text; the
// template HTML-escapes everything and wraps it in the standard
// Reciring shell (gold accent stripe, eyebrow, footer with unsubscribe).
//
// Variables (from data):
//   subject  — email subject; falls back to a generic line
//   body     — plain text body. Blank lines split into <p>; single \n
//              becomes <br>. Always HTML-escaped — admins cannot inject
//              arbitrary HTML (deliberate; safer for compliance + DKIM).
//   eyebrow  — small uppercase label above the body
//              (e.g. "Product Update" / "Community" / "" for Custom).
//
//   userEmail / appUrl / unsubscribeUrl — provided by the function
//   wrapper, same as the welcome template.

export function broadcastMessageTemplate({
  subject,
  body,
  eyebrow,
  userEmail,
  appUrl,
  unsubscribeUrl,
}) {
  const safeSubject = (subject || '').trim() || 'A message from Reciring'
  const safeEmail   = escapeHtml(userEmail || '')
  const safeUrl     = escapeHtml(appUrl || 'https://reciring.com')
  const safeUnsub   = escapeHtml(unsubscribeUrl || '')
  const safeEyebrow = escapeHtml((eyebrow || '').trim())
  const bodyHtml    = bodyToHtml(body || '')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(safeSubject)}</title>
</head>
<body style="margin:0; padding:0; background:#EEE9E0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEE9E0; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF; border-radius:24px; max-width:560px; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,0.08);">
          <!-- Gold accent stripe -->
          <tr>
            <td style="height:4px; background:linear-gradient(90deg,#E6D3A3 0%,#C8A96A 50%,#A88245 100%);"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px 40px;">
              ${safeEyebrow ? `<p style="font-size:11px; letter-spacing:0.22em; text-transform:uppercase; font-weight:700; color:#C8A96A; margin:0 0 14px;">${safeEyebrow}</p>` : ''}
              <h1 style="font-family:'Playfair Display',Georgia,serif; font-size:22px; font-weight:500; color:#111111; margin:0 0 18px; letter-spacing:-0.01em; line-height:1.3;">
                ${escapeHtml(safeSubject)}
              </h1>
              <div style="font-size:14.5px; line-height:1.65; color:#3D3020;">
                ${bodyHtml || '<p style="margin:0; color:#9CA3AF; font-style:italic;">(empty body)</p>'}
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 36px; text-align:center;">
              <a href="${safeUrl}" style="display:inline-block; padding:13px 32px; background:#A88245; background-image:linear-gradient(135deg,#C8A96A 0%,#A88245 100%); color:#FFFFFF; text-decoration:none; border-radius:12px; font-size:13px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;">
                Open Reciring
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px; background:#FAFAF8; border-top:1px solid #F0ECE4;">
              <p style="font-size:11px; color:#9CA3AF; line-height:1.6; margin:0 0 6px; text-align:center;">
                Sent to <span style="color:#6B7280;">${safeEmail}</span> · Reciring Team
              </p>
              ${safeUnsub ? `<p style="font-size:11px; color:#9CA3AF; line-height:1.6; margin:6px 0 0; text-align:center;">
                <a href="${safeUnsub}" style="color:#A88245; text-decoration:underline;">Unsubscribe from non-essential mail</a>
              </p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject: safeSubject, html }
}

// Split body into paragraphs on blank lines, convert single newlines
// to <br>, escape everything in between. Admins can't inject HTML.
function bodyToHtml(text) {
  return String(text)
    .split(/\n{2,}/)
    .map(para => {
      const safe = escapeHtml(para).replace(/\n/g, '<br>')
      return `<p style="margin:0 0 14px;">${safe}</p>`
    })
    .join('')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
