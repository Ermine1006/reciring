// Event registration confirmation — transactional, sent immediately
// when a user joins an event via /api/send-email.
//
// Data (all string unless noted):
//   displayName    — recipient's first name for the greeting
//   eventTitle     — event title
//   eventStartAt   — ISO timestamp; template formats to "Sat, Jul 12 · 6:30 PM"
//   eventLocation  — venue text (may be empty)
//   hostName       — host's display name
//   eventDescription — free-text description (may be empty)
//   eventUrl       — deep link back to the event detail page
//   appUrl         — app root URL for the footer
//   unsubscribeUrl — nullable; hidden if not provided (transactional emails
//                    don't need it, but including keeps the footer uniform)
//
// Modeled on the events-launch template shell (hero, card, CTA, footer)
// so all Reciring emails feel like they're from the same product.

export function eventRegistrationTemplate({
  displayName,
  eventTitle,
  eventStartAt,
  eventLocation,
  hostName,
  eventDescription,
  eventUrl,
  appUrl,
  unsubscribeUrl,
}) {
  const safeName   = escapeHtml(displayName || 'there')
  const safeTitle  = escapeHtml(eventTitle || 'the event')
  const safeWhen   = escapeHtml(formatWhen(eventStartAt))
  const safeWhere  = escapeHtml(eventLocation || 'Details on the event page')
  const safeHost   = escapeHtml(hostName || 'the host')
  const safeDesc   = escapeHtml(eventDescription || '')
  const safeUrl    = escapeHtml(eventUrl || appUrl || 'https://reciring.com')
  const safeApp    = escapeHtml(appUrl || 'https://reciring.com')
  const safeUnsub  = escapeHtml(unsubscribeUrl || '')

  const subject = `You're in — ${eventTitle || 'your event'}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
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

          <!-- ── HERO ─────────────────────────────────────── -->
          <tr>
            <td style="padding:36px 40px 24px 40px; text-align:center;">
              <p style="font-family:'Playfair Display',Georgia,serif; font-size:18px; font-weight:500; color:#A88245; letter-spacing:0.18em; margin:0 0 22px;">
                R E C I R I N G
              </p>
              <p style="font-size:10px; font-weight:700; letter-spacing:0.28em; text-transform:uppercase; color:#C8A96A; margin:0 0 14px;">
                Registration Confirmed
              </p>
              <h1 style="font-family:'Playfair Display',Georgia,serif; font-size:28px; font-weight:500; color:#111111; margin:0 0 10px; letter-spacing:-0.01em; line-height:1.25;">
                You're in, ${safeName} 🎟
              </h1>
              <p style="font-size:15px; color:#4B5563; line-height:1.55; margin:0;">
                We've saved your spot for <strong style="color:#111111;">${safeTitle}</strong>.
              </p>
            </td>
          </tr>

          <!-- ── EVENT CARD ───────────────────────────────── -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF6EC; border:1px solid #E6D3A3; border-radius:16px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <p style="font-size:10px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#A88245; margin:0 0 12px;">
                      Event Details
                    </p>
                    <h2 style="font-family:'Playfair Display',Georgia,serif; font-size:20px; font-weight:500; color:#111111; margin:0 0 14px; line-height:1.3;">
                      ${safeTitle}
                    </h2>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0; font-size:13px; color:#6B7280; width:80px; vertical-align:top;">When</td>
                        <td style="padding:6px 0; font-size:14px; color:#111111; font-weight:500;">${safeWhen}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0; font-size:13px; color:#6B7280; vertical-align:top;">Where</td>
                        <td style="padding:6px 0; font-size:14px; color:#111111;">${safeWhere}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0; font-size:13px; color:#6B7280; vertical-align:top;">Host</td>
                        <td style="padding:6px 0; font-size:14px; color:#111111;">${safeHost}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0; font-size:13px; color:#6B7280; vertical-align:top;">Status</td>
                        <td style="padding:6px 0; font-size:14px; color:#166534; font-weight:600;">✓ Registered</td>
                      </tr>
                    </table>

                    ${safeDesc ? `
                    <p style="font-size:14px; color:#4B5563; line-height:1.6; margin:16px 0 0; padding-top:16px; border-top:1px solid #E6D3A3;">
                      ${safeDesc.replace(/\n/g, '<br>')}
                    </p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── CTA ─────────────────────────────────────── -->
          <tr>
            <td style="padding:0 40px 32px 40px; text-align:center;">
              <a href="${safeUrl}" style="display:inline-block; background:linear-gradient(135deg,#C8A96A 0%,#A88245 100%); color:#FFFFFF; text-decoration:none; font-weight:600; font-size:15px; padding:14px 32px; border-radius:12px; box-shadow:0 6px 20px rgba(200,169,106,0.35);">
                View event details →
              </a>
              <p style="font-size:12px; color:#9CA3AF; margin:14px 0 0; line-height:1.5;">
                Save the date and we'll see you there.
              </p>
            </td>
          </tr>

          <!-- ── FOOTER ─────────────────────────────────── -->
          <tr>
            <td style="padding:20px 40px 32px 40px; text-align:center; border-top:1px solid #F0ECE4;">
              <p style="font-size:11px; color:#9CA3AF; margin:0 0 8px; line-height:1.6;">
                Sent from Reciring — the Rotman peer network.
              </p>
              <p style="font-size:11px; color:#9CA3AF; margin:0; line-height:1.6;">
                <a href="${safeApp}" style="color:#A88245; text-decoration:none;">reciring.com</a>${safeUnsub ? `
                &nbsp;·&nbsp;
                <a href="${safeUnsub}" style="color:#9CA3AF; text-decoration:none;">Unsubscribe</a>` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}

function formatWhen(iso) {
  if (!iso) return 'Time TBD'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Time TBD'
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).replace(',', ' ·').replace(' at ', ' · ')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
