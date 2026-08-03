import { supabase, isSupabaseConfigured } from './supabase'

// ── Discover ← Event Marketplace promotion · client data layer ───────────
// Backed by scripts/migration-discover-event-promos.sql. Reads the
// anonymised, consent-gated `discover_event_promos` view (program /
// headline / industry only — never name, email, or avatar) and records the
// acquisition funnel into `event_promo_events`.
//
// The view already enforces every gate server-side (both consent flags,
// upcoming + not-full + still-registering). The client only shapes the rows
// for the Discover deck and dedupes to one card per event.

const VIEW_COLS = [
  'post_id', 'event_id', 'type', 'title', 'description_preview', 'tags', 'urgency', 'post_created_at',
  'poster_program', 'poster_headline', 'poster_industry',
  'event_title', 'event_start_at', 'event_category', 'event_location', 'event_image_url',
  'max_attendees', 'event_status', 'attendee_visibility', 'attendee_count',
].join(', ')

/**
 * Fetch promotable event-marketplace previews for the Discover deck.
 *
 * Returns at most ONE card per event (requirement: avoid showing multiple
 * posts from the same event in one session). We keep the newest active post
 * per event as its representative preview.
 *
 * @returns {Promise<{ data: Array, error: Error|null }>}
 */
export async function fetchDiscoverEventPromos({ joinedEventIds = new Set(), excludeUserId = null } = {}) {
  if (!isSupabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('discover_event_promos')
    .select(VIEW_COLS)
    .order('event_start_at', { ascending: true })
    .order('post_created_at', { ascending: false })
  if (error) return { data: [], error }

  // Never recommend the viewer their OWN post. The promo view doesn't expose
  // author identity (by design), so we resolve the viewer's own post ids
  // separately (RLS lets them read their own) and filter those out.
  let myPostIds = new Set()
  if (excludeUserId) {
    const { data: mine } = await supabase
      .from('event_marketplace_posts')
      .select('id')
      .eq('user_id', excludeUserId)
    myPostIds = new Set((mine || []).map(r => r.id))
  }

  // One card per PERSON per event — the same attendee's "Looking for" and
  // "Offering" belong on a single combined card, never split into two. The
  // promo view is anonymised (no user_id), so we group by event + the
  // anonymised identity fields; promotion is opt-in and rare, so this reliably
  // pairs one person's two posts. Rows arrive newest-first, so the first row
  // seen per type is the one we keep. Own posts are dropped first.
  const groups = new Map()
  for (const r of data || []) {
    if (myPostIds.has(r.post_id)) continue
    const indStr = Array.isArray(r.poster_industry) ? r.poster_industry.join(',') : (r.poster_industry || '')
    const key = `${r.event_id}::${r.poster_program || ''}::${r.poster_headline || ''}::${indStr}`
    let g = groups.get(key)
    if (!g) { g = {}; groups.set(key, g) }
    if (!g[r.type]) g[r.type] = r          // keep newest per type
  }

  const cards = []
  for (const g of groups.values()) {
    cards.push(shapePromoCard(g, joinedEventIds))
  }
  return { data: cards, error: null }
}

// Map a person's grouped rows ({ need?, offer? }) → the combined card shape the
// Discover deck + EventPreviewCard consume. Event facts + anonymised identity
// come from whichever row exists; need/offer previews are carried side by side.
function shapePromoCard(group, joinedEventIds) {
  const need = group.need || null
  const offer = group.offer || null
  const r = need || offer                  // representative row (shared fields)
  const remaining = r.max_attendees != null
    ? Math.max(0, r.max_attendees - (r.attendee_count || 0))
    : null
  const previewOf = (p) => p && ({
    postId:  p.post_id,
    title:   p.title,
    preview: p.description_preview || '',
    tags:    p.tags || [],
    urgency: p.urgency || null,
  })
  const idPart = [need?.post_id, offer?.post_id].filter(Boolean).sort().join('-')
  return {
    kind:        'event_promo',            // deck discriminator — NOT a normal post
    id:          `promo:${r.event_id}:${idPart}`,
    postId:      r.post_id,                // representative — for funnel logging + avatar seed
    eventId:     r.event_id,
    joined:      Boolean(joinedEventIds.has(r.event_id)),
    // Combined ask + offer preview (either may be null)
    need:        previewOf(need),
    offer:       previewOf(offer),
    // Anonymised attendee identity (mirrors the in-event marketplace)
    posterProgram:  r.poster_program || null,
    posterHeadline: r.poster_headline || null,
    posterIndustry: r.poster_industry || null,
    // Event facts
    eventTitle:    r.event_title,
    eventStartAt:  r.event_start_at,
    eventCategory: r.event_category || null,
    eventLocation: r.event_location || null,
    eventImageUrl: r.event_image_url || null,
    attendeeCount: r.attendee_count || 0,
    maxAttendees:  r.max_attendees ?? null,
    spotsLeft:     remaining,
    attendeeVisibility: r.attendee_visibility || 'public',
  }
}

/**
 * Record a funnel event. Best-effort — never throws into the UI.
 * @param {string} userId
 * @param {{ eventId: string, postId?: string|null, kind: string }} evt
 */
export async function logPromoEvent(userId, { eventId, postId = null, kind }) {
  if (!isSupabaseConfigured || !userId || !eventId || !kind) return { error: null }
  const { error } = await supabase
    .from('event_promo_events')
    .insert({ user_id: userId, event_id: eventId, post_id: postId, kind })
  if (error) console.warn('[discoverPromos] logPromoEvent failed:', error.message)
  return { error }
}

// Did this user reach this event through the Discover promo funnel? True once
// they have any prior funnel row (impression / detail_open / join) for it — so
// downstream connections can be attributed to promotion. Best-effort.
export async function hasPromoFunnel(userId, eventId) {
  if (!isSupabaseConfigured || !userId || !eventId) return false
  const { count } = await supabase
    .from('event_promo_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_id', eventId)
  return (count || 0) > 0
}

// Log a promo-attributed marketplace connection — but only when the requester
// actually arrived via a promo (avoids counting organic marketplace activity).
export async function logPromoConnectionIfAttributed(userId, eventId, postId = null) {
  if (!(await hasPromoFunnel(userId, eventId))) return { error: null, attributed: false }
  const { error } = await logPromoEvent(userId, { eventId, postId, kind: 'marketplace_connection' })
  return { error, attributed: !error }
}
