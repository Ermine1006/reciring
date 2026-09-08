import { supabase, isSupabaseConfigured } from './supabase'

export async function fetchRegistrationCount() {
  if (!isSupabaseConfigured) return null
  try {
    const { data, error } = await supabase.rpc('mutu_registration_count')
    return !error && Number.isSafeInteger(data) && data >= 0 ? data : null
  } catch { return null }
}
