import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

// True when real Supabase credentials are configured
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

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnon)
  : null
