import { supabase, isSupabaseConfigured } from '../supabase'
import { apiUrl } from '../apiBase'

export async function buddyRpc(name, args = {}) {
  if (!isSupabaseConfigured) throw new Error('Buddy Program is not available yet.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Please try again.')
  return data
}
export async function analyzeBuddyPost(need, offer, experience) {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(apiUrl('/api/buddy-analyze'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
    body: JSON.stringify({ need, offer, experience }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Please select your support topics below.')
  return result
}
