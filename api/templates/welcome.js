// Welcome email — sent after a user completes onboarding.
//
// Template uses inline styles only (no <link>, no <style>) because
// Gmail / Outlook strip external CSS. Single-column, ~560px wide,
// renders cleanly in Apple Mail, Gmail web, Outlook, and mobile.
//
// Variables substituted from the `data` object:
//   data.displayName  — preferred name or email prefix
//   data.userEmail    — recipient address (shown in footer)
//   data.appUrl       — link target for the CTA button

export function welcomeTemplate({ displayName, userEmail, appUrl }) {
  const safeName = escapeHtml(displayName || 'there')
  const safeEmail = escapeHtml(userEmail || '')
  const safeUrl = escapeHtml(appUrl || 'https://reciring.com')

  const subject = `Welcome to Reciring, ${safeName}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Reciring</title>
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

          <!-- Header -->
          <tr>
            <td style="padding:40px 40px 24px 40px; text-align:center;">
              <p style="font-size:42px; line-height:1; margin:0 0 18px;">🤝</p>
              <h1 style="font-family:'Playfair Display',Georgia,serif; font-size:26px; font-weight:500; color:#A88245; margin:0 0 10px; letter-spacing:0.02em;">
                Welcome to Reciring
              </h1>
              <p style="font-size:15px; line-height:1.55; color:#6B7280; margin:0;">
                Hi ${safeName} — your profile is live and matching has started.
              </p>
            </td>
          </tr>

          <!-- Gold divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px; background:linear-gradient(90deg,transparent,#E6D3A3,transparent);"></div>
            </td>
          </tr>

          <!-- First-steps section -->
          <tr>
            <td style="padding:28px 40px 8px;">
              <p style="font-size:11px; letter-spacing:0.18em; text-transform:uppercase; font-weight:600; color:#C8A96A; margin:0 0 16px;">
                First steps
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:12px 0; vertical-align:top;">
                    <p style="font-size:14px; color:#111111; font-weight:600; margin:0 0 4px;">1 · Browse Discover</p>
                    <p style="font-size:13px; color:#6B7280; line-height:1.55; margin:0;">
                      See what your peers need. Swipe right when you can help — your reputation grows with every match.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0; vertical-align:top; border-top:1px solid #F0ECE4;">
                    <p style="font-size:14px; color:#111111; font-weight:600; margin:0 0 4px;">2 · Post a request</p>
                    <p style="font-size:13px; color:#6B7280; line-height:1.55; margin:0;">
                      Ask for an intro, a referral, a coffee chat. The clearer the ask, the better the match.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0; vertical-align:top; border-top:1px solid #F0ECE4;">
                    <p style="font-size:14px; color:#111111; font-weight:600; margin:0 0 4px;">3 · Stay anonymous</p>
                    <p style="font-size:13px; color:#6B7280; line-height:1.55; margin:0;">
                      Identities only reveal when both sides agree. Build trust first — exchange later.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 40px 40px; text-align:center;">
              <a href="${safeUrl}" style="display:inline-block; padding:14px 40px; background:#A88245; background-image:linear-gradient(135deg,#C8A96A 0%,#A88245 100%); color:#FFFFFF; text-decoration:none; border-radius:12px; font-size:14px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;">
                Open Reciring
              </a>
              <p style="font-size:11px; color:#9CA3AF; margin:14px 0 0;">
                Or paste this into your browser: <span style="color:#6B7280;">${safeUrl}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px; background:#FAFAF8; border-top:1px solid #F0ECE4;">
              <p style="font-size:11px; color:#9CA3AF; line-height:1.6; margin:0; text-align:center;">
                You're receiving this because you signed up for Reciring with <span style="color:#6B7280;">${safeEmail}</span>.<br>
                Reciring Team · A Rotman MBA community for warm introductions.
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

// Minimal HTML escape — prevents injection via user-supplied display names.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
