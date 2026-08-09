import { supabase, isSupabaseConfigured } from './supabase'

// ── Event preparation · "My goal for this event" ─────────────────────
// Private per-user multi-select goals, stored in event_goals. Looking-for /
// can-offer live in the Event Marketplace (see lib/marketplace.js) so the
// Opportunity Board stays the single source of truth.

// The canonical goal options shown on the Prepare page.
export const GOAL_OPTIONS = [
  { id: 'find_collaborators', label: 'Meet collaborators' },
  { id: 'learn',              label: 'Learn' },
  { id: 'explore',            label: 'Explore' },
]

export async function fetchEventGoals(eventId, userId) {
  if (!isSupabaseConfigured || !eventId || !userId) return { goals: [], error: null }
  const { data, error } = await supabase
    .from('event_goals')
    .select('goals')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { goals: [], error }
  return { goals: data?.goals || [], error: null }
}

// Upsert the user's goal selection for an event.
export async function saveEventGoals(eventId, userId, goals) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  if (!eventId || !userId)   return { error: new Error('Missing event or user') }
  const { error } = await supabase
    .from('event_goals')
    .upsert(
      { event_id: eventId, user_id: userId, goals: goals || [], updated_at: new Date().toISOString() },
      { onConflict: 'event_id,user_id' },
    )
  return { error }
}
