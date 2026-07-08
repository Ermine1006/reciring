// Central brand + email configuration. Single source of truth for the
// sender identity, product URL fallback, and support address so a
// future domain change only touches this file.
//
// Imported by BOTH client (AdminEmailComposer/Preview, LoginScreen)
// and server (api/broadcast.js, api/send-email.js, api/_templates/*).
// Server-side files import via `../src/lib/branding.js` — same pattern
// already used for src/lib/emailBlocks.js from api/_templates/.
//
// The APP_URL constant is a FALLBACK only — production sets APP_URL in
// Vercel env vars, and every consumer prefers process.env.APP_URL over
// this fallback. Leaving the fallback correct means:
//   • local dev + preview builds still surface the right domain
//   • templates rendered in a headless test context still produce a
//     usable URL rather than a bare '/' path
//
// EMAIL_FROM is the RFC 5322 mailbox used in the Resend From header.
// The friendly-name half ("Mutu") is what appears in inbox previews;
// the local-part half ("hello@muturing.com") must be an address on a
// Resend-verified domain or the send fails with a 403.

export const APP_URL         = 'https://muturing.com'
export const EMAIL_FROM      = 'Mutu <hello@muturing.com>'
export const EMAIL_FROM_ADDR = 'hello@muturing.com'
export const SUPPORT_EMAIL   = 'hello@muturing.com'
