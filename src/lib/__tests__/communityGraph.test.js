import { describe, it, expect } from 'vitest'
import {
  shortName, nodeInitials, edgeWidth, buildPersonalGraph,
  filterEdges, neighbourIds, seed01, buildDemoGraph,
  detectBridges, detectClusters, forceLayout, deriveEgo, nodeDepth,
  groupByIndustry,
  tokenMarkers, edgeMotionPolicy, relationshipSummary,
  normalizeMapSummary, normalizeMyGraph, aggregateMapSummary,
  memberStatus, relationshipStateLabel, nextMilestone, ribbonWidth,
  relationshipNextStep, locateInsight, ribbonPath, publishableLinks,
  fieldLayout, wrapFieldLabel, featuredMemberIds,
} from '../communityGraph'

const ME = 'user-me'

describe('shortName / nodeInitials', () => {
  it('first name + last initial', () => {
    expect(shortName('Daniel Lee')).toBe('Daniel L')
    expect(shortName('Priya Sharma Rao')).toBe('Priya R')
    expect(shortName('Maya')).toBe('Maya')
    expect(shortName('')).toBe('')
  })
  it('initials for the node circle', () => {
    expect(nodeInitials('Daniel Lee')).toBe('DL')
    expect(nodeInitials('Maya')).toBe('M')
  })
})

describe('edgeWidth (spec strength tiers)', () => {
  it('follows the capped tier table and never exceeds 6px', () => {
    expect(edgeWidth(0)).toBe(1.25)     // bare mutual connection: thin static line
    expect(edgeWidth(1)).toBe(2)
    expect(edgeWidth(2)).toBe(3)
    expect(edgeWidth(3)).toBe(3)
    expect(edgeWidth(4)).toBe(4.5)
    expect(edgeWidth(6)).toBe(4.5)
    expect(edgeWidth(7)).toBe(6)
    expect(edgeWidth(50)).toBe(6)       // hard cap: thick lines never swallow nodes
  })
})

describe('tokenMarkers + edgeMotionPolicy (spec animation rules)', () => {
  it('0 tokens: none; 1: one; 2-3: that many; 4+: capped 3 with a count label', () => {
    expect(tokenMarkers(0)).toEqual({ moving: 0, label: null })
    expect(tokenMarkers(1)).toEqual({ moving: 1, label: null })
    expect(tokenMarkers(3)).toEqual({ moving: 3, label: null })
    expect(tokenMarkers(4)).toEqual({ moving: 3, label: '\u00d74' })
    expect(tokenMarkers(12)).toEqual({ moving: 3, label: '\u00d712' })
  })
  it('reduced motion never moves; dense graphs animate only focused edges', () => {
    expect(edgeMotionPolicy({ tokens: 0 })).toBe('none')
    expect(edgeMotionPolicy({ tokens: 2, reduced: true })).toBe('static')
    expect(edgeMotionPolicy({ tokens: 2, dense: true, focused: false })).toBe('static')
    expect(edgeMotionPolicy({ tokens: 2, dense: true, focused: true })).toBe('animate')
    expect(edgeMotionPolicy({ tokens: 1 })).toBe('animate')
  })
})

describe('buildPersonalGraph — mutual-only model (spec tests 1,4,5,6,10,11)', () => {
  it('a unilateral Discover match is never displayed (test 1)', () => {
    const g = buildPersonalGraph({
      userId: ME,
      matches: [
        { id: 'm1', requester_user_id: 'p1', helper_user_id: ME, status: 'active',
          source: 'post', identity_reveal_status: 'none' },          // right-swipe only
      ],
      namesById: { p1: { name: 'Sara Kim' } },
    })
    expect(g.edges).toEqual([])
    expect(g.nodes).toEqual([])
  })

  it('two-sided Discover signals draw the line: reveal, smart match, both We met', () => {
    const g = buildPersonalGraph({
      userId: ME,
      matches: [
        { id: 'm1', requester_user_id: 'p1', helper_user_id: ME, status: 'active',
          source: 'post', identity_reveal_status: 'accepted' },
        { id: 'm2', requester_user_id: 'p2', helper_user_id: ME, status: 'active',
          source: 'smart_match', identity_reveal_status: 'none' },
        { id: 'm3', requester_user_id: 'p3', helper_user_id: ME, status: 'active',
          source: 'post', identity_reveal_status: 'none' },
      ],
      bothConfirmedMatchIds: new Set(['m3']),
      namesById: { p1: { name: 'A A' }, p2: { name: 'B B' }, p3: { name: 'C C' } },
    })
    expect(g.edges.map((e) => e.b).sort()).toEqual(['p1', 'p2', 'p3'])
    const p3 = g.edges.find((e) => e.b === 'p3')
    expect(p3.verified).toBe(1)                          // both confirmed the exchange…
    expect(p3.tokens).toBe(1)                            // …so it mints one shared Token
    // a mutual connection with no completed exchange still has none
    const p2 = g.edges.find((e) => e.b === 'p2')
    expect(p2.verified).toBe(0)
    expect(p2.tokens).toBe(0)
  })

  it('one-sided event captures never appear; mutual ones verify without tokens (test 10)', () => {
    const g = buildPersonalGraph({
      userId: ME,
      encounters: [
        { encountered_user_id: 'p1', display_name: 'Leo Wang', status: 'mutually_confirmed', confirmed_at: '2026-08-20T00:00:00Z' },
        { encountered_user_id: 'p2', display_name: 'One Sided', status: 'self_recorded' },
      ],
    })
    expect(g.edges.map((e) => e.b)).toEqual(['p1'])
    expect(g.edges[0]).toMatchObject({ origin: 'event', verified: 1, tokens: 0 })
  })

  it('repeat exchanges strengthen ONE edge and raise token count (tests 4,5,6)', () => {
    const g = buildPersonalGraph({
      userId: ME, communityId: 'rotman',
      pairings: [{ community_id: 'rotman', status: 'accepted', accepted_at: '2026-08-01', counterpart_user_id: 'p1' }],
      practiceEdges: [{ community_id: 'rotman', user_lo: ME, user_hi: 'p1',
        verified_exchange_count: 3, first_verified_at: '2026-08-10', last_verified_at: '2026-08-20' }],
      namesById: { p1: { name: 'Sara Kim' } },
    })
    expect(g.edges).toHaveLength(1)                       // never duplicate edges
    expect(g.edges[0].verified).toBe(3)
    expect(g.edges[0].tokens).toBe(3)                     // Together mints tokens
    expect(edgeWidth(g.edges[0].verified)).toBe(3)
  })

  it('drops practice edges from another community (test 11)', () => {
    const g = buildPersonalGraph({
      userId: ME, communityId: 'rotman',
      practiceEdges: [
        { community_id: 'rotman', user_lo: ME, user_hi: 'p1', verified_exchange_count: 2 },
        { community_id: 'other',  user_lo: ME, user_hi: 'p9', verified_exchange_count: 5 },
      ],
      namesById: { p1: { name: 'Sara Kim' }, p9: { name: 'Cross Community' } },
    })
    expect(g.edges.map((e) => e.b)).toEqual(['p1'])
  })

  it('origin = earliest channel; later channels strengthen, never recolour (test 8)', () => {
    const g = buildPersonalGraph({
      userId: ME, communityId: 'rotman',
      encounters: [{ encountered_user_id: 'p1', display_name: 'Sara Kim',
        status: 'mutually_confirmed', confirmed_at: '2026-08-01T00:00:00Z' }],
      pairings: [{ community_id: 'rotman', status: 'accepted', accepted_at: '2026-08-10', counterpart_user_id: 'p1' }],
      practiceEdges: [{ community_id: 'rotman', user_lo: ME, user_hi: 'p1',
        verified_exchange_count: 4, first_verified_at: '2026-08-12', last_verified_at: '2026-08-20' }],
      namesById: { p1: { name: 'Sara Kim' } },
    })
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0].origin).toBe('event')               // began at the event → stays gold
    expect(g.edges[0].breakdown).toEqual({ event: 1, together: 4 })
    expect(g.edges[0].verified).toBe(5)
    expect(g.edges[0].tokens).toBe(4)
  })
})

describe('relationshipSummary (selected relationship detail)', () => {
  it('renders the spec explanation lines', () => {
    const lines = relationshipSummary({
      origin: 'event', verified: 6,
      breakdown: { event: 1, together: 4, discover: 1 },
      lastAt: '2026-08-20T12:00:00Z',
    })
    expect(lines[0]).toBe('Met through Event')
    expect(lines[1]).toBe('6 verified exchanges')
    expect(lines[2]).toBe('Strengthened through Together ×4 and Discover ×1')
    expect(lines[3]).toBe('Last verified exchange: Aug 20')
  })
})

describe('filterEdges / neighbourIds', () => {
  const edges = [
    { a: 'me', b: 'p1', origin: 'together', depth: 1 },
    { a: 'me', b: 'p2', origin: 'event',    depth: 1 },
    { a: 'p1', b: 'p3', origin: 'discover', depth: 1 },
  ]
  it('filters by origin, all passes through', () => {
    expect(filterEdges(edges, 'all')).toHaveLength(3)
    expect(filterEdges(edges, 'together')).toHaveLength(1)
    expect(filterEdges(edges, 'discover')[0].b).toBe('p3')
  })
  it('neighbourhood is direct connections plus self', () => {
    expect([...neighbourIds(edges, 'me')].sort()).toEqual(['me', 'p1', 'p2'])
    expect([...neighbourIds(edges, 'p3')].sort()).toEqual(['p1', 'p3'])
  })
})

describe('layout + demo data', () => {
  it('seed01 is deterministic and in [0,1)', () => {
    expect(seed01('abc')).toBe(seed01('abc'))
    expect(seed01('abc')).not.toBe(seed01('abd'))
    const v = seed01('anything')
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })
  it('demo graph carries no real ids, derives its counts, invents none', () => {
    const g = buildDemoGraph()
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const e of g.edges) {
      expect(ids.has(e.a)).toBe(true)
      expect(ids.has(e.b)).toBe(true)
    }
    expect(g.summary.members).toBe(g.nodes.length)
    expect(g.summary.connections).toBe(g.edges.length)
    expect(g.summary.activeNow).toBeUndefined()      // no fake presence, ever
  })
})

// ── "Public status, private relationships" ─────────────────────────
// The map contract carries aggregates and earned public identity; the
// private contract carries only the caller's own relationships.
const MAP_PAYLOAD = {
  community: {
    community_id: 'c1', community_name: 'Rotman', member_count: 4,
    mutual_connection_count: 5, verified_exchange_count: 9,
    relationships_strengthened_30d: 3,
  },
  // identity is released per viewer: k2 is unlocked to the caller,
  // k3 and k4 are not, so the RPC sends null for their name/avatar
  members: [
    { node_key: 'k1', is_self: true, is_identity_unlocked: true,
      display_name: 'Alice Anders', avatar_url: null,
      broad_career_focus: 'consulting', public_contribution_tier: 'established',
      public_badges: ['first_exchange', 'contributor'], is_community_connector: false, connected_circle_count: 2 },
    { node_key: 'k2', is_self: false, is_identity_unlocked: true,
      display_name: 'Bob Brant', avatar_url: 'https://x/y.png',
      broad_career_focus: 'finance', public_contribution_tier: 'builder',
      public_badges: ['first_exchange', 'contributor', 'community_builder'],
      is_community_connector: true, connected_circle_count: 4 },
    { node_key: 'k3', is_self: false, is_identity_unlocked: false,
      display_name: null, avatar_url: null,
      broad_career_focus: 'technology', public_contribution_tier: 'new',
      public_badges: [], is_community_connector: false, connected_circle_count: 1 },
    { node_key: 'k4', is_self: false, is_identity_unlocked: false,
      display_name: null, avatar_url: null,
      broad_career_focus: 'other', public_contribution_tier: 'new',
      public_badges: [], is_community_connector: false, connected_circle_count: 1 },
  ],
  clusters: [
    { career_focus_key: 'consulting', member_count: 1, mutual_connection_count: 0, verified_exchange_count: 0 },
    { career_focus_key: 'finance', member_count: 1, mutual_connection_count: 0, verified_exchange_count: 0 },
  ],
  cluster_links: [
    { cluster_a: 'consulting', cluster_b: 'finance', mutual_connection_count: 8,
      verified_exchange_count: 5, strength_tier: 3 },
  ],
}

describe('community map contract (privacy tests 1, 2, 3, 6, 11)', () => {
  it('receives no exact pair edge list and no pair-level token counts', () => {
    const m = normalizeMapSummary(MAP_PAYLOAD)
    // there is no per-pair structure at all in the map model
    expect(m.edges).toBeUndefined()
    const asText = JSON.stringify(m)
    expect(asText).not.toContain('node_lo')
    expect(asText).not.toContain('token')
    expect(asText).not.toContain('origin_source')
    expect(asText).not.toContain('last_verified_at')
    expect(m.members.every((x) => x.tokens === undefined)).toBe(true)
    // and the raw contract itself carries none either
    const raw = JSON.stringify(MAP_PAYLOAD)
    expect(raw).not.toContain('token_count')
    expect(raw).not.toContain('source_breakdown')
  })

  it('exposes only real, community-scoped aggregates', () => {
    const m = normalizeMapSummary(MAP_PAYLOAD)
    expect(m.summary).toEqual({
      name: 'Rotman', members: 4, connections: 5, verifiedTotal: 9, strengthened30d: 3,
    })
    // "Finance ↔ Consulting · 8 mutual connections · 5 verified exchanges"
    const link = m.links[0]
    expect(link.aLabel).toBe('Consulting')
    expect(link.bLabel).toBe('Finance')
    expect(link.connections).toBe(8)
    expect(link.verified).toBe(5)
    expect(ribbonWidth(link.tier)).toBeGreaterThan(ribbonWidth(0))
  })

  it('selecting another member exposes public status only, never partners', () => {
    const m = normalizeMapSummary(MAP_PAYLOAD)
    const bob = m.members.find((x) => x.id === 'k2')
    expect(Object.keys(bob).sort()).toEqual([
      'avatarUrl', 'badges', 'circleCount', 'connector', 'focusKey',
      'id', 'industry', 'isSelf', 'name', 'tier', 'unlocked',
    ])
    // Community Connector status says HOW MANY circles, never who
    expect(bob.connector).toBe(true)
    expect(bob.circleCount).toBe(4)
    expect(JSON.stringify(bob)).not.toMatch(/k1|k3|k4/)
  })

  it('identity appears only for members the caller has unlocked', () => {
    const m = normalizeMapSummary(MAP_PAYLOAD)
    const byId = Object.fromEntries(m.members.map((x) => [x.id, x]))
    expect(byId.k2.unlocked).toBe(true)
    expect(byId.k2.name).toBe('Bob Brant')
    expect(byId.k3.unlocked).toBe(false)
    expect(byId.k3.name).toBeNull()
    expect(byId.k3.avatarUrl).toBeNull()
    // a locked row can never surface a name, even if one slipped in
    const leaked = normalizeMapSummary({
      ...MAP_PAYLOAD,
      members: MAP_PAYLOAD.members.map((x) => ({
        ...x, display_name: 'Leaked Name', avatar_url: 'https://leak/x.png',
      })),
    })
    const lockedRows = leaked.members.filter((x) => !x.unlocked)
    expect(lockedRows.length).toBeGreaterThan(0)
    expect(lockedRows.every((x) => x.name === null && x.avatarUrl === null)).toBe(true)
  })

  it('carries no leaderboard, centrality score or ranking', () => {
    const asText = JSON.stringify(normalizeMapSummary(MAP_PAYLOAD))
    for (const banned of ['centrality', 'rank', 'percentile', 'leaderboard', 'score', 'followers']) {
      expect(asText.toLowerCase()).not.toContain(banned)
    }
  })

  it('returns null on a malformed payload', () => {
    expect(normalizeMapSummary(null)).toBeNull()
    expect(normalizeMapSummary({})).toBeNull()
  })
})

describe('private relationship contract (privacy tests 4, 5, 9)', () => {
  const MY_PAYLOAD = {
    edges: [
      { other_node_key: 'k2', display_name: 'Bob Brant', broad_career_focus: 'finance',
        origin_source: 'event', token_count: 4, verified_exchange_count: 6,
        source_breakdown: { event: 1, together: 4, discover: 1 }, strength_tier: 3,
        first_connected_at: '2026-06-01T12:00:00Z', last_verified_at: '2026-08-20T12:00:00Z' },
      { other_node_key: 'k3', display_name: 'Cara Chen', broad_career_focus: 'technology',
        origin_source: 'discover', token_count: 0, verified_exchange_count: 0,
        source_breakdown: {}, strength_tier: 0, first_connected_at: '2026-08-01T00:00:00Z',
        last_verified_at: null },
    ],
  }

  it('every edge has the caller as one endpoint', () => {
    const g = normalizeMyGraph(MY_PAYLOAD, { userName: 'Alice' })
    expect(g.edges.every((e) => e.a === 'me' || e.b === 'me')).toBe(true)
    expect(g.edges).toHaveLength(2)
  })

  it('exact token markers exist only on participant edges', () => {
    const g = normalizeMyGraph(MY_PAYLOAD)
    const bob = g.edges.find((e) => e.b === 'k2')
    expect(bob.tokens).toBe(4)
    expect(tokenMarkers(bob.tokens)).toEqual({ moving: 3, label: '×4' })
    const cara = g.edges.find((e) => e.b === 'k3')
    expect(cara.tokens).toBe(0)
    expect(edgeMotionPolicy({ tokens: cara.tokens })).toBe('none')   // bare line: static
  })

  it('Locate me and My Circle describe the same relationship identically', () => {
    const g = normalizeMyGraph(MY_PAYLOAD)
    const bob = g.edges.find((e) => e.b === 'k2')
    // same object powers both views, so origin/tokens/summary cannot diverge
    expect(bob.origin).toBe('event')
    expect(relationshipStateLabel(bob.verified)).toBe('Established')
    expect(relationshipSummary(bob)).toEqual([
      'Met through Event',
      '6 verified exchanges',
      'Strengthened through Together ×4 and Discover ×1',
      'Last verified exchange: Aug 20',
    ])
  })

  it('returns null on a malformed payload', () => {
    expect(normalizeMyGraph(null)).toBeNull()
    expect(normalizeMyGraph({})).toBeNull()
  })
})

describe('relationship milestones and Locate me insight', () => {
  it('a relationship milestone counts only verified exchanges', () => {
    expect(relationshipNextStep(0)).toBe('Verify an exchange together to start building this')
    expect(relationshipNextStep(3)).toBe('1 more verified exchange to reach Established')
    expect(relationshipNextStep(2)).toBe('2 more verified exchanges to reach Established')
    expect(relationshipNextStep(4)).toBeNull()          // no invented progress
    expect(relationshipStateLabel(4)).toBe('Established')
  })

  it('Locate me describes MY position, and claims a bridge only from real topology', () => {
    const focusByPeer = { p1: 'Operations', p2: 'Finance', p3: 'Finance' }
    const verified = locateInsight({
      edges: [
        { a: 'me', b: 'p1', verified: 2 },
        { a: 'me', b: 'p2', verified: 1 },
        { a: 'me', b: 'p3', verified: 0 },
      ],
      focusByPeer,
    })
    expect(verified.line).toBe('3 people in your circle · connected across 2 focus areas')
    expect(verified.bridge).toBe('You help connect Finance and Operations.')
    // connections without a verified exchange never earn the claim
    const unverified = locateInsight({
      edges: [{ a: 'me', b: 'p1', verified: 0 }, { a: 'me', b: 'p2', verified: 0 }],
      focusByPeer,
    })
    expect(unverified.bridge).toBeNull()
    // and one circle is not a bridge
    expect(locateInsight({ edges: [{ a: 'me', b: 'p2', verified: 3 }], focusByPeer }).bridge).toBeNull()
  })

  it('an aggregate path starts and ends at field edges, never at a member', () => {
    const a = { x: 100, y: 100, rx: 40, ry: 30 }
    const b = { x: 300, y: 100, rx: 50, ry: 30 }
    const { x1, x2, y1, y2 } = ribbonPath(a, b)
    expect(x1).toBeGreaterThan(a.x)          // leaves the field boundary
    expect(x2).toBeLessThan(b.x)
    expect(Math.hypot(x1 - a.x, y1 - a.y)).toBeCloseTo(40, 5)
    expect(Math.hypot(x2 - b.x, y2 - b.y)).toBeCloseTo(50, 5)
    // never crosses past the midpoint even for overlapping fields
    const tight = ribbonPath({ x: 0, y: 0, rx: 500, ry: 500 }, { x: 60, y: 0, rx: 500, ry: 500 })
    expect(tight.x1).toBeLessThanOrEqual(tight.x2)
  })
})

describe('public achievement system (privacy tests 8, 10, 11)', () => {
  it('badges and tiers come only from verified exchanges', () => {
    expect(memberStatus({ verifiedTotal: 0 })).toMatchObject({ tier: 'new', badges: [], connector: false })
    expect(memberStatus({ verifiedTotal: 1 })).toMatchObject({ tier: 'contributor', badges: ['first_exchange'] })
    expect(memberStatus({ verifiedTotal: 3 }).tier).toBe('established')
    expect(memberStatus({ verifiedTotal: 10 }).badges).toContain('community_builder')
    expect(memberStatus({ verifiedTotal: 4, verifiedPartners: 5 }).badges).toContain('community_contributor')
    expect(memberStatus({ verifiedTotal: 6, repeatPartners: 3 }).badges).toContain('trusted_collaborator')
  })

  it('unverified activity never earns public status', () => {
    // a member with swipes, pending invites and three profile categories
    const s = memberStatus({ verifiedTotal: 0, verifiedPartners: 0, crossCircles: 0, partnerCircles: 0 })
    expect(s.tier).toBe('new')
    expect(s.badges).toEqual([])
    expect(s.connector).toBe(false)
  })

  it('Community Connector needs verified cross-circle relationships, not category picks', () => {
    // 3 verified partners but all in ONE circle → not a connector
    expect(memberStatus({ verifiedTotal: 3, verifiedPartners: 3, crossCircles: 1 }).connector).toBe(false)
    // 2 partners across 2 circles → still below the partner threshold
    expect(memberStatus({ verifiedTotal: 2, verifiedPartners: 2, crossCircles: 2 }).connector).toBe(false)
    // 3 verified partners spanning 2+ circles → earned
    expect(memberStatus({ verifiedTotal: 3, verifiedPartners: 3, crossCircles: 2 }).connector).toBe(true)
  })

  it('private milestone copy is calm, exact and self-only', () => {
    expect(nextMilestone(0)).toBe('Complete your first verified exchange to earn First Exchange.')
    expect(nextMilestone(2)).toBe('Complete 1 more verified exchange to become a Contributor.')
    expect(nextMilestone(9)).toBe('Complete 1 more verified exchange to become a Community Builder.')
    expect(nextMilestone(10)).toBeNull()
    expect(nextMilestone(4)).not.toMatch(/now|hurry|don't lose|streak/i)
  })
})

describe('aggregateMapSummary — aggregates are derived, never invented (test 3)', () => {
  const demo = buildDemoGraph()
  const agg = aggregateMapSummary(demo)

  it('totals equal the underlying relationships', () => {
    expect(agg.summary.members).toBe(demo.nodes.length)
    expect(agg.summary.connections).toBe(demo.edges.length)
    expect(agg.summary.verifiedTotal).toBe(demo.edges.reduce((s, e) => s + e.verified, 0))
    const linkPairs = agg.links.reduce((s, l) => s + l.connections, 0)
    const clusterPairs = agg.clusters.reduce((s, c) => s + c.connections, 0)
    expect(linkPairs + clusterPairs).toBe(demo.edges.length)   // every edge counted once
  })

  it('a member exposes no partners, and identity follows the unlock rule (test 6)', () => {
    const me = agg.members.find((m) => m.isSelf)
    expect(JSON.stringify(me)).not.toContain('d1')
    expect(me.badges.every((b) => typeof b === 'string')).toBe(true)
    const byId = Object.fromEntries(agg.members.map((m) => [m.id, m]))
    // Roopal is directly connected to me → unlocked
    expect(byId.r.unlocked).toBe(true)
    expect(byId.r.name).toBe('Roopal')
    // Priya is a stranger to me → anonymous, whatever her status
    expect(byId.ps.unlocked).toBe(false)
    expect(byId.ps.name).toBeNull()
    expect(JSON.stringify(byId.ps)).not.toContain('Priya')
    // and no member row can name anyone else's partners
    expect(agg.members.every((m) => m.partners === undefined)).toBe(true)
  })

  it('suppresses aggregate paths that would point at a specific pair', () => {
    const clusters = [
      { label: 'Finance', members: 4 }, { label: 'Consulting', members: 3 },
      { label: 'Technology', members: 2 },
    ]
    const links = [
      { aLabel: 'Finance', bLabel: 'Consulting', connections: 5 },
      { aLabel: 'Finance', bLabel: 'Technology', connections: 1 },
    ]
    const { shown, suppressed } = publishableLinks(links, clusters)
    expect(shown).toHaveLength(1)
    expect(shown[0].bLabel).toBe('Consulting')
    expect(suppressed).toBe(1)
  })

  it('narrow finance specialisations never form their own cluster', () => {
    const g = {
      meId: 'a',
      nodes: [
        { id: 'a', name: 'A', industry: 'Investment Banking' },
        { id: 'b', name: 'B', industry: 'Private Equity' },
        { id: 'c', name: 'C', industry: 'Consulting' },
      ],
      edges: [
        { a: 'a', b: 'b', origin: 'together', verified: 2, tokens: 2, breakdown: {} },
        { a: 'b', b: 'c', origin: 'event', verified: 1, tokens: 0, breakdown: {} },
      ],
    }
    const m = aggregateMapSummary(g)
    const labels = m.clusters.map((c) => c.label)
    expect(labels).toContain('Finance')
    expect(labels).not.toContain('Investment Banking')
    expect(labels).not.toContain('Private Equity')
    // the IB-PE relationship is INSIDE finance, not a cross-circle path
    expect(m.clusters.find((c) => c.label === 'Finance').connections).toBe(1)
    // Consulting holds a single member here, so the cross-field pair
    // is withheld rather than published as a near-identifying path
    expect(m.links).toHaveLength(0)
    expect(m.suppressedLinks).toBe(1)
  })
})

describe('detectBridges / detectClusters', () => {
  it('flags exactly the two members joining separate circles in the demo graph', () => {
    const g = buildDemoGraph()
    const bridges = detectBridges(g.nodes, g.edges)
    expect([...bridges.keys()].sort()).toEqual(['ps', 'r'])
    expect(bridges.get('r')).toBe(2)                  // "bridges 2 community circles"
    expect(bridges.get('ps')).toBe(2)
  })
  it('stays silent below the conservative size threshold', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const edges = [{ a: 'a', b: 'b', depth: 1 }, { a: 'b', b: 'c', depth: 1 }]
    expect(detectBridges(nodes, edges).size).toBe(0)
  })
  it('clusters = components after removing bridges, labelled from demo industries only', () => {
    const g = buildDemoGraph()
    const clusters = detectClusters(g.nodes, g.edges, detectBridges(g.nodes, g.edges))
    expect(clusters).toHaveLength(3)
    expect(clusters.map((c) => c.label).sort()).toEqual(['Consulting', 'Entrepreneurship', 'Finance'])
    const consulting = clusters.find((c) => c.label === 'Consulting')
    expect(consulting.ids.sort()).toEqual(['d1', 'me', 'mk', 'nc', 'wk'])
    // nodes without industries → label stays null, never invented
    const unlabelled = detectClusters(
      g.nodes.map(({ industry, ...n }) => n), g.edges, detectBridges(g.nodes, g.edges))
    expect(unlabelled.every((c) => c.label === null)).toBe(true)
  })
})

describe('fieldLayout at real community scale (61 members, 6 fields)', () => {
  const VW = 360, VH = 376
  const groups = [
    { label: 'Other', ids: Array.from({ length: 22 }, (_, i) => `o${i}`) },
    { label: 'Technology', ids: Array.from({ length: 12 }, (_, i) => `t${i}`) },
    { label: 'Consulting', ids: Array.from({ length: 11 }, (_, i) => `c${i}`) },
    { label: 'Finance', ids: Array.from({ length: 8 }, (_, i) => `f${i}`) },
    { label: 'Entrepreneurship', ids: Array.from({ length: 5 }, (_, i) => `e${i}`) },
    { label: 'Operations & Supply Chain', ids: Array.from({ length: 3 }, (_, i) => `p${i}`) },
  ]
  const out = fieldLayout(groups, { width: VW, height: VH })

  it('never lets two fields overlap', () => {
    for (let i = 0; i < out.fields.length; i++) {
      for (let j = i + 1; j < out.fields.length; j++) {
        const A = out.fields[i], B = out.fields[j]
        const d = Math.hypot(B.x - A.x, B.y - A.y)
        expect(d).toBeGreaterThanOrEqual(A.r + B.r - 0.5)
      }
    }
  })

  it('keeps every field inside the frame, with room for its label', () => {
    for (const f of out.fields) {
      expect(f.x - f.r).toBeGreaterThanOrEqual(0)
      expect(f.x + f.r).toBeLessThanOrEqual(VW)
      expect(f.y - f.r).toBeGreaterThanOrEqual(10)     // label sits above
      expect(f.y + f.r).toBeLessThanOrEqual(VH)
    }
  })

  it('packs every member inside their own field, clear of the edge', () => {
    for (const f of out.fields) {
      const g = groups.find((x) => x.label === f.label)
      for (const id of g.ids) {
        const p = out.pos[id]
        expect(p).toBeTruthy()
        // 15px inner margin covers the node radius and its drift
        expect(Math.hypot(p.x - f.x, p.y - f.y)).toBeLessThanOrEqual(f.r - 14)
      }
    }
  })

  it('gives a bigger field to a bigger group', () => {
    const byLabel = Object.fromEntries(out.fields.map((f) => [f.label, f]))
    expect(byLabel.Other.r).toBeGreaterThan(byLabel.Finance.r)
    expect(byLabel.Finance.r).toBeGreaterThan(byLabel['Operations & Supply Chain'].r)
  })

  it('is deterministic', () => {
    const again = fieldLayout(groups, { width: VW, height: VH })
    expect(again.fields).toEqual(out.fields)
    expect(again.pos).toEqual(out.pos)
  })

  it('handles a single field and an empty community without breaking', () => {
    const one = fieldLayout([{ label: 'Consulting', ids: ['a'] }], { width: VW, height: VH })
    expect(one.pos.a).toBeTruthy()
    expect(fieldLayout([], { width: VW, height: VH }).fields).toEqual([])
  })
})

describe('featuredMemberIds — only meaningful nodes are drawn', () => {
  const members = [
    { id: 'me', isSelf: true },
    { id: 'k1', unlocked: true },                    // my own connection
    { id: 'k2', connector: true },                   // earned public role
    { id: 'k3' }, { id: 'k4' }, { id: 'k5' },        // anonymous strangers
  ]

  it('draws me, my connections and Community Connectors, nobody else', () => {
    const f = featuredMemberIds(members)
    expect([...f].sort()).toEqual(['k1', 'k2', 'me'])
    expect(f.has('k3')).toBe(false)
  })

  it('adds whoever is selected, so a tapped member still appears', () => {
    expect(featuredMemberIds(members, { selected: 'k4' }).has('k4')).toBe(true)
  })

  it('keeps a large anonymous community calm rather than a carpet of dots', () => {
    const many = Array.from({ length: 61 }, (_, i) => ({ id: `x${i}` }))
    many[0].isSelf = true
    many[1].unlocked = true
    expect(featuredMemberIds(many).size).toBe(2)     // not 61
  })
})

describe('wrapFieldLabel', () => {
  it('wraps a long field name instead of running off the screen', () => {
    expect(wrapFieldLabel('Operations & Supply Chain')).toEqual(['OPERATIONS &', 'SUPPLY CHAIN'])
    expect(wrapFieldLabel('Consulting')).toEqual(['CONSULTING'])
    expect(wrapFieldLabel('Healthcare & Life Sciences').length).toBe(2)
  })
  it('never splits a single long word', () => {
    expect(wrapFieldLabel('Entrepreneurship')).toEqual(['ENTREPRENEURSHIP'])
  })
})

describe('groupByIndustry', () => {
  it('groups by primary industry, folds the tail and null into Other', () => {
    const g = buildDemoGraph()
    const groups = groupByIndustry(g.nodes)
    const labels = groups.map((x) => x.label)
    expect(labels).toContain('Consulting')
    expect(labels).toContain('Entrepreneurship')
    expect(labels).toContain('Finance')
    expect(labels).toContain('Technology')
    const total = groups.reduce((s, x) => s + x.ids.length, 0)
    expect(total).toBe(g.nodes.length)                 // everyone lands somewhere
    const consulting = groups.find((x) => x.label === 'Consulting')
    expect(consulting.ids).toContain('r')              // bridges live in their industry too
  })

  it('never creates IB / PE / VC top-level clusters — they aggregate under Finance (test point 8)', () => {
    const nodes = [
      { id: 'a', industry: 'Investment Banking' },
      { id: 'b', industry: 'Private Equity' },
      { id: 'c', industry: 'VC' },
      { id: 'd', industry: 'Consulting' },
    ]
    const groups = groupByIndustry(nodes)
    const labels = groups.map((g) => g.label)
    expect(labels).toEqual(expect.arrayContaining(['Finance', 'Consulting']))
    expect(labels).not.toContain('Investment Banking')
    expect(labels).not.toContain('Private Equity')
    expect(labels).not.toContain('VC')
    expect(groups.find((g) => g.label === 'Finance').ids.sort()).toEqual(['a', 'b', 'c'])
  })

  it('a multi-focus member appears in exactly one cluster (test point 9)', () => {
    const g = buildDemoGraph()
    const groups = groupByIndustry(g.nodes)
    const seen = groups.flatMap((x) => x.ids)
    expect(seen.length).toBe(new Set(seen).size)       // no duplicates
    expect(seen.length).toBe(g.nodes.length)           // everyone exactly once
  })

  it('Bridge status comes from graph structure, not category count (test point 10)', () => {
    const g = buildDemoGraph()
    // give one non-bridge member many focus areas: still not a bridge
    const nodes = g.nodes.map((n) => (n.id === 'mk' ? { ...n, industry: 'Finance' } : n))
    const bridges = detectBridges(nodes, g.edges)
    expect(bridges.has('mk')).toBe(false)
    expect([...bridges.keys()].sort()).toEqual(['ps', 'r'])
  })
})

describe('deriveEgo — My Circle shows only relationships involving me (test 5)', () => {
  it('drops every relationship between two other members', () => {
    const demo = buildDemoGraph()
    const ego = deriveEgo(demo, 'me')
    expect(ego.edges.every((e) => e.a === 'me' || e.b === 'me')).toBe(true)
    // the community has plenty of other-to-other relationships…
    expect(demo.edges.length).toBeGreaterThan(ego.edges.length)
    // …and none of them appear here (d1-nc is the richest one)
    expect(ego.edges.find((e) => e.a === 'd1' && e.b === 'nc')).toBeUndefined()
  })
})

describe('forceLayout / deriveEgo / nodeDepth', () => {
  it('is deterministic and keeps every node inside the frame', () => {
    const g = buildDemoGraph()
    const p1 = forceLayout(g.nodes, g.edges, { width: 360, height: 240 })
    const p2 = forceLayout(g.nodes, g.edges, { width: 360, height: 240 })
    expect(p1).toEqual(p2)
    for (const id of Object.keys(p1)) {
      expect(p1[id].x).toBeGreaterThanOrEqual(30)
      expect(p1[id].x).toBeLessThanOrEqual(330)
      expect(p1[id].y).toBeGreaterThanOrEqual(24)
      expect(p1[id].y).toBeLessThanOrEqual(208)
    }
  })
  it('deriveEgo keeps only my direct connections and their edges', () => {
    const g = buildDemoGraph()
    const ego = deriveEgo(g, 'me')
    expect(ego.edges.every((e) => e.a === 'me' || e.b === 'me')).toBe(true)
    expect(ego.nodes.map((n) => n.id).sort()).toEqual(['d1', 'mk', 'nc', 'r'])
  })
  it('nodeDepth sums verified moments with the visual cap applied later', () => {
    const g = buildDemoGraph()
    expect(nodeDepth(g.edges, 'me')).toBe(7)          // 4 + 1 + 1 + 1
  })
})
