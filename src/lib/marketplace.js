import { supabase, isSupabaseConfigured } from './supabase'
import { logPromoConnectionIfAttributed } from './discoverPromos'

// ── Event Marketplace · client data layer ────────────────────────────
// Backed by scripts/migration-event-marketplace.sql. Browsing goes through
// the anonymised `event_marketplace_feed` view (program + industry only, no
// name/email/avatar). Interest acceptance is handled by a DB trigger that
// creates the match + system message + notifications; the client just flips
// the interest status and refetches.

const POST_COLS = 'id, event_id, user_id, type, title, description, tags, urgency, status, created_at, updated_at, promote_to_discover'

// Anonymous feed for an event, newest first. Excludes my own posts (those come
// from fetchMyMarketplacePosts) so the "Browse" list is only other people.
export async function fetchMarketplaceFeed(eventId, myUserId) {
  if (!isSupabaseConfigured || !eventId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('event_marketplace_feed')
    .select('id, event_id, user_id, type, title, description, tags, urgency, status, created_at, poster_program, poster_headline, poster_industry')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) return { data: [], error }
  const rows = (data || []).filter(r => r.user_id !== myUserId)
  return { data: rows, error: null }
}

// My own posts for this event (the base table; RLS lets me read my own).
export async function fetchMyMarketplacePosts(eventId, userId) {
  if (!isSupabaseConfigured || !eventId || !userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('event_marketplace_posts')
    .select(POST_COLS)
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

export async function createMarketplacePost({ eventId, userId, type, title, description, tags, urgency, promoteToDiscover = false }) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured') }
  if (!eventId || !userId)   return { data: null, error: new Error('Missing event or user') }
  if (!['need', 'offer'].includes(type)) return { data: null, error: new Error('Bad post type') }
  if (!title?.trim())        return { data: null, error: new Error('Add a short title') }
  const { data, error } = await supabase
    .from('event_marketplace_posts')
    .insert({
      event_id:    eventId,
      user_id:     userId,
      type,
      title:       title.trim().slice(0, 120),
      description: String(description || '').trim().slice(0, 600),
      tags:        (tags || []).slice(0, 8),
      urgency:     urgency?.trim() ? urgency.trim().slice(0, 40) : null,
      promote_to_discover: Boolean(promoteToDiscover),
    })
    .select(POST_COLS)
    .single()
  if (error && error.code === '23505') {
    return { data: null, error: new Error(`You already have a ${type === 'need' ? '“Looking for”' : '“Offering”'} post for this event. Edit it instead.`) }
  }
  return { data, error }
}

export async function updateMarketplacePost(id, { title, description, tags, urgency, promoteToDiscover }) {
  if (!isSupabaseConfigured || !id) return { error: new Error('Missing post') }
  const patch = { updated_at: new Date().toISOString() }
  if (title       !== undefined) patch.title       = String(title).trim().slice(0, 120)
  if (description !== undefined) patch.description = String(description || '').trim().slice(0, 600)
  if (tags        !== undefined) patch.tags        = (tags || []).slice(0, 8)
  if (urgency     !== undefined) patch.urgency     = urgency?.trim() ? urgency.trim().slice(0, 40) : null
  if (promoteToDiscover !== undefined) patch.promote_to_discover = Boolean(promoteToDiscover)
  const { error } = await supabase.from('event_marketplace_posts').update(patch).eq('id', id)
  return { error }
}

export async function deleteMarketplacePost(id) {
  if (!isSupabaseConfigured || !id) return { error: new Error('Missing post') }
  const { error } = await supabase.from('event_marketplace_posts').delete().eq('id', id)
  return { error }
}

// I (requester) express interest in someone else's post.
export async function expressInterest({ postId, eventId, ownerId, requesterId }) {
  if (!isSupabaseConfigured) return { error: new Error('Supabase not configured') }
  if (!postId || !eventId || !ownerId || !requesterId) return { error: new Error('Missing ids') }
  const { error } = await supabase
    .from('event_marketplace_interest')
    .insert({ post_id: postId, event_id: eventId, owner_id: ownerId, requester_id: requesterId })
  if (error && error.code === '23505') return { error: null, already: true } // already interested = fine
  // Funnel tracking: a promo-originated user reaching out in the marketplace
  // is the acquisition payoff. Best-effort, only counted when attributed.
  if (!error) logPromoConnectionIfAttributed(requesterId, eventId, postId).catch(() => {})
  return { error }
}

// The interests I (as requester) have expressed in this event — so the feed can
// show "Interest sent" and hide the button on posts I already pinged.
export async function fetchMyInterests(eventId, userId) {
  if (!isSupabaseConfigured || !eventId || !userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('event_marketplace_interest')
    .select('id, post_id, status, match_id')
    .eq('event_id', eventId)
    .eq('requester_id', userId)
  return { data: data || [], error }
}

// Interests in MY posts (as owner), requester shown anonymously (program +
// industry). Drives the counts + the accept/decline manage sheet.
export async function fetchInterestsForOwner(eventId, userId) {
  if (!isSupabaseConfigured || !eventId || !userId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('event_marketplace_interest_view')
    .select('id, post_id, requester_id, owner_id, status, match_id, created_at, requester_program, requester_headline, requester_industry')
    .eq('event_id', eventId)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  return { data: data || [], error }
}

// Owner accepts → DB trigger creates the match + system message + notifies both.
// Returns { matchId } once the back-linked match id is available.
export async function acceptInterest(interestId) {
  if (!isSupabaseConfigured || !interestId) return { error: new Error('Missing interest') }
  const { error } = await supabase
    .from('event_marketplace_interest')
    .update({ status: 'accepted' })
    .eq('id', interestId)
  if (error) return { error }
  // The trigger fills match_id; read it back (best-effort, one retry).
  for (let i = 0; i < 2; i++) {
    const { data } = await supabase
      .from('event_marketplace_interest')
      .select('match_id')
      .eq('id', interestId)
      .maybeSingle()
    if (data?.match_id) return { error: null, matchId: data.match_id }
  }
  return { error: null, matchId: null }
}

export async function declineInterest(interestId) {
  if (!isSupabaseConfigured || !interestId) return { error: new Error('Missing interest') }
  const { error } = await supabase
    .from('event_marketplace_interest')
    .update({ status: 'declined' })
    .eq('id', interestId)
  return { error }
}

export async function cancelInterest(interestId) {
  if (!isSupabaseConfigured || !interestId) return { error: new Error('Missing interest') }
  const { error } = await supabase
    .from('event_marketplace_interest')
    .update({ status: 'cancelled' })
    .eq('id', interestId)
  return { error }
}

// Host dashboard: interest counts (host-scoped aggregate view).
export async function fetchMarketplaceInterestStats(eventId) {
  if (!isSupabaseConfigured || !eventId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('event_marketplace_interest_stats')
    .select('event_id, interest_count, accepted_count')
    .eq('event_id', eventId)
    .maybeSingle()
  return { data, error }
}
