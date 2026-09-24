import { supabase, isSupabaseConfigured } from './supabase'

export async function fetchFinancePracticeSupport() {
  if (!isSupabaseConfigured) return { supported: false }
  try {
    const { data, error } = await supabase.rpc('practice_finance_supported')
    return { supported: !error && data === true, error }
  } catch (error) { return { supported: false, error } }
}
