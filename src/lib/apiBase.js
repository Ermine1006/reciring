// Base origin for the Vercel API routes under /api.
//
// On the web build VITE_API_BASE_URL is unset, so this stays empty and
// every call keeps using a relative path against whatever origin served
// the page — unchanged behaviour.
//
// The Capacitor iOS build has no such origin: the page loads from the
// local bundle, so a relative '/api/...' resolves inside the app and
// never reaches Vercel. There VITE_API_BASE_URL points at the deployed
// web app domain (https://reciring.com — the Vercel deployment, NOT the
// muturing.com marketing site, which has no /api routes).
//
// Client-only: uses import.meta.env, so do not import this from api/*.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export function apiUrl(path) {
  return `${API_BASE}${path}`
}
