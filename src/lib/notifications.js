import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Fetch the most recent N notifications for a user.
 * Returns newest first. Includes both read and unread.
 */
export async function fetchNotifications(userId, { limit = 30 } = {}) {
  if (!isSupabaseConfigured || !userId) return { data: [], error: null }

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

/**
 * Count unread notifications for the badge.
 * HEAD request — no payload, just the count.
 */
export async function fetchUnreadCount(userId) {
  if (!isSupabaseConfigured || !userId) return { count: 0, error: null }

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)

  if (error) return { count: 0, error }
  return { count: count || 0, error: null }
}

/**
 * Mark a single notification read.
 */
export async function markRead(notificationId) {
  if (!isSupabaseConfigured) return { error: null }
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)
  return { error }
}

/**
 * Mark all notifications read for a user.
 */
export async function markAllRead(userId) {
  if (!isSupabaseConfigured || !userId) return { error: null }
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
  return { error }
}

/**
 * Create a feedback_request notification for the current user.
 * Used by the post-match feedback prompt — the only client-side insert path
 * (RLS allows self-create only for type='feedback_request').
 *
 * Idempotent guard: skip if there's already an unread feedback_request
 * for the same match_id.
 */
export async function createFeedbackPrompt(userId, { matchId, peerName, postNeed }) {
  if (!isSupabaseConfigured || !userId || !matchId) {
    return { data: null, error: new Error('missing args') }
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'feedback_request')
    .is('read_at', null)
    .filter('payload->>match_id', 'eq', matchId)
    .limit(1)

  if (existing && existing.length > 0) {
    return { data: existing[0], error: null, skipped: true }
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type:    'feedback_request',
      title:   'Did you connect?',
      body:    postNeed
        ? `Tap to rate your exchange about "${postNeed.slice(0, 50)}"`
        : 'Tap to rate your match.',
      payload: { match_id: matchId, peer_name: peerName || null },
    })
    .select()
    .single()

  return { data, error }
}

/**
 * Subscribe to notifications for a user. Returns the channel so the
 * caller can remove it on cleanup.
 *
 * onInsert: fires for new rows (badge increments, toast/popup logic)
 * onUpdate: fires for read_at changes (sync cross-tab)
 */
export function subscribeNotifications(userId, { onInsert, onUpdate } = {}) {
  if (!isSupabaseConfigured || !userId) return null

  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert?.(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onUpdate?.(payload.new),
    )
    .subscribe()

  return channel
}

/**
 * Format a notification's relative timestamp.
 */
export function formatNotificationTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d`
  return `${Math.floor(d / 7)}w`
}
