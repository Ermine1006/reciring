// Welcome email — sent on first profile creation (i.e. first sign-in).
//
// Vision-led copy: leads with WHY Reciring exists ("making invisible
// networks visible") rather than a feature tour. Target length ~200
// words including footer. Single-column, inline styles only — same
// rendering envelope as before for Gmail/Outlook/Apple Mail.
//
// Variables substituted from the `data` object:
//   data.displayName    — preferred name or email prefix
//   data.userEmail      — recipient address (shown in footer)
//   data.appUrl         — link target for the CTA button
//   data.unsubscribeUrl — full HMAC-signed unsubscribe URL (optional)

export function welcomeTemplate({ displayName, userEmail, appUrl, unsubscribeUrl }) {
  const safeName  = escapeHtml(displayName || 'there')
  const safeEmail = escapeHtml(userEmail || '')
  const safeUrl   = escapeHtml(appUrl || 'https://muturing.com')
  const safeUnsub = escapeHtml(unsubscribeUrl || '')

  const subject = `Welcome to Mutu, ${safeName}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Mutu</title>
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
            <td style="padding:40px 40px 22px 40px; text-align:center;">
              <p style="font-size:42px; line-height:1; margin:0 0 18px;">🤝</p>
              <h1 style="font-family:'Playfair Display',Georgia,serif; font-size:26px; font-weight:500; color:#A88245; margin:0 0 10px; letter-spacing:0.02em;">
                Welcome to Mutu
              </h1>
              <p style="font-size:15px; line-height:1.55; color:#6B7280; margin:0;">
                Hi ${safeName} — your profile is now live and ready to connect with the community.
              </p>
            </td>
          </tr>

          <!-- Gold divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px; background:linear-gradient(90deg,transparent,#E6D3A3,transparent);"></div>
            </td>
          </tr>

          <!-- Why Reciring? -->
          <tr>
            <td style="padding:24px 40px 8px;">
              <div style="background:#FBF6EC; border:1px solid #E6D3A3; border-radius:14px; padding:20px 22px;">
                <p style="font-size:11px; letter-spacing:0.18em; text-transform:uppercase; font-weight:600; color:#C8A96A; margin:0 0 10px;">
                  Why Mutu?
                </p>
                <p style="font-size:14px; line-height:1.6; color:#3D3020; margin:0 0 10px; font-weight:600;">
                  The most valuable opportunities often come from people you don't know yet.
                </p>
                <p style="font-size:13.5px; line-height:1.6; color:#6B5A40; margin:0;">
                  Mutu helps uncover the expertise, experience, and opportunities hidden within your community — making invisible networks visible and useful.
                </p>
              </div>
            </td>
          </tr>

          <!-- First steps -->
          <tr>
            <td style="padding:24px 40px 8px;">
              <p style="font-size:11px; letter-spacing:0.18em; text-transform:uppercase; font-weight:600; color:#C8A96A; margin:0 0 14px;">
                First steps
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:12px 0; vertical-align:top;">
                    <p style="font-size:14px; color:#111111; font-weight:600; margin:0 0 4px;">1 · Explore opportunities</p>
                    <p style="font-size:13px; color:#6B7280; line-height:1.55; margin:0;">
                      See where you can help and discover people you may never have met otherwise.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0; vertical-align:top; border-top:1px solid #F0ECE4;">
                    <p style="font-size:14px; color:#111111; font-weight:600; margin:0 0 4px;">2 · Ask for what you need</p>
                    <p style="font-size:13px; color:#6B7280; line-height:1.55; margin:0;">
                      Coffee chats, referrals, industry insights, project partners — the clearer the ask, the better the match.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0; vertical-align:top; border-top:1px solid #F0ECE4;">
                    <p style="font-size:14px; color:#111111; font-weight:600; margin:0 0 4px;">3 · Connect safely</p>
                    <p style="font-size:13px; color:#6B7280; line-height:1.55; margin:0;">
                      Your identity stays private until both sides agree to reveal themselves.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:26px 40px 36px; text-align:center;">
              <a href="${safeUrl}" style="display:inline-block; padding:14px 40px; background:#A88245; background-image:linear-gradient(135deg,#C8A96A 0%,#A88245 100%); color:#FFFFFF; text-decoration:none; border-radius:12px; font-size:14px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;">
                Start Exploring
              </a>
              <p style="font-size:11px; color:#9CA3AF; margin:14px 0 0;">
                Or paste this into your browser: <span style="color:#6B7280;">${safeUrl}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:22px 40px 28px; background:#FAFAF8; border-top:1px solid #F0ECE4;">
              <p style="font-size:12px; color:#A88245; font-weight:600; line-height:1.5; margin:0 0 4px; text-align:center;">
                Privacy first.
              </p>
              <p style="font-size:11px; color:#9CA3AF; line-height:1.6; margin:0 0 10px; text-align:center;">
                Your identity remains hidden until both parties agree to reveal themselves.
              </p>
              <p style="font-size:11px; color:#9CA3AF; line-height:1.6; margin:0 0 4px; text-align:center;">
                You're receiving this because you signed up for Mutu with <span style="color:#6B7280;">${safeEmail}</span>.<br>
                Mutu Team · A Rotman MBA community for warm introductions.
              </p>
              ${safeUnsub ? `<p style="font-size:11px; color:#9CA3AF; line-height:1.6; margin:6px 0 0; text-align:center;">
                Prefer fewer emails? <a href="${safeUnsub}" style="color:#A88245; text-decoration:underline;">Unsubscribe from non-essential mail</a>.
              </p>` : ''}
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
