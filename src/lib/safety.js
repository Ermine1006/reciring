import { supabase, isSupabaseConfigured } from './supabase'

// ── Reports ─────────────────────────────────────────────────────
export async function submitReport({ reporterId, reportedUserId, reportedPostId, reason, details }) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id:      reporterId,
      reported_user_id: reportedUserId || null,
      reported_post_id: reportedPostId || null,
      reason,
      details: details || null,
    })
    .select()
    .single()
  return { data, error }
}

// ── Blocks ──────────────────────────────────────────────────────
export async function blockUser({ blockerId, blockedUserId }) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
  const { data, error } = await supabase
    .from('blocks')
    .insert({ blocker_id: blockerId, blocked_user_id: blockedUserId })
    .select()
    .single()
  return { data, error }
}

export async function unblockUser({ blockerId, blockedUserId }) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_user_id', blockedUserId)
  return { error }
}

export async function fetchBlockedIds(blockerId) {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_user_id')
    .eq('blocker_id', blockerId)
  return { data: (data || []).map(r => r.blocked_user_id), error }
}
