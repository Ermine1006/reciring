import { createClient } from '@supabase/supabase-js'

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
    },
  })
  globalThis[CLIENT_KEY] = client
  return client
}

export const supabase = getClient()
