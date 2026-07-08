// Event cancellation confirmation — transactional. Sent in two flows:
//
//   mode === 'self' — user unregistered themselves. Warm, "we'll miss
//                     you", CTA back to Discover events.
//   mode === 'host' — host cancelled the event. Apologetic, includes
//                     the host's cancellation reason if provided.
//
// Data:
//   displayName    — recipient's first name
//   mode           — 'self' | 'host'
//   eventTitle     — event title
//   eventStartAt   — ISO timestamp; formatted "Sat, Jul 12 · 6:30 PM"
//   eventLocation  — venue text (may be empty)
//   hostName       — host's display name
//   cancellationReason — free text (only used when mode='host')
//   eventUrl       — deep link back to the (cancelled) event detail page
//   appUrl         — app root URL for the footer
//   unsubscribeUrl — nullable

export function eventCancellationTemplate({
  displayName,
  mode = 'self',
  eventTitle,
  eventStartAt,
  eventLocation,
  hostName,
  cancellationReason,
  eventUrl,
  appUrl,
  unsubscribeUrl,
}) {
  const isHostCancel = mode === 'host'

  const safeName   = escapeHtml(displayName || 'there')
  const safeTitle  = escapeHtml(eventTitle || 'the event')
  const safeWhen   = escapeHtml(formatWhen(eventStartAt))
  const safeWhere  = escapeHtml(eventLocation || '—')
  const safeHost   = escapeHtml(hostName || 'the host')
  const safeReason = escapeHtml(cancellationReason || '')
  const safeUrl    = escapeHtml(eventUrl || appUrl || 'https://muturing.com')
  const safeApp    = escapeHtml(appUrl || 'https://muturing.com')
  const safeUnsub  = escapeHtml(unsubscribeUrl || '')

  const subject = isHostCancel
    ? `Cancelled: ${eventTitle || 'your event'}`
    : `You've unregistered from ${eventTitle || 'this event'}`

  const eyebrow = isHostCancel ? 'Event Cancelled' : 'Registration Cancelled'
  const headline = isHostCancel
    ? `${safeTitle} was cancelled`
    : `See you next time, ${safeName}`
  const lede = isHostCancel
    ? `The host has cancelled this event. Sorry for the inconvenience — we know how disappointing this can be.`
    : `We've removed you from <strong style="color:#111111;">${safeTitle}</strong>. If it was a mistake, you can rejoin from the event page.`

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

          <!-- HERO -->
          <tr>
            <td style="padding:36px 40px 24px 40px; text-align:center;">
              <p style="font-family:'Playfair Display',Georgia,serif; font-size:18px; font-weight:500; color:#A88245; letter-spacing:0.18em; margin:0 0 22px;">
                M U T U
              </p>
              <p style="font-size:10px; font-weight:700; letter-spacing:0.28em; text-transform:uppercase; color:#C8A96A; margin:0 0 14px;">
                ${escapeHtml(eyebrow)}
              </p>
              <h1 style="font-family:'Playfair Display',Georgia,serif; font-size:26px; font-weight:500; color:#111111; margin:0 0 10px; letter-spacing:-0.01em; line-height:1.25;">
                ${headline}
              </h1>
              <p style="font-size:15px; color:#4B5563; line-height:1.55; margin:0;">
                ${lede}
              </p>
            </td>
          </tr>

          <!-- EVENT CARD -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F9F7F4; border:1px solid #F0ECE4; border-radius:16px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="font-size:10px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#6B7280; margin:0 0 10px;">
                      Event Details
                    </p>
                    <h2 style="font-family:'Playfair Display',Georgia,serif; font-size:18px; font-weight:500; color:#111111; margin:0 0 12px; line-height:1.3; text-decoration:${isHostCancel ? 'line-through' : 'none'}; text-decoration-color:#9CA3AF;">
                      ${safeTitle}
                    </h2>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:4px 0; font-size:12px; color:#6B7280; width:70px; vertical-align:top;">When</td>
                        <td style="padding:4px 0; font-size:13px; color:#4B5563;">${safeWhen}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; font-size:12px; color:#6B7280; vertical-align:top;">Where</td>
                        <td style="padding:4px 0; font-size:13px; color:#4B5563;">${safeWhere}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; font-size:12px; color:#6B7280; vertical-align:top;">Host</td>
                        <td style="padding:4px 0; font-size:13px; color:#4B5563;">${safeHost}</td>
                      </tr>
                    </table>

                    ${isHostCancel && safeReason ? `
                    <p style="font-size:13px; color:#4B5563; line-height:1.55; margin:14px 0 0; padding-top:12px; border-top:1px solid #F0ECE4;">
                      <strong style="color:#111111;">Host's note:</strong> ${safeReason}
                    </p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 32px 40px; text-align:center;">
              <a href="${safeUrl}" style="display:inline-block; background:linear-gradient(135deg,#C8A96A 0%,#A88245 100%); color:#FFFFFF; text-decoration:none; font-weight:600; font-size:14px; padding:12px 28px; border-radius:12px; box-shadow:0 6px 20px rgba(200,169,106,0.35);">
                ${isHostCancel ? 'Discover other events' : 'View event page'} →
              </a>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:20px 40px 32px 40px; text-align:center; border-top:1px solid #F0ECE4;">
              <p style="font-size:11px; color:#9CA3AF; margin:0 0 8px; line-height:1.6;">
                Sent from Mutu — the Rotman peer network.
              </p>
              <p style="font-size:11px; color:#9CA3AF; margin:0; line-height:1.6;">
                <a href="${safeApp}" style="color:#A88245; text-decoration:none;">muturing.com</a>${safeUnsub ? `
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
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
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
