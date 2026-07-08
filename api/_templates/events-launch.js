// Events Launch announcement — premium product-update email.
//
// Modeled after Stripe / Notion / Linear release emails: hero,
// feature card, primary CTA, product screenshot, founder note,
// footer. Brand: Reciring gold/cream throughout, single column,
// 560px wide, inline styles only (Gmail / Outlook / Apple Mail
// safe). Subject + body are NOT user-editable — admin sends as-is
// (like the Welcome template).
//
// IMPORTANT — swap SCREENSHOT_URL with a hosted image of the
// Events page before broadcasting. Recommended hosts:
//   - Supabase Storage public bucket
//   - Vercel deployment static asset (place file in /public/)
//   - Any CDN with HTTPS + persistent URL
// If you leave the placeholder, the section still renders but the
// image will fail to load in recipient inboxes.
const SCREENSHOT_URL = 'https://muturing.com/email-assets/events-launch.png'

export function eventsLaunchTemplate({ userEmail, appUrl, unsubscribeUrl }) {
  const safeEmail = escapeHtml(userEmail || '')
  const safeUrl   = escapeHtml(appUrl || 'https://muturing.com')
  const safeUnsub = escapeHtml(unsubscribeUrl || '')
  const safeShot  = escapeHtml(SCREENSHOT_URL)

  const subject = 'Events are now live on Mutu 🎉'

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

          <!-- ── HERO ──────────────────────────────────────── -->
          <tr>
            <td style="padding:36px 40px 28px 40px; text-align:center;">
              <!-- Logo wordmark -->
              <p style="font-family:'Playfair Display',Georgia,serif; font-size:18px; font-weight:500; color:#A88245; letter-spacing:0.18em; margin:0 0 22px;">
                M U T U
              </p>
              <!-- Eyebrow label -->
              <p style="font-size:10px; font-weight:700; letter-spacing:0.28em; text-transform:uppercase; color:#C8A96A; margin:0 0 14px;">
                Community Update
              </p>
              <!-- Headline -->
              <h1 style="font-family:'Playfair Display',Georgia,serif; font-size:32px; font-weight:500; color:#111111; margin:0 0 12px; letter-spacing:-0.01em; line-height:1.2;">
                Events are now live 🎉
              </h1>
              <!-- Subheadline -->
              <p style="font-size:15px; line-height:1.55; color:#6B7280; margin:0 auto; max-width:420px;">
                Create meetups, coffee chats, fitness sessions, and community gatherings.
              </p>
            </td>
          </tr>

          <!-- ── FEATURE CARD ─────────────────────────────── -->
          <tr>
            <td style="padding:8px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF6EC; border:1px solid #E6D3A3; border-radius:16px;">
                <tr>
                  <td style="padding:22px 24px 22px;">
                    <p style="font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#A88245; margin:0 0 10px;">
                      🎉 New Feature
                    </p>
                    <p style="font-size:18px; font-weight:600; color:#3D3020; margin:0 0 8px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Events
                    </p>
                    <p style="font-size:14px; line-height:1.55; color:#6B5A40; margin:0 0 16px;">
                      Create and join events across the community.
                    </p>
                    <p style="font-size:11px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:#A88245; margin:0 0 8px;">
                      Examples
                    </p>
                    <ul style="margin:0; padding:0 0 0 18px; color:#3D3020; font-size:14px; line-height:1.85;">
                      <li>Coffee chats</li>
                      <li>Networking meetups</li>
                      <li>Volleyball games</li>
                      <li>Startup &amp; VC discussions</li>
                      <li>Yoga and fitness sessions</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── PRIMARY CTA ──────────────────────────────── -->
          <tr>
            <td style="padding:26px 40px 28px; text-align:center;">
              <a href="${safeUrl}" style="display:inline-block; padding:15px 36px; background:#A88245; background-image:linear-gradient(135deg,#C8A96A 0%,#A88245 100%); color:#FFFFFF; text-decoration:none; border-radius:12px; font-size:14px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">
                Create Your First Event
              </a>
            </td>
          </tr>

          <!-- ── SCREENSHOT ───────────────────────────────── -->
          <tr>
            <td style="padding:0 32px 8px;">
              <a href="${safeUrl}" style="display:block; text-decoration:none;">
                <img
                  src="${safeShot}"
                  alt="The Mutu Events page"
                  width="100%"
                  style="display:block; width:100%; height:auto; max-width:496px; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04); border:0;"
                />
              </a>
              <p style="font-size:12px; font-style:italic; color:#9CA3AF; text-align:center; margin:12px 0 0;">
                See what's happening in the community.
              </p>
            </td>
          </tr>

          <!-- ── FOUNDER NOTE ─────────────────────────────── -->
          <tr>
            <td style="padding:32px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFAF8; border-left:3px solid #C8A96A; border-radius:0 12px 12px 0;">
                <tr>
                  <td style="padding:20px 22px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
                      <tr>
                        <td style="vertical-align:middle;">
                          <div style="width:34px; height:34px; border-radius:50%; background:#FBF6EC; border:1.5px solid #E6D3A3; text-align:center; line-height:34px; font-size:14px; font-weight:700; color:#A88245; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                            S
                          </div>
                        </td>
                        <td style="vertical-align:middle; padding-left:10px;">
                          <p style="font-size:13px; font-weight:600; color:#111111; margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                            Serine
                          </p>
                          <p style="font-size:11px; color:#9CA3AF; margin:1px 0 0; letter-spacing:0.08em; text-transform:uppercase; font-weight:600;">
                            Founder · Mutu
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="font-size:13.5px; line-height:1.65; color:#3D3020; margin:0; font-style:italic;">
                      "Thank you for being one of our earliest members. Your feedback continues to shape Mutu, and we're excited to keep building alongside this community."
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── FOOTER ───────────────────────────────────── -->
          <tr>
            <td style="padding:28px 40px 32px;">
              <div style="height:1px; background:linear-gradient(90deg,transparent,#E6D3A3,transparent); margin-bottom:18px;"></div>
              <p style="font-size:11px; color:#9CA3AF; line-height:1.6; margin:0; text-align:center;">
                Sent to <span style="color:#6B7280;">${safeEmail}</span> · Mutu Team
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

  return { subject, html }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
