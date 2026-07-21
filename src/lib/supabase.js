import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnon) &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('your-') &&
  !supabaseAnon.includes('placeholder') &&
  !supabaseAnon.includes('your-')

console.log('[ReciRing] Supabase configured:', isSupabaseConfigured, {
  hasUrl: Boolean(supabaseUrl),
  hasKey: Boolean(supabaseAnon),
})
if (!isSupabaseConfigured) {
  console.warn('[ReciRing] Supabase env vars missing — running without auth. Restart `npm run dev` after editing .env.local.')
}

// HMR-safe singleton. Vite hot-reloads this module during dev, but the previous
// client's autoRefreshToken timer keeps running on the old instance, causing
// parallel refresh calls → 429 rate limit → forced SIGNED_OUT. We stash the
// instance on globalThis keyed by URL so HMR reuses it.
const CLIENT_KEY = `__reciring_supabase_${supabaseUrl || 'unconfigured'}__`

function getClient() {
  if (!isSupabaseConfigured) return null
  if (globalThis[CLIENT_KEY]) return globalThis[CLIENT_KEY]
  const client = createClient(supabaseUrl, supabaseAnon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'reciring-auth',
      flowType: 'pkce',
      // In the iOS WKWebView the page origin is capacitor://localhost, and
      // supabase-js's default cross-tab lock (navigator.locks) deadlocks under
      // a custom-scheme origin: signInWithPassword acquires the lock and never
      // releases it, so the button hangs on "Please wait…" forever while the
      // same call resolves normally on the web. The app is a single webview
      // with no cross-tab races, so a passthrough lock is safe here. Native
      // only — the web build keeps navigator.locks so multiple browser tabs
      // still serialise token refreshes.
      ...(Capacitor.isNativePlatform()
        ? { lock: async (_name, _acquireTimeout, fn) => fn() }
        : {}),
    },
  })
  globalThis[CLIENT_KEY] = client
  return client
}

export const supabase = getClient()
