import { Capacitor } from '@capacitor/core'

// True only inside the Capacitor native shell (iOS app), false on the web
// build served from a browser. Drives every place where the redirect target
// or the OAuth mechanism has to differ between the two.
export const isNativeApp = Capacitor.isNativePlatform()

// Custom URL scheme registered in Info.plist. iOS hands a
// com.muturing.mutu://… URL back to the app, which is how OAuth and the
// email links return into the native shell instead of a browser tab.
export const APP_SCHEME = 'com.muturing.mutu'

// Canonical https origin of the deployed web app. Used where a link must be a
// real web URL even when generated inside the native shell — namely email
// links, which mail clients (Outlook especially) refuse to open with a custom
// scheme. window.location.origin can't be used from the app: there it is
// capacitor://localhost, which Supabase rejects, falling back to the Site URL
// and dropping the path (so a reset link lands on the homepage, not
// /reset-password).
export const WEB_ORIGIN = 'https://reciring.com'

// Redirect target for OAuth, where returning into the app itself matters. On
// web this stays the live origin so nothing about the existing flow changes;
// in the app it becomes the custom scheme, which Supabase must also allow-list.
//   '/auth/callback' -> 'com.muturing.mutu://auth/callback'
export function authRedirect(path) {
  const clean = path.startsWith('/') ? path : `/${path}`
  return isNativeApp
    ? `${APP_SCHEME}:/${clean}`
    : `${window.location.origin}${clean}`
}

// Redirect target for email links: always the https web app, on both
// platforms, since the click happens in a mail client outside the app.
export function emailRedirect(path) {
  const clean = path.startsWith('/') ? path : `/${path}`
  return isNativeApp ? `${WEB_ORIGIN}${clean}` : `${window.location.origin}${clean}`
}
