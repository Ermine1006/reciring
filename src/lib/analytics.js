import { supabase, isSupabaseConfigured } from './supabase'

// ── Matching-funnel analytics · client tracker (Phase 1.1) ───────────
//
// One tiny fire-and-forget helper. Writes an append-only row to the
// `funnel_events` table (see scripts/migration-funnel-events.sql).
//
// Design rules (match the rest of the data layer):
//   • No-op when Supabase isn't configured (dev / demo builds).
//   • No-op when no user is signed in — RLS requires auth.uid() = user_id,
//     so an anonymous insert would be rejected anyway.
//   • Never awaited by callers, never throws: analytics must never block
//     the UI or turn a tracking hiccup into a user-visible error. Mirrors
//     the `notifyNewMatch(...).catch(() => {})` fire-and-forget pattern.
//
// The funnel:
//   discover_card_exposed → discover_card_opened → discover_swipe_right
//   → match_created → we_met_tapped → exchange_completed

export function track(eventName, properties = {}) {
  if (!isSupabaseConfigured || !eventName) return
  // Kick off async work but do NOT return the promise — callers stay sync.
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return
      await supabase.from('funnel_events').insert({
        user_id: userId,
        event_name: eventName,
        properties,
      })
    } catch {
      /* swallow — analytics must never affect the user experience */
    }
  })()
}
