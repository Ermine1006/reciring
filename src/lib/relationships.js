import { supabase, isSupabaseConfigured } from './supabase'
import { fetchMyMatches, matchToUI } from './matches'
import { fetchBlockedIds } from './safety'
import { VISIBILITY_PUBLIC } from './visibility'

// ── Unified relationship service (read-only, derived) ────────────────────
// Mutu keeps two separate memories of the same person: the `matches` spine
// (Community match / identity reveal / chat) and the `event_encounters` spine
// (who you actually met). My Network historically read ONLY the second, so a
// person you matched or chatted with never appeared.
//
// This module derives one relationship per related user id by querying the
// records that already exist. It creates NO new tables and writes NOTHING —
// consolidation happens in-query, keyed on stable user ids (never names).
//
//   • Matched / Revealed / Chatted → a "connection" (you know them)
//   • A real event_encounters row   → "met" (surfaced by eventMemory elsewhere)
//
// Terminology stays strict: a connection is someone you KNOW, not someone you
// MET. Only an encounter promotes a person to "recently met".

// Strongest signal wins for a person's headline status.
const STATUS_RANK = { chatted: 3, revealed: 2, matched: 1 }

function contextLabel(status, identityKnown) {
  if (status === 'chatted')  return "You've chatted"
  if (status === 'revealed') return 'Identity revealed'
  return identityKnown ? 'Matched in Community' : 'Matched · identity hidden'
}

// Small guard: Supabase `.in()` on an empty array is wasteful/ambiguous.
const nonEmpty = (arr) => Array.isArray(arr) && arr.length > 0

/**
 * People you KNOW but have not necessarily met: accepted matches, revealed
 * identities, and real conversations — minus anyone you've blocked and minus
 * anyone already recorded as an in-person encounter (those are "recently met").
 *
 * Returns { data: [{
 *   peerId, matchId, status, context, identityKnown,
 *   name, avatarUrl, program, lastInteractionAt
 * }], error }
 * Sorted newest-interaction first. `name`/`avatarUrl`/`program` are null when
 * the peer's identity is not authorized to this user (still anonymous).
 */
export async function fetchConnections(userId) {
  if (!isSupabaseConfigured || !userId) return { data: [], error: null }

  const [{ data: matches, error: mErr }, { data: blocked }, metIds] = await Promise.all([
    fetchMyMatches(userId),
    fetchBlockedIds(userId),
    fetchMetUserIds(userId),
  ])
  if (mErr) return { data: [], error: mErr }

  const blockedSet = new Set(blocked || [])
  const metSet = new Set(metIds || [])

  // Reduce raw match rows → one candidate per peer (strongest, newest).
  const byPeer = new Map()
  const matchIds = []
  for (const row of matches || []) {
    if (row.status === 'unmatched' || row.status === 'cancelled') continue
    const ui = matchToUI(row, userId)
    const peerId = ui.peerId
    if (!peerId || peerId === userId) continue
    if (blockedSet.has(peerId)) continue
    if (metSet.has(peerId)) continue            // already "met" → Recently met, not here
    matchIds.push(row.id)
    const revealed = ui.reveal?.status === 'accepted'
    const prev = byPeer.get(peerId)
    const at = row.created_at || null
    if (!prev) {
      byPeer.set(peerId, { peerId, matchId: row.id, revealed, lastInteractionAt: at })
    } else {
      if (revealed) prev.revealed = true
      if (at && (!prev.lastInteractionAt || at > prev.lastInteractionAt)) {
        prev.lastInteractionAt = at; prev.matchId = row.id
      }
    }
  }
  if (byPeer.size === 0) return { data: [], error: null }

  // Which of these matches have real message history → "chatted".
  const chattedMatchIds = await fetchMatchIdsWithMessages(matchIds)
  // Re-scan matches so any of a peer's matches having messages marks them chatted.
  const chattedPeers = new Set()
  for (const row of matches || []) {
    if (chattedMatchIds.has(row.id)) {
      const ui = matchToUI(row, userId)
      if (ui.peerId) chattedPeers.add(ui.peerId)
    }
  }

  // Peer identities (respecting privacy). Public profile or accepted reveal ⇒ known.
  const peerIds = Array.from(byPeer.keys())
  const profById = await fetchProfiles(peerIds)

  const out = []
  for (const c of byPeer.values()) {
    const prof = profById[c.peerId] || null
    const isPublic = prof?.visibility === VISIBILITY_PUBLIC
    const identityKnown = c.revealed || isPublic
    const status = chattedPeers.has(c.peerId) ? 'chatted' : (c.revealed ? 'revealed' : 'matched')
    out.push({
      peerId: c.peerId,
      matchId: c.matchId,
      status,
      context: contextLabel(status, identityKnown),
      identityKnown,
      name:      identityKnown ? (prof?.name || 'Member') : null,
      avatarUrl: identityKnown ? (prof?.avatar_url || null) : null,
      program:   identityKnown ? (prof?.program || null) : null,
      lastInteractionAt: c.lastInteractionAt,
    })
  }
  out.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]
    || String(b.lastInteractionAt || '').localeCompare(String(a.lastInteractionAt || '')))
  return { data: out, error: null }
}

/**
 * The set of user ids the current user KNOWS — accepted/active matches, revealed
 * identities, real conversations, AND prior in-person encounters — minus blocks.
 * This is what Event screens intersect with an attendee list to say "N people
 * you know are attending". Returns { data: Set<string>, error }.
 */
export async function fetchKnownPeopleIds(userId) {
  if (!isSupabaseConfigured || !userId) return { data: new Set(), error: null }
  const [{ data: matches }, { data: blocked }, metIds] = await Promise.all([
    fetchMyMatches(userId),
    fetchBlockedIds(userId),
    fetchMetUserIds(userId),
  ])
  const blockedSet = new Set(blocked || [])
  const known = new Set()
  for (const row of matches || []) {
    if (row.status === 'unmatched' || row.status === 'cancelled') continue
    const peerId = row.helper_user_id === userId ? row.requester_user_id : row.helper_user_id
    if (peerId && peerId !== userId) known.add(peerId)
  }
  for (const id of metIds || []) known.add(id)
  for (const b of blockedSet) known.delete(b)
  known.delete(userId)
  return { data: known, error: null }
}

/**
 * Cross-source milestones for one person — the Community/chat/reveal history
 * that the encounter store alone can't show. Returned oldest-first so a
 * relationship detail can render them as one chronological timeline above the
 * event encounters. Only the current user's own matches are read.
 *
 * Returns { data: [{ kind, label, date, color }], error }.
 */
export async function fetchRelationshipTimeline(userId, peerId) {
  if (!isSupabaseConfigured || !userId || !peerId) return { data: [], error: null }
  const { data: matches } = await supabase
    .from('matches')
    .select('id, status, created_at, identity_reveal_status, identity_reveal_accepted_at')
    .or(`and(requester_user_id.eq.${userId},helper_user_id.eq.${peerId}),and(requester_user_id.eq.${peerId},helper_user_id.eq.${userId})`)
    .neq('status', 'unmatched')
    .order('created_at', { ascending: true })

  const items = []
  const matchIds = (matches || []).map(m => m.id)
  if (matches && matches.length) {
    items.push({ kind: 'matched', label: 'Matched in Community', date: matches[0].created_at, color: '#4B5A8A' })
    const revealed = matches.find(m => m.identity_reveal_status === 'accepted' && m.identity_reveal_accepted_at)
    if (revealed) items.push({ kind: 'revealed', label: 'Identity revealed', date: revealed.identity_reveal_accepted_at, color: '#7C5CBF' })
  }
  if (nonEmpty(matchIds)) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('created_at')
      .in('match_id', matchIds)
      .order('created_at', { ascending: true })
      .limit(1)
    if (msgs && msgs.length) items.push({ kind: 'chatted', label: 'Started a conversation', date: msgs[0].created_at, color: '#2C7A6B' })
  }
  items.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  return { data: items, error: null }
}

// ── Internal helpers (each a single, cheap query) ────────────────────────

async function fetchMetUserIds(userId) {
  if (!isSupabaseConfigured || !userId) return []
  const { data } = await supabase
    .from('event_encounters')
    .select('encountered_user_id')
    .eq('user_id', userId)
    .not('encountered_user_id', 'is', null)
  return Array.from(new Set((data || []).map(r => r.encountered_user_id).filter(Boolean)))
}

async function fetchMatchIdsWithMessages(matchIds) {
  if (!nonEmpty(matchIds)) return new Set()
  const { data } = await supabase
    .from('messages')
    .select('match_id')
    .in('match_id', matchIds)
  return new Set((data || []).map(r => r.match_id))
}

async function fetchProfiles(ids) {
  if (!nonEmpty(ids)) return {}
  const { data } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, program, visibility')
    .in('id', ids)
  return Object.fromEntries((data || []).map(p => [p.id, p]))
}
