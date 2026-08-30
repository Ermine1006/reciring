import { broadLabelsOf, getCareerFocusLabel } from '../data/careerFocus'

// ── Community network graph: pure data shaping ───────────────────────
// Builds the {nodes, edges} model CommunityNetworkGraph renders. Pure
// functions only (no fetching, no DOM) so the privacy rules are unit-
// testable: nothing anonymous, nothing pre-acceptance, nothing from
// another community ever becomes a node or an edge.
//
// LIVE-DATA CONTRACT (what exists today): every read the frontend has
// is self-scoped by RLS (my matches, my encounters, my practice
// edges), so the live graph is the SIGNED-IN USER'S confirmed circle.
// A community-WIDE graph (all members' mutual edges + origins +
// depth) needs a new aggregate read model — see the delivery report.

// Where a connection began → its colour. (Matcha / muted gold / soft
// purple; Together is internally 'practice' but never labelled so.)
export const ORIGIN_META = {
  discover: { label: 'Discover', color: '#6E7F4A' },
  event:    { label: 'Event',    color: '#B98F35' },
  together: { label: 'Together', color: '#8B7BB8' },
}

/** "Daniel Lee" → "Daniel L" (first name + last initial, never more). */
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}`
}

/** Circle initials: "Daniel Lee" → "DL". */
export function nodeInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '·'
}

/** Verified-exchange count → capped stroke width (spec tiers; never a rank).
 *  0 → 1.25 · 1 → 2 · 2-3 → 3 · 4-6 → 4.5 · 7+ → 6 (hard cap). */
export function edgeWidth(verified) {
  const v = Math.max(0, Number(verified) || 0)
  if (v >= 7) return 6
  if (v >= 4) return 4.5
  if (v >= 2) return 3
  if (v >= 1) return 2
  return 1.25
}

/** Gold shared-token markers for one edge.
 *  0 → none · 1 → one · 2-3 → that many · 4+ → capped at 3 plus a ×N label. */
export function tokenMarkers(tokenCount) {
  const t = Math.max(0, Number(tokenCount) || 0)
  return { moving: Math.min(t, 3), label: t >= 4 ? `×${t}` : null }
}

/** How one edge should move. Tokens animate ONLY when real, and in a
 *  dense graph only on the signed-in user's / selected relationships;
 *  reduced motion always renders static double-ring markers. */
export function edgeMotionPolicy({ tokens = 0, reduced = false, dense = false, focused = true } = {}) {
  if (!tokens || tokens <= 0) return 'none'
  if (reduced) return 'static'
  if (dense && !focused) return 'static'
  return 'animate'
}

/** Compact member-visible relationship explanation lines.
 *  e.g. Met through Event / 6 verified exchanges /
 *       Strengthened through Together ×4 and Discover ×1 /
 *       Last verified exchange: Aug 20 */
export function relationshipSummary(edge) {
  const channel = (o) => (o === 'together' ? 'Together' : o === 'event' ? 'Event' : 'Discover')
  const lines = [`Met through ${channel(edge.origin)}`]
  const v = edge.verified ?? 0
  lines.push(`${v} verified exchange${v === 1 ? '' : 's'}`)
  const others = Object.entries(edge.breakdown || {})
    .filter(([k]) => k !== edge.origin)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${channel(k)} ×${n}`)
  if (others.length > 0) {
    lines.push(`Strengthened through ${others.length === 2 ? others.join(' and ') : others.join(', ')}`)
  }
  if (edge.lastAt) {
    const d = new Date(edge.lastAt)
    if (!Number.isNaN(d.getTime())) {
      lines.push(`Last verified exchange: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
    }
  }
  return lines
}

/**
 * Build MY CIRCLE from the self-scoped reads — using the SAME
 * relationship definitions as the Community Map, so the same pair
 * always shows the same origin, verified count and token count in
 * both views:
 *
 *   MUTUAL CONNECTION (draws the line)
 *     together — a pairing that was ever ACCEPTED (accepted/ended)
 *     discover — a non-practice match with a two-sided signal:
 *                reveal accepted, smart_match, or both confirmed
 *                "We met" (bothConfirmedMatchIds)
 *     event    — encounters at status mutually_confirmed
 *   VERIFIED EXCHANGE — practice tokens + both-confirmed matches +
 *     mutually confirmed encounters
 *   TOKENS — a verified Together session and a both-confirmed
 *     Discover exchange each mint one shared Token. Meeting at an
 *     event does not: meeting is not a completed exchange.
 *
 * Unilateral rows (a swipe on a real-name post, a one-sided event
 * capture, reveal='none') NEVER appear (tested).
 */
export function buildPersonalGraph({
  userId, userName = 'You',
  pairings = [], practiceEdges = [], matches = [],
  bothConfirmedMatchIds = new Set(), encounters = [],
  namesById = {}, communityId = null,
}) {
  const nodes = new Map()   // peerId → node
  const edges = new Map()   // peerId → edge (ego graph: one edge per peer)

  const touch = (peerId, name) => {
    if (!peerId || peerId === userId || !name) return null
    if (!nodes.has(peerId)) nodes.set(peerId, { id: peerId, name, tokens: null })
    if (!edges.has(peerId)) {
      edges.set(peerId, {
        a: 'me', b: peerId, state: 'mutual', origin: null,
        verified: 0, depth: 0, tokens: 0, breakdown: {}, firstAt: null, lastAt: null,
      })
    }
    return edges.get(peerId)
  }
  const connect = (peerId, name, src, at) => {
    const e = touch(peerId, name)
    if (!e) return
    const t = at ? new Date(at).getTime() : Infinity
    if (!e.origin || t < e._originAt || (t === e._originAt && src < e.origin)) {
      e.origin = src
      e._originAt = t
      e.firstAt = at || e.firstAt
    }
  }
  const verify = (peerId, src, cnt, lastAt, mintsTokens = false) => {
    const e = edges.get(peerId)
    if (!e) return
    e.verified += cnt
    e.depth = e.verified
    e.breakdown[src] = (e.breakdown[src] || 0) + cnt
    if (mintsTokens) e.tokens += cnt
    if (lastAt && (!e.lastAt || new Date(lastAt) > new Date(e.lastAt))) e.lastAt = lastAt
  }

  // together: ever-accepted partnerships draw the line…
  for (const pr of pairings) {
    if (communityId && pr.community_id && pr.community_id !== communityId) continue
    if (!['accepted', 'ended'].includes(pr.status) || !pr.accepted_at) continue
    const peer = pr.counterpart_user_id
    connect(peer, namesById[peer]?.name, 'together', pr.accepted_at)
  }
  // …and verified sessions add exchanges AND minted tokens
  for (const t of practiceEdges) {
    if (communityId && t.community_id !== communityId) continue
    const peer = t.user_lo === userId ? t.user_hi : t.user_lo
    connect(peer, namesById[peer]?.name, 'together', t.first_verified_at)
    verify(peer, 'together', t.verified_exchange_count || 1, t.last_verified_at, true)
  }

  // event: mutually confirmed only
  for (const enc of encounters) {
    if (enc.status !== 'mutually_confirmed' || !enc.encountered_user_id) continue
    const at = enc.confirmed_at || enc.created_at
    connect(enc.encountered_user_id, enc.display_name, 'event', at)
    verify(enc.encountered_user_id, 'event', 1, at, false)
  }

  // discover: two-sided signals only
  for (const m of matches) {
    if ((m.source || 'community') === 'practice') continue
    if (!['active', 'completed'].includes(m.status || 'active')) continue
    const peer = m.requester_user_id === userId ? m.helper_user_id : m.requester_user_id
    const both = bothConfirmedMatchIds.has(m.id)
    const mutual = m.identity_reveal_status === 'accepted' || m.source === 'smart_match' || both
    if (!mutual) continue                               // unilateral: never shown
    const at = m.identity_reveal_accepted_at || m.created_at
    connect(peer, namesById[peer]?.name, 'discover', at)
    // both confirmed a completed exchange → one shared Token, exactly
    // like a verified Together session (scripts/migration-discover-tokens.sql)
    if (both) verify(peer, 'discover', 1, m.created_at, true)
  }

  const cleanEdges = [...edges.values()]
    .filter((e) => e.origin)
    .map(({ _originAt, ...e }) => e)
  const keep = new Set(cleanEdges.map((e) => e.b))
  return {
    me: { id: 'me', name: userName },
    meId: 'me',
    nodes: [...nodes.values()].filter((n) => keep.has(n.id)),
    edges: cleanEdges,
  }
}

/** Edges surviving a source filter ('all' | 'discover' | 'event' | 'together'). */
export function filterEdges(edges, filter) {
  if (!filter || filter === 'all') return edges
  return edges.filter((e) => e.origin === filter)
}

/** Node ids adjacent to `id` (plus itself) — the highlight set. */
export function neighbourIds(edges, id) {
  const out = new Set([id])
  for (const e of edges) {
    if (e.a === id) out.add(e.b)
    if (e.b === id) out.add(e.a)
  }
  return out
}

/** Deterministic 0..1 hash so layout is stable across renders. */
export function seed01(str) {
  let h = 2166136261
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 10000) / 10000
}

// ── "Public status, private relationships" ──────────────────────────
// The Community Map never receives pair edges: the browser gets the
// community_map_summary contract (members + Career-Focus clusters +
// AGGREGATE cluster links) and, separately, my_relationship_graph —
// ONLY the signed-in user's own relationships, with exact tokens.

// Evidence-backed public identity. THRESHOLDS MIRROR THE SQL in
// scripts/migration-community-network-graph.sql — keep in sync.
export const BADGE_META = {
  first_exchange:        { label: 'First Exchange' },
  contributor:           { label: 'Contributor' },
  community_contributor: { label: 'Community Contributor' },
  trusted_collaborator:  { label: 'Trusted Collaborator' },
  community_builder:     { label: 'Community Builder' },
}
export const TIER_META = {
  new:         { label: null },                    // no halo, no label
  contributor: { label: 'Contributor' },
  established: { label: 'Reliable Partner' },
  builder:     { label: 'Community Builder' },
}

/** Per-member public status from verified behaviour ONLY (mirrors the
 *  SQL). stats = {verifiedTotal, verifiedPartners, repeatPartners,
 *  crossCircles, partnerCircles, hasFocus}. Never from swipes,
 *  profile picks, messages or pending activity. */
export function memberStatus(stats = {}) {
  const v = stats.verifiedTotal || 0
  const partners = stats.verifiedPartners || 0
  const repeats = stats.repeatPartners || 0
  const cross = stats.crossCircles || 0
  const badges = []
  if (v >= 1) badges.push('first_exchange')
  if (v >= 3) badges.push('contributor')
  if (partners >= 5) badges.push('community_contributor')
  if (repeats >= 3) badges.push('trusted_collaborator')
  if (v >= 10) badges.push('community_builder')
  return {
    tier: v >= 10 ? 'builder' : v >= 3 ? 'established' : v >= 1 ? 'contributor' : 'new',
    badges,
    // conservative Community Connector approximation — documented in
    // the migration; NOT betweenness centrality, never a ranking
    connector: partners >= 3 && cross >= 2,
    circleCount: (stats.partnerCircles || 0) + (stats.hasFocus ? 1 : 0),
  }
}

/** Private relationship state shown only to participants. */
export function relationshipStateLabel(verified) {
  const v = Math.max(0, Number(verified) || 0)
  if (v >= 4) return 'Established'
  if (v >= 1) return 'Growing'
  return 'New'
}

/** The next milestone for ONE relationship, shown only to its two
 *  participants. Null once Established: no invented progress. */
export function relationshipNextStep(verified) {
  const v = Math.max(0, Number(verified) || 0)
  if (v === 0) return 'Verify an exchange together to start building this'
  if (v < 4) {
    const n = 4 - v
    return `${n} more verified exchange${n === 1 ? '' : 's'} to reach Established`
  }
  return null
}

/** Locate me insight, derived from the caller's OWN relationships.
 *  The bridge sentence appears only when real topology supports it:
 *  verified relationships reaching two or more distinct circles. It
 *  is never inferred from the user's own profile categories. */
export function locateInsight({ edges = [], focusByPeer = {}, communityName = 'Rotman' } = {}) {
  const circles = new Set()
  const verifiedCircles = new Set()
  for (const e of edges) {
    const peer = e.a === 'me' ? e.b : e.a
    const f = focusByPeer[peer]
    if (!f) continue
    circles.add(f)
    if ((e.verified || 0) >= 1) verifiedCircles.add(f)
  }
  const people = edges.length
  const spans = [...verifiedCircles].sort()
  return {
    title: `Your place in ${communityName}`,
    line: `${people} ${people === 1 ? 'person' : 'people'} in your circle`
      + (circles.size > 0
          ? ` · connected across ${circles.size} focus area${circles.size === 1 ? '' : 's'}`
          : ''),
    bridge: spans.length >= 2 ? `You help connect ${spans[0]} and ${spans[1]}.` : null,
  }
}

/** Private milestone nudge for the signed-in user ONLY — never shown
 *  to other members (§8). Calm, no urgency, null when nothing near. */
export function nextMilestone(verifiedTotal) {
  const v = Math.max(0, Number(verifiedTotal) || 0)
  if (v === 0) return 'Complete your first verified exchange to earn First Exchange.'
  if (v < 3) {
    const n = 3 - v
    return `Complete ${n} more verified exchange${n === 1 ? '' : 's'} to become a Contributor.`
  }
  if (v < 10) {
    const n = 10 - v
    return `Complete ${n} more verified exchange${n === 1 ? '' : 's'} to become a Community Builder.`
  }
  return null
}

/** Aggregate ribbon strength → soft path width (never a rank). */
export function ribbonWidth(tier) {
  return [5, 8, 11, 15, 19][Math.max(0, Math.min(4, Number(tier) || 0))]
}

// community_map_summary(uuid) payload → render model. Contains NO pair
// edges, NO pair token counts, NO dates and NO identities by contract —
// this normaliser only ever reads aggregate and public-status fields.
// Members stay unnamed here; a name reaches the map layer only through
// the caller's own private graph (Locate me).
export function normalizeMapSummary(payload) {
  if (!payload || !Array.isArray(payload.members)) return null
  const members = payload.members.map((m) => ({
    id: m.node_key,
    isSelf: Boolean(m.is_self),
    // identity arrives per viewer: the RPC nulls name and avatar for
    // anyone the caller has not unlocked bilaterally
    unlocked: Boolean(m.is_identity_unlocked),
    name: m.is_identity_unlocked ? (m.display_name || null) : null,
    avatarUrl: m.is_identity_unlocked ? (m.avatar_url || null) : null,
    focusKey: m.broad_career_focus || 'other',
    industry: getCareerFocusLabel(m.broad_career_focus) || 'Other',
    tier: m.public_contribution_tier || 'new',
    badges: Array.isArray(m.public_badges) ? m.public_badges : [],
    connector: Boolean(m.is_community_connector),
    circleCount: m.connected_circle_count ?? 0,
  }))
  const links = (payload.cluster_links || []).map((l) => ({
    a: l.cluster_a, b: l.cluster_b,
    aLabel: getCareerFocusLabel(l.cluster_a) || 'Other',
    bLabel: getCareerFocusLabel(l.cluster_b) || 'Other',
    connections: l.mutual_connection_count || 0,
    verified: l.verified_exchange_count || 0,
    tier: l.strength_tier ?? 0,
  }))
  return {
    meId: members.find((m) => m.isSelf)?.id || null,
    members, links,
    clusters: (payload.clusters || []).map((c) => ({
      key: c.career_focus_key || 'other',
      label: getCareerFocusLabel(c.career_focus_key) || 'Other',
      members: c.member_count || 0,
      connections: c.mutual_connection_count || 0,
      verified: c.verified_exchange_count || 0,
    })),
    suppressedLinks: payload.suppressed_link_count ?? 0,
    summary: {
      name: payload.community?.community_name || '',
      members: payload.community?.member_count ?? members.length,
      connections: payload.community?.mutual_connection_count ?? 0,
      verifiedTotal: payload.community?.verified_exchange_count ?? null,
      strengthened30d: payload.community?.relationships_strengthened_30d ?? null,
    },
  }
}

/** Aggregate paths must not point at a specific pair: a field pair is
 *  publishable only when BOTH circles hold at least MIN_CIRCLE
 *  members. Mirrors the SQL suppression exactly. */
export const MIN_CIRCLE = 3
export function publishableLinks(links, clusters) {
  const size = new Map((clusters || []).map((c) => [c.label ?? c.key, c.members || 0]))
  const ok = (l) => (size.get(l.aLabel) || 0) >= MIN_CIRCLE && (size.get(l.bLabel) || 0) >= MIN_CIRCLE
  return { shown: (links || []).filter(ok), suppressed: (links || []).filter((l) => !ok(l)).length }
}

// my_relationship_graph(uuid) payload → the signed-in user's private
// ego graph. Every row is caller-participant by contract; peer ids are
// the SAME opaque node keys the map uses, so Locate me can overlay
// these edges onto the community layout.
export function normalizeMyGraph(payload, { userName = 'You' } = {}) {
  if (!payload || !Array.isArray(payload.edges)) return null
  const nodes = []
  const edges = payload.edges.map((e) => {
    nodes.push({
      id: e.other_node_key,
      name: e.display_name || null,
      avatarUrl: e.avatar_url || null,
      industry: getCareerFocusLabel(e.broad_career_focus) || 'Other',
      tokens: null,
    })
    const verified = e.verified_exchange_count ?? 0
    return {
      a: 'me', b: e.other_node_key, state: 'mutual',
      origin: e.origin_source,
      breakdown: e.source_breakdown || {},
      verified, depth: verified,
      tokens: e.token_count ?? 0,
      tier: e.strength_tier ?? 0,
      firstAt: e.first_connected_at || null,
      lastAt: e.last_verified_at || null,
    }
  })
  return { me: { id: 'me', name: userName }, meId: 'me', nodes, edges, tokensKnown: true }
}

/**
 * Community aggregation over a full edge list — the SAME maths the
 * community_map_summary SQL performs server-side. In production this
 * runs ONLY in the database (the browser never holds the edge list);
 * here it powers demo mode and lets tests prove the aggregate counts
 * are real (derived, never invented).
 */
export function aggregateMapSummary(graph, { name = 'Rotman' } = {}) {
  const focusOf = (n) => canonicalIndustry(n.industry) || 'Other'
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const unlockedIds = neighbourIds(graph.edges, graph.meId)
  const stats = new Map(graph.nodes.map((n) => [n.id, {
    verifiedTotal: 0, verifiedPartners: 0, repeatPartners: 0,
    partnerFocus: new Set(),
  }]))
  for (const e of graph.edges) {
    for (const [self, peer] of [[e.a, e.b], [e.b, e.a]]) {
      const s = stats.get(self)
      if (!s || !byId.has(peer)) continue
      s.verifiedTotal += e.verified
      if (e.verified >= 1) {
        s.verifiedPartners += 1
        s.partnerFocus.add(focusOf(byId.get(peer)))
      }
      if (e.verified >= 2) s.repeatPartners += 1
    }
  }
  const members = graph.nodes.map((n) => {
    const s = stats.get(n.id)
    const own = focusOf(n)
    const status = memberStatus({
      verifiedTotal: s.verifiedTotal,
      verifiedPartners: s.verifiedPartners,
      repeatPartners: s.repeatPartners,
      crossCircles: [...s.partnerFocus].filter((f) => f !== own).length,
      partnerCircles: s.partnerFocus.size,
      hasFocus: true,
    })
    // identity per viewer, exactly like the live contract: unlocked
    // only for me and the people I am directly connected to
    const unlocked = n.id === graph.meId || unlockedIds.has(n.id)
    return {
      id: n.id, isSelf: n.id === graph.meId, unlocked,
      name: unlocked ? (n.name || null) : null,
      avatarUrl: unlocked ? (n.avatarUrl || null) : null,
      focusKey: own, industry: own, ...status,
    }
  })
  const linkMap = new Map()
  const clusterMap = new Map()
  for (const m of members) {
    const c = clusterMap.get(m.industry) || { label: m.industry, key: m.industry, members: 0, connections: 0, verified: 0 }
    c.members += 1
    clusterMap.set(m.industry, c)
  }
  for (const e of graph.edges) {
    const fa = focusOf(byId.get(e.a)), fb = focusOf(byId.get(e.b))
    if (fa === fb) {
      const c = clusterMap.get(fa)
      if (c) { c.connections += 1; c.verified += e.verified }
      continue
    }
    const [lo, hi] = [fa, fb].sort()
    const k = `${lo}|${hi}`
    const l = linkMap.get(k) || { a: lo, b: hi, aLabel: lo, bLabel: hi, connections: 0, verified: 0 }
    l.connections += 1
    l.verified += e.verified
    linkMap.set(k, l)
  }
  const allLinks = [...linkMap.values()].map((l) => ({
    ...l,
    tier: l.verified >= 7 ? 4 : l.verified >= 4 ? 3 : l.verified >= 2 ? 2 : l.verified >= 1 ? 1 : 0,
  }))
  const clusters = [...clusterMap.values()]
  const { shown: links, suppressed } = publishableLinks(allLinks, clusters)
  return {
    meId: graph.meId,
    members, links, clusters,
    suppressedLinks: suppressed,
    summary: {
      name,
      members: members.length,
      connections: graph.edges.length,
      verifiedTotal: graph.edges.reduce((s2, e) => s2 + e.verified, 0),
      // demo only, derived from the demo arrays and labelled DEMO DATA
      strengthened30d: graph.edges.filter((e) => e.verified >= 1).length,
    },
  }
}

/** Where an aggregate path should start and stop: at the EDGE of each
 *  Career Focus field, never at a person. Given two field ellipses it
 *  returns the trimmed endpoints plus a gentle control point. */
export function ribbonPath(a, b, { padA = 0, padB = 0 } = {}) {
  const dx = b.x - a.x, dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  // inset by each field's radius along the connecting direction
  const ra = Math.min(d * 0.42, (a.rx || 0) * Math.abs(ux) + (a.ry || 0) * Math.abs(uy) + padA)
  const rb = Math.min(d * 0.42, (b.rx || 0) * Math.abs(ux) + (b.ry || 0) * Math.abs(uy) + padB)
  const x1 = a.x + ux * ra, y1 = a.y + uy * ra
  const x2 = b.x - ux * rb, y2 = b.y - uy * rb
  const mx = (x1 + x2) / 2 + (y1 - y2) * 0.16
  const my = (y1 + y2) / 2 + (x2 - x1) * 0.16
  return { d: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`, x1, y1, x2, y2, mx, my }
}

/** Verified depth around one node (drives the capped node-size bump). */
export function nodeDepth(edges, id) {
  return edges.reduce((s, e) => s + (e.a === id || e.b === id ? (e.verified ?? e.depth ?? 0) : 0), 0)
}

// ── Bridge detection (topology utility; tests + demo only) ──────────
// LIVE Bridge / Community Connector status comes from the server-side
// privacy-safe aggregate (community_map_summary) — the browser never
// holds the community edge list, so it could not compute this anyway.
// A member is a Bridge when removing them splits their neighbourhood
// into >= 2 otherwise-disconnected clusters (articulation point), each
// side holding >= 2 members. Skipped entirely below the conservative
// size threshold, and the raw structure count is only used for the
// "across N community circles" copy — no scores, no rankings.
export function detectBridges(nodes, edges, { minNodes = 8, minEdges = 8 } = {}) {
  const out = new Map()
  if (nodes.length < minNodes || edges.length < minEdges) return out
  const adj = new Map(nodes.map((n) => [n.id, new Set()]))
  for (const e of edges) {
    if (adj.has(e.a) && adj.has(e.b)) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a) }
  }
  const componentOf = (start, banned, seen) => {
    const comp = new Set([start]); const q = [start]; seen.add(start)
    while (q.length) {
      const v = q.pop()
      for (const w of adj.get(v) || []) {
        if (w === banned || seen.has(w)) continue
        seen.add(w); comp.add(w); q.push(w)
      }
    }
    return comp
  }
  for (const n of nodes) {
    const nbrs = [...(adj.get(n.id) || [])]
    if (nbrs.length < 2) continue
    const seen = new Set()
    const comps = []
    for (const s2 of nbrs) if (!seen.has(s2)) comps.push(componentOf(s2, n.id, seen))
    if (comps.length >= 2 && comps.every((c) => c.size >= 2)) out.set(n.id, comps.length)
  }
  return out
}

// ── Cluster detection (topology; kept for tests / future use) ───────
// Components after removing the bridge members. Labels come only from
// node.industry (demo data); live nodes without industries stay null.
export function detectClusters(nodes, edges, bridgeIds = new Set()) {
  const banned = bridgeIds instanceof Map ? new Set(bridgeIds.keys()) : new Set(bridgeIds)
  const adj = new Map(nodes.map((n) => [n.id, new Set()]))
  for (const e of edges) {
    if (adj.has(e.a) && adj.has(e.b)) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a) }
  }
  const seen = new Set(banned)
  const clusters = []
  for (const n of nodes) {
    if (seen.has(n.id)) continue
    const ids = []
    const q = [n.id]; seen.add(n.id)
    while (q.length) {
      const v = q.pop(); ids.push(v)
      for (const w of adj.get(v) || []) {
        if (!seen.has(w)) { seen.add(w); q.push(w) }
      }
    }
    if (ids.length < 2) continue
    const counts = {}
    for (const id of ids) {
      const g = nodes.find((x) => x.id === id)?.industry
      if (g) counts[g] = (counts[g] || 0) + 1
    }
    const label = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    clusters.push({ ids, label })
  }
  return clusters
}

// Career Focus for the map comes from THE canonical taxonomy — the
// map clusters on BROAD categories only (IB / PE / VC can never form
// their own top-level cluster; those members belong to Finance).
export function canonicalIndustry(raw) {
  if (!String(raw || '').trim()) return null
  return broadLabelsOf([raw])[0] || null
}

// ── Industry grouping (the map's background fields) ─────────────────
// Members are arranged by their primary industry interest — a coarse,
// member-visible category. The largest groups keep their labels; the
// tail and members with no industry fold into 'Other'.
export function groupByIndustry(nodes, { maxGroups = 5 } = {}) {
  const byLabel = new Map()
  for (const n of nodes) {
    const key = canonicalIndustry(n.industry) || 'Other'
    if (!byLabel.has(key)) byLabel.set(key, [])
    byLabel.get(key).push(n.id)
  }
  const named = [...byLabel.entries()].filter(([k]) => k !== 'Other')
    .sort((a, b) => b[1].length - a[1].length)
  const keep = named.slice(0, maxGroups)
  const other = [...(byLabel.get('Other') || []), ...named.slice(maxGroups).flatMap(([, ids]) => ids)]
  const groups = keep.map(([label, ids]) => ({ label, ids }))
  if (other.length) groups.push({ label: 'Other', ids: other })
  return groups
}

/**
 * Career Focus fields, laid out so they never collide.
 *
 * The field comes FIRST: each one gets a radius from how many members
 * it holds, the fields are then pushed apart until none overlap and
 * all sit inside the frame, and only then are members packed inside
 * their own field. Deriving the field from member positions (the old
 * way) let a 20-person circle sprawl across its neighbours once the
 * community grew past a handful of people.
 *
 * Deterministic: same input, same picture, every render.
 */
export function fieldLayout(groups, {
  width = 360, height = 360, fill = 0.36, gap = 9, labelSpace = 30,
} = {}) {
  const total = groups.reduce((s, g) => s + g.ids.length, 0) || 1
  // radius ∝ √members, scaled so the fields together cover `fill` of
  // the frame — enough to read as areas, loose enough to separate
  const k = Math.sqrt((fill * width * height) / (Math.PI * total))
  const maxR = Math.min(width, height) * 0.29
  const items = groups.map((g) => ({
    label: g.label,
    ids: g.ids,
    size: g.ids.length,
    r: Math.max(32, Math.min(maxR, k * Math.sqrt(g.ids.length))),
    x: width / 2,
    y: height / 2,
  }))
  // biggest field in the middle, the rest seeded around it
  items.sort((a, b) => b.size - a.size || (a.label < b.label ? -1 : 1))
  const cx = width / 2, cy = height / 2
  items.forEach((it, i) => {
    if (i === 0) return
    const a = ((i - 1) / Math.max(1, items.length - 1)) * Math.PI * 2 - Math.PI / 2
    it.x = cx + Math.cos(a) * width * 0.33
    it.y = cy + Math.sin(a) * height * 0.33
  })
  // separate, then contain — repeated until it settles
  for (let iter = 0; iter < 240; iter++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j]
        const dx = B.x - A.x, dy = B.y - A.y
        const d = Math.hypot(dx, dy) || 0.01
        const want = A.r + B.r + gap
        if (d < want) {
          const push = (want - d) / 2
          A.x -= (dx / d) * push; A.y -= (dy / d) * push
          B.x += (dx / d) * push; B.y += (dy / d) * push
        }
      }
    }
    for (const it of items) {
      it.x = Math.min(width - it.r - 3, Math.max(it.r + 3, it.x))
      // extra room on top: the field label lives above the circle
      it.y = Math.min(height - it.r - 3, Math.max(it.r + labelSpace, it.y))
    }
  }
  // members packed inside their OWN field (sunflower: even spread,
  // index 0 nearest the centre, so ordering still means something)
  const pos = {}
  for (const it of items) {
    const inner = Math.max(0, it.r - 15)
    const n = it.ids.length
    it.ids.forEach((id, i) => {
      if (n === 1) { pos[id] = { x: it.x, y: it.y }; return }
      const rr = inner * Math.sqrt((i + (n <= 3 ? 0.6 : 0.35)) / n)
      const ang = i * 2.399963 + seed01(it.label) * Math.PI * 2
      pos[id] = { x: it.x + Math.cos(ang) * rr, y: it.y + Math.sin(ang) * rr }
    })
  }
  return {
    pos,
    fields: items.map((it) => ({
      label: it.label, size: it.size,
      x: it.x, y: it.y, r: it.r, rx: it.r, ry: it.r,
    })),
  }
}

/**
 * Which members are worth drawing as individual nodes.
 *
 * The map is anonymous, so sixty identical dots say nothing except
 * "there are many people" — and a carpet of small rings is genuinely
 * unpleasant to look at. The field itself already carries how many
 * people are in it, through its size and its count. So only members
 * who mean something to THIS viewer get a node:
 *   · me
 *   · people I have unlocked (my own connections)
 *   · Community Connectors, whose role is earned and public
 *   · whoever is currently selected
 * Everyone else is present in the field's size and count, and stays
 * unrendered rather than becoming visual noise.
 */
export function featuredMemberIds(members = [], { selected = null } = {}) {
  const out = new Set()
  for (const m of members) {
    if (!m) continue
    if (m.isSelf || m.unlocked || m.connector || m.id === selected) out.add(m.id)
  }
  return out
}

/** A field label that fits: at most two lines, never a cut-off word. */
export function wrapFieldLabel(label, maxChars = 13) {
  const text = String(label || '').toUpperCase()
  if (text.length <= maxChars) return [text]
  const words = text.split(/\s+/)
  if (words.length === 1) return [text]
  const lines = ['', '']
  let i = 0
  for (const w of words) {
    if (i === 0 && (lines[0] ? lines[0].length + 1 + w.length : w.length) <= maxChars) {
      lines[0] = lines[0] ? `${lines[0]} ${w}` : w
    } else {
      i = 1
      lines[1] = lines[1] ? `${lines[1]} ${w}` : w
    }
  }
  return lines.filter(Boolean)
}

// Deterministic per-group layout: group anchors sit on an ellipse,
// members spiral out from their anchor (golden angle), so every group
// reads as one soft field and nothing overlaps by construction.
export function industryLayout(groups, { width = 360, height = 360 } = {}) {
  const cx = width / 2, cy = height / 2
  const pos = {}
  const nG = Math.max(1, groups.length)
  groups.forEach((g, gi) => {
    const ga = (gi / nG) * Math.PI * 2 - Math.PI / 2 + (nG > 1 ? 0.35 : 0)
    const ax = nG === 1 ? cx : cx + Math.cos(ga) * width * 0.30
    const ay = nG === 1 ? cy : cy + Math.sin(ga) * height * 0.30
    g.ids.forEach((id, k) => {
      const r = k === 0 ? 0 : 24 + 13 * Math.sqrt(k)
      const a = k * 2.399963 + seed01(id) * 0.9
      pos[id] = {
        x: Math.min(width - 26, Math.max(26, ax + Math.cos(a) * r)),
        y: Math.min(height - 26, Math.max(24, ay + Math.sin(a) * r * 0.85)),
      }
    })
  })
  return pos
}

// ── Force-directed layout (deterministic: seeded, no randomness) ────
// Kept for potential reuse and tests; the Community Map itself now
// arranges members by industry fields (industryLayout above).
export function forceLayout(nodes, edges, { width = 360, height = 240, iterations = 260, clusters = [] } = {}) {
  const ids = nodes.map((n) => n.id)
  const pos = {}
  const clusterOf = {}
  clusters.forEach((c, i) => c.ids.forEach((id) => { clusterOf[id] = i }))
  const nC = Math.max(1, clusters.length)
  ids.forEach((id, i) => {
    const jitterA = seed01(id) * Math.PI * 2 + i * 2.399963
    const jitterR = 8 + seed01(id + 'r') * 26
    let ax = width / 2, ay = height / 2
    if (clusterOf[id] != null) {
      const a = (clusterOf[id] / nC) * Math.PI * 2 + 0.8
      ax += Math.cos(a) * width * 0.24
      ay += Math.sin(a) * height * 0.26
    }
    pos[id] = { x: ax + Math.cos(jitterA) * jitterR, y: ay + Math.sin(jitterA) * jitterR * 0.8 }
  })
  const K = Math.sqrt((width * height) / Math.max(1, ids.length)) * 0.52
  for (let it = 0; it < iterations; it++) {
    const t = 1 - it / iterations
    const disp = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]))
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]], b = pos[ids[j]]
        let dx = a.x - b.x, dy = a.y - b.y
        const d2 = Math.max(36, dx * dx + dy * dy)
        const f = (K * K) / d2
        dx *= f; dy *= f
        disp[ids[i]].x += dx; disp[ids[i]].y += dy
        disp[ids[j]].x -= dx; disp[ids[j]].y -= dy
      }
    }
    for (const e of edges) {
      const a = pos[e.a], b = pos[e.b]
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.max(6, Math.sqrt(dx * dx + dy * dy))
      const f = (d - K * 1.15) / d * 0.22 * (1 + Math.min(3, (e.verified ?? e.depth ?? 1)) * 0.12)
      disp[e.a].x += dx * f; disp[e.a].y += dy * f
      disp[e.b].x -= dx * f; disp[e.b].y -= dy * f
    }
    for (const c of clusters) {
      const pts = c.ids.filter((id) => pos[id])
      if (pts.length < 2) continue
      const cx = pts.reduce((s2, id) => s2 + pos[id].x, 0) / pts.length
      const cy = pts.reduce((s2, id) => s2 + pos[id].y, 0) / pts.length
      for (const id of pts) {
        disp[id].x += (cx - pos[id].x) * 0.10
        disp[id].y += (cy - pos[id].y) * 0.10
      }
    }
    const maxStep = 1.5 + 9 * t
    for (const id of ids) {
      const p = pos[id]
      const dx = disp[id].x + (width / 2 - p.x) * 0.045
      const dy = disp[id].y + (height / 2 - p.y) * 0.055
      const len = Math.hypot(dx, dy) || 1
      const step = Math.min(len, maxStep)
      p.x += (dx / len) * step
      p.y += (dy / len) * step
      p.x = Math.min(width - 30, Math.max(30, p.x))
      p.y = Math.min(height - 32, Math.max(24, p.y))
    }
  }
  return pos
}

/** My Circle subgraph of any graph: me + direct neighbours only. */
export function deriveEgo(graph, meId) {
  const edges = graph.edges.filter((e) => e.a === meId || e.b === meId)
  const keep = neighbourIds(edges, meId)
  return {
    meId,
    nodes: graph.nodes.filter((n) => n.id !== meId && keep.has(n.id)),
    edges,
  }
}

// ── Demo network (development/demo mode ONLY, clearly labelled) ─────
// A community-WIDE mock mirroring the approved mockup: named industry
// fields joined ONLY through two bridge members (Roopal, Priya), with
// the signed-in user an ordinary member of one field — never the
// centre. verified = both-confirmed interactions; tokens = MINTED
// shared tokens (Together only, exactly like production). Counts are
// derived from the arrays, never invented. No real ids.
export function buildDemoGraph() {
  const people = [
    // [id, name, tokens, industry]
    ['me', 'You',          3, 'Consulting'],
    ['d1', 'Daniel Lee',   2, 'Consulting'],
    ['mk', 'Maya Khan', null, 'Consulting'],
    ['nc', 'Noah Chen',    3, 'Consulting'],
    ['wk', 'Waqar Khan', null, 'Consulting'],
    ['ap', 'Aisha Patel',  2, 'Entrepreneurship'],
    ['oh', 'Omar Haddad', null, 'Entrepreneurship'],
    ['sr', 'Sofia Rossi',  1, 'Entrepreneurship'],
    ['lw', 'Leo Wang',     1, 'Finance'],
    ['kt', 'Kenji Tanaka', null, 'Finance'],
    ['r',  'Roopal',       2, 'Consulting'],
    ['ps', 'Priya Sharma', 2, 'Finance'],
    ['i1', 'Tara Singh', null, 'Technology'],   // no verified exchanges yet:
    ['i2', 'Ben Okafor', null, 'Technology'],   // named on the map, tier 'new'
  ]
  const nodes = people.map(([id, name, tokens, industry]) => ({ id, name, isSelf: id === 'me', tokens, industry }))
  const E = (a, b, origin, verified, tokens, breakdown) => ({
    a, b, origin, state: 'mutual',
    verified, depth: verified, tokens,
    breakdown: breakdown || (verified > 0 ? { [origin]: verified } : {}),
    firstAt: null, lastAt: null,
  })
  const edges = [
    // Consulting (the signed-in user is just one member here)
    E('me', 'd1', 'together', 4, 4),   // my strongest: ×4, Established
    E('me', 'mk', 'event', 1, 0),
    E('d1', 'mk', 'discover', 0, 0),                            // mutual, nothing verified yet
    E('d1', 'nc', 'event', 5, 4, { event: 1, together: 4 }),    // gold origin, ×4 tokens
    E('me', 'nc', 'discover', 1, 1),   // both confirmed → one shared Token
    E('mk', 'wk', 'discover', 0, 0),
    E('nc', 'wk', 'event', 1, 0),
    // Entrepreneurship
    E('ap', 'oh', 'event', 2, 0),
    E('oh', 'sr', 'discover', 1, 1),
    E('ap', 'sr', 'together', 1, 1),
    // Finance
    E('lw', 'kt', 'discover', 0, 0),
    // Roopal bridges Consulting ↔ Entrepreneurship
    E('r', 'd1', 'event', 1, 0),
    E('r', 'nc', 'together', 1, 1),
    E('r', 'me', 'event', 1, 0),
    E('r', 'ap', 'event', 2, 0),
    E('r', 'ps', 'together', 1, 1),
    // Priya bridges Entrepreneurship ↔ Finance
    E('ps', 'ap', 'discover', 1, 1),
    E('ps', 'sr', 'event', 1, 0),
    E('ps', 'lw', 'together', 1, 1),
  ]
  return {
    meId: 'me', nodes, edges, tokensKnown: true,
    summary: {
      name: 'Rotman',
      members: nodes.length,
      connections: edges.length,
      verifiedTotal: edges.reduce((s2, e) => s2 + e.verified, 0),
      tokenTotal: edges.reduce((s2, e) => s2 + e.tokens, 0),
    },
  }
}
