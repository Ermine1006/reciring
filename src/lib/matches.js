import { supabase, isSupabaseConfigured } from './supabase'

/**
 * Create a match: the current user (helper) picks up a post.
 * Returns { data: matchRow, error }
 */
export async function createMatch(helperUserId, post) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }

  // Upsert on the (post_id, helper_user_id) unique key. Picking up a post is
  // a one-sided, immediate connect — there's no "both must swipe" step. A
  // plain INSERT raised 23505 whenever the helper re-connected a post they had
  // previously unmatched (the soft-deleted row lingers), which surfaced as a
  // jarring "already picked up" alert and the connect silently doing nothing.
  // Upserting status back to 'active' cleanly REACTIVATES an unmatched row and
  // is a harmless no-op on an already-active one.
  const { data, error } = await supabase
    .from('matches')
    .upsert({
      post_id:           post.id,
      requester_user_id: post.created_by,
      helper_user_id:    helperUserId,
      status:            'active',
    }, { onConflict: 'post_id,helper_user_id' })
    .select()
    .single()

  return { data, error }
}

/**
 * Fetch all ACTIVE matches for the current user (as requester or helper).
 * Joins the related post so the UI can show the request context.
 * Returns { data: [matchRow], error }
 */
export async function fetchMyMatches(userId) {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('matches')
    .select(`
      *,
      post:posts (
        id, need_text, offer_text, help_type, industry_tag,
        time_commitment, urgency, created_by
      ),
      marketplace:event_marketplace_posts (
        id, type, title, description, event_id
      ),
      event:events (
        id, title
      )
    `)
    .or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`)
    .neq('status', 'unmatched')
    .order('created_at', { ascending: false })

  return { data: data || [], error }
}

/**
 * Fetch post IDs that have any active match involving the given user.
 * Used to hide already-matched posts from the Discover feed.
 */
export async function fetchMatchedPostIds(userId) {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('matches')
    .select('post_id')
    .or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`)
    .eq('status', 'active')

  if (error) return { data: [], error }
  // Marketplace matches have a null post_id — drop them (nothing to hide in Discover).
  return { data: (data || []).map(r => r.post_id).filter(Boolean), error: null }
}

/**
 * Fetch post IDs the user has previously unmatched.
 * Used to deprioritize (NOT hide) these posts in the Discover ranker —
 * they reappear but at the bottom of the feed.
 */
export async function fetchUnmatchedPostIds(userId) {
  if (!isSupabaseConfigured) return { data: [], error: null }

  const { data, error } = await supabase
    .from('matches')
    .select('post_id')
    .or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`)
    .eq('status', 'unmatched')

  if (error) return { data: [], error }
  return { data: (data || []).map(r => r.post_id), error: null }
}

/**
 * Unmatch — soft-delete by setting status to 'unmatched'.
 * Uses .select() to verify the row was actually updated (RLS can silently
 * block updates, returning no error but also no rows).
 */
export async function unmatchMatch(matchId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }

  const { data, error } = await supabase
    .from('matches')
    .update({ status: 'unmatched' })
    .eq('id', matchId)
    .select('id, status')

  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: new Error('Unmatch had no effect — the row was not updated. Check your DB CHECK constraint and RLS policies.') }
  }
  if (data[0].status !== 'unmatched') {
    return { error: new Error(`Status is "${data[0].status}" instead of "unmatched" — CHECK constraint may be blocking the value.`) }
  }
  return { error: null }
}

/**
 * Open (or create) a direct 1:1 chat with a person you met. Reuses an existing
 * match with that peer if one exists; otherwise creates an event-anchored
 * direct match, already identity-reveal-accepted (you met in person). Returns
 * { matchId }.
 */
export async function openOrCreateDirectMatch({ myId, peerId, eventId }) {
  if (!isSupabaseConfigured)   return { matchId: null, error: new Error('Supabase not configured') }
  if (!myId || !peerId)        return { matchId: null, error: new Error('missing ids') }
  if (myId === peerId)         return { matchId: null, error: new Error("can't message yourself") }

  const { data: existing } = await supabase
    .from('matches')
    .select('id, status')
    .or(`and(requester_user_id.eq.${myId},helper_user_id.eq.${peerId}),and(requester_user_id.eq.${peerId},helper_user_id.eq.${myId})`)
    .neq('status', 'unmatched')
    .limit(1)
  if (existing && existing.length) return { matchId: existing[0].id, error: null }

  const { data, error } = await supabase
    .from('matches')
    .insert({
      requester_user_id: myId,
      helper_user_id:    peerId,
      event_id:          eventId || null,
      status:            'active',
      identity_reveal_status:      'accepted',
      identity_reveal_accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) return { matchId: null, error }
  return { matchId: data.id, error: null }
}

/**
 * Map a DB match row to the shape consumed by MatchesList / ChatView.
 */
export function matchToUI(row, currentUserId) {
  const isHelper = row.helper_user_id === currentUserId
  const peerId = isHelper ? row.requester_user_id : row.helper_user_id

  const revealStatus = row.identity_reveal_status || 'none'
  const revealRequestedBy = row.identity_reveal_requested_by || null

  // A marketplace match (born from an Event Marketplace connection) has no
  // peer-networking post — its context is the marketplace need/offer. Flatten
  // it into the same `request` shape ChatView expects.
  const mkt = row.marketplace || null
  const request = mkt
    ? {
        id:       mkt.id,
        needs:    mkt.type === 'need'  ? mkt.title : null,
        offers:   mkt.type === 'offer' ? mkt.title : null,
        category: mkt.type === 'need' ? 'Looking for' : 'Offering',
        tags:     [],
        time:     '15 min',
        urgency:  null,
        description: mkt.description || '',
      }
    : (() => {
        const post = row.post || {}
        return {
          id:       post.id,
          needs:    post.need_text,
          offers:   post.offer_text,
          category: post.help_type?.[0] || 'Other',
          tags:     [...(post.help_type || []), ...(post.industry_tag || [])],
          time:     post.time_commitment || '15 min',
          urgency:  post.urgency,
        }
      })()

  return {
    id:              row.id,
    postId:          row.post_id,
    peerId,
    isHelper,
    status:          row.status,
    createdAt:       row.created_at,
    // Marketplace-match context (null for ordinary peer-networking matches).
    isMarketplace:   Boolean(mkt),
    eventId:         row.event_id || null,
    eventTitle:      row.event?.title || null,
    request,
    reveal: {
      status:           revealStatus,                 // 'none' | 'pending' | 'accepted' | 'declined'
      requestedBy:      revealRequestedBy,            // user id of initiator
      iAmRequester:     revealRequestedBy === currentUserId,
      requestedAt:      row.identity_reveal_requested_at || null,
      acceptedAt:       row.identity_reveal_accepted_at || null,
    },
  }
}

/**
 * Send (or re-send) a reveal request. Sets status='pending' and stamps
 * requested_by + requested_at. The DB trigger enforces requested_by === auth.uid().
 *
 * Returns { error } — no payload needed since realtime will sync state.
 */
export async function requestIdentityReveal(matchId, userId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }

  const { data, error } = await supabase
    .from('matches')
    .update({
      identity_reveal_status:       'pending',
      identity_reveal_requested_by: userId,
      identity_reveal_requested_at: new Date().toISOString(),
      identity_reveal_accepted_at:  null,
    })
    .eq('id', matchId)
    .select('id, identity_reveal_status')

  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: new Error('Reveal request had no effect — check RLS or the matches CHECK constraint.') }
  }
  return { error: null }
}

/**
 * Accept a pending reveal request. Trigger blocks the requester from
 * accepting their own request, so this is safe to call from either side
 * of the chat without a client-side check.
 */
export async function acceptIdentityReveal(matchId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }

  const { error } = await supabase
    .from('matches')
    .update({
      identity_reveal_status:      'accepted',
      identity_reveal_accepted_at: new Date().toISOString(),
    })
    .eq('id', matchId)

  return { error }
}

/**
 * Decline a pending reveal request. Resets accepted_at defensively.
 */
export async function declineIdentityReveal(matchId) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured.') }

  const { error } = await supabase
    .from('matches')
    .update({
      identity_reveal_status:      'declined',
      identity_reveal_accepted_at: null,
    })
    .eq('id', matchId)

  return { error }
}

/**
 * Fetch the peer's profile fields the UI shows when reveal is accepted.
 * Caller is responsible for only invoking this when status='accepted'.
 */
export async function fetchPeerProfile(peerUserId) {
  if (!isSupabaseConfigured || !peerUserId) return { data: null, error: null }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, avatar_url, program')
    .eq('id', peerUserId)
    .maybeSingle()

  return { data, error }
}
