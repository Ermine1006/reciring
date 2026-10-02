import { supabase, isSupabaseConfigured } from './supabase'
import { apiUrl } from './apiBase'
import { buildProfileContext } from './askMutuProfile'

export async function fetchAskMutuSharedProfiles(userId) {
  if (!isSupabaseConfigured || !userId) return { data: [], error: new Error('Shared profiles are unavailable.') }
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data?.session?.access_token || data.session.user?.id !== userId) {
      return { data: [], error: error || new Error('Please sign in again.') }
    }
    const response = await fetch(apiUrl('/api/shared-profiles'), {
      headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store',
    })
    const result = await response.json()
    if (!response.ok) return { data: [], error: new Error(result.error || 'Shared profiles could not load.') }
    return { data: Array.isArray(result.profiles) ? result.profiles : [], error: null }
  } catch (error) { return { data: [], error } }
}

export function buildSharedProfilesContext(rows = []) {
  return rows.map(row => ({ name: row.name, profile: buildProfileContext(row.profile) }))
}
