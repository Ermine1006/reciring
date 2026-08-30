import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import { fetchMyMatches } from '../lib/matches'
import { fetchBothConfirmedMatchIds } from '../lib/recognition'
import { fetchEncounters } from '../lib/eventMemory'
import {
  fetchMyPracticeEdges, fetchProfilesByIds, fetchCommunityBySlug,
  fetchCommunityMapSummary, fetchMyRelationshipGraph, fetchMyPairings,
} from '../lib/practice'
import {
  ORIGIN_META, nodeInitials, edgeWidth, nodeDepth, ribbonWidth,
  buildPersonalGraph, buildDemoGraph, aggregateMapSummary,
  normalizeMapSummary, normalizeMyGraph, deriveEgo,
  tokenMarkers, edgeMotionPolicy, relationshipSummary, relationshipStateLabel,
  relationshipNextStep, locateInsight, ribbonPath,
  nextMilestone, TIER_META, BADGE_META,
  groupByIndustry, fieldLayout, wrapFieldLabel, featuredMemberIds,
  filterEdges, neighbourIds, seed01,
} from '../lib/communityGraph'

// ── Home network module (flag: mutu_home_graph) ─────────────────────
// PUBLIC STATUS, PRIVATE RELATIONSHIPS.
//
//   Community Map — every active member as a named node in their
//     Career-Focus field, plus AGGREGATE ribbons between fields
//     ("Finance ↔ Consulting · 8 mutual connections · 5 verified
//     exchanges"). The browser never receives pair edges or pair
//     token counts here (community_map_summary contract) — so this
//     view physically cannot draw who-meets-whom.
//   Locate me — inside the Map: highlights the signed-in user IN
//     PLACE and overlays ONLY their own relationships (exact origin
//     colours, verified thickness, real token markers). Other
//     members' relationships stay invisible.
//   My Circle — the private ego view: full detail on the user's own
//     relationships (origin, tokens, breakdown, dates, New /
//     Growing / Established states, private milestone progress).
//
// Public identity on the Map is EARNED, evidence-backed status only:
// contribution tier halo, badges, Community Connector — computed
// server-side from verified behaviour. No leaderboards, no
// centrality scores, no rankings, nothing from swipes or profile
// picks. No presence data exists, so nothing claims "active now".

const C = {
  ink: '#1A1712', ink2: '#5F584D', ink3: '#9A958B',
  line: '#ECE7DE', white: '#FFFFFF',
  gold: '#A6822A', goldSoft: '#F8F3E5', goldLine: '#E8D9A7',
  matcha: '#6E7F4A', matchaSoft: '#EDF0E4',
  // members are neutral warm white; meaning comes from placement and
  // earned gold, never from arbitrary colour
  node: '#FDFAF3', nodeLine: '#E2DBCB', olive: '#5C6A3E',
  // quiet flat dot for a member the viewer has no relationship with
  dot: '#C9C2B2',
}
const FONT = 'Inter, system-ui, sans-serif'
const VW = 360, VH = 300                     // My Circle viewBox height
const MAP_VH = 384                           // Community Map viewBox height
const MAP_H = 384
const CX = VW / 2, CY = 106

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'discover', label: 'Discover' },
  { id: 'event', label: 'Events' },
  { id: 'together', label: 'Together' },
]

// My Circle layout: me centred low, direct connections fanned along
// an upper arc (this view IS an ego network — that is its point).
function ringLayout(graph) {
  const meY = 142
  const pos = { [graph.meId]: { x: CX, y: meY } }
  const n = graph.nodes.length
  const twoTier = n > 5
  graph.nodes.forEach((node, i) => {
    const a = Math.PI * (1 + (i + 1) / (n + 1))
    const r = 118 - (twoTier && i % 2 ? 30 : 0)
    const ry = 80 - (twoTier && i % 2 ? 26 : 0)
    pos[node.id] = { x: CX + Math.cos(a) * r, y: meY + Math.sin(a) * ry }
  })
  return pos
}

function driftOf(base, id, t) {
  const p1 = seed01(id) * Math.PI * 2
  const p2 = seed01(id + 'y') * Math.PI * 2
  return {
    x: base.x + Math.sin(t * 0.00022 + p1) * 4,
    y: base.y + Math.cos(t * 0.00017 + p2) * 3.2,
  }
}

const channelLabel = (o) => (o === 'together' ? 'Together' : o === 'event' ? 'Events' : 'Discover')
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''

// Soft per-member pastels, picked deterministically from the member's
// opaque node key: the map stays colourful and readable while telling
// a viewer nothing about who anyone is.
const PASTELS = ['#C9DDF2', '#F4CBA6', '#F2E2A0', '#D8CBEE', '#F5C9C9', '#CFE3C4', '#F0D0E4', '#C7E0DC']
const pastelOf = (id) => PASTELS[Math.floor(seed01(id) * PASTELS.length)]

const BLOB_FILLS = ['rgba(201,163,59,0.10)', 'rgba(110,127,74,0.10)', 'rgba(139,123,184,0.12)', 'rgba(185,143,53,0.08)']
const BLOB_INKS = ['rgba(122,94,23,0.50)', 'rgba(78,92,48,0.50)', 'rgba(96,82,140,0.50)', 'rgba(122,94,23,0.45)']

export default function CommunityNetworkGraph({ userId, userName, communityName = 'Rotman' }) {
  const demoMode = !isSupabaseConfigured

  const [view, setView] = useState('circle')       // production-safe default
  const [map, setMap] = useState({ loading: true, errorKind: null, model: null })
  const [circle, setCircle] = useState({ loading: true, error: null, graph: null, live: false })
  const [locate, setLocate] = useState(false)      // Map: overlay MY edges only
  // The insight card sits over the lower part of the map, which is
  // exactly where a long relationship can run. Dismissing it hides
  // the CARD ONLY — locate stays on and every line stays drawn.
  const [insightHidden, setInsightHidden] = useState(false)
  const [filter, setFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected] = useState(null)   // node id or null
  const [selectedEdge, setSelectedEdge] = useState(null)   // my-edge key or null
  const [selectedLink, setSelectedLink] = useState(null)   // cluster-link key or null
  const [legendOpen, setLegendOpen] = useState(false)

  // ── Loads ────────────────────────────────────────────────────────
  // My Circle prefers the private RPC (my_relationship_graph — only
  // caller-participant rows, node keys shared with the map so Locate
  // me can overlay). Until that migration runs, it falls back to the
  // existing self-scoped client build (same relationship rules).
  const loadCircle = useCallback(async () => {
    setCircle((s) => ({ ...s, loading: true, error: null }))
    if (demoMode) {
      const demo = buildDemoGraph()
      const ego = deriveEgo(demo, 'me')
      const nodes = ego.nodes.map((n) => ({ ...n }))
      setCircle({ loading: false, error: null, live: true, graph: { meId: 'me', nodes, edges: ego.edges, tokensKnown: true } })
      return
    }
    try {
      const { data: community } = await fetchCommunityBySlug('rotman')
      const rpc = await fetchMyRelationshipGraph(community?.id)
      if (!rpc.errorKind) {
        const g = normalizeMyGraph(rpc.data, { userName: userName || 'You' })
        if (g) { setCircle({ loading: false, error: null, live: true, graph: g }); return }
      }
      if (rpc.errorKind === 'error') throw rpc.error || new Error('load_failed')
      // fallback: client-side build from self-scoped reads
      const [pair, enc, tok, m] = await Promise.all([
        fetchMyPairings(), fetchEncounters(userId), fetchMyPracticeEdges(), fetchMyMatches(userId),
      ])
      const matches = m.data || []
      const { data: bothConfirmed } = await fetchBothConfirmedMatchIds(matches.map((x) => x.id))
      const peerIds = [
        ...(tok.data || []).map((e2) => (e2.user_lo === userId ? e2.user_hi : e2.user_lo)),
        ...(pair.data || []).map((p2) => p2.counterpart_user_id).filter(Boolean),
        ...matches.map((x) => (x.requester_user_id === userId ? x.helper_user_id : x.requester_user_id)),
      ]
      const { data: names } = await fetchProfilesByIds(peerIds)
      const g = buildPersonalGraph({
        userId, userName: userName || 'You',
        pairings: pair.data || [],
        practiceEdges: tok.data || [],
        matches,
        bothConfirmedMatchIds: bothConfirmed || new Set(),
        encounters: enc.data || [],
        namesById: names || {},
        communityId: community?.id || null,
      })
      setCircle({ loading: false, error: null, live: false, graph: { meId: 'me', nodes: g.nodes, edges: g.edges, tokensKnown: true } })
    } catch (e) {
      setCircle({ loading: false, error: e?.message || 'load_failed', graph: null, live: false })
    }
  }, [demoMode, userId, userName])

  const loadMap = useCallback(async () => {
    setMap((s) => ({ ...s, loading: true, errorKind: null }))
    if (demoMode) {
      setMap({ loading: false, errorKind: null, model: aggregateMapSummary(buildDemoGraph()) })
      setView('map')
      return
    }
    const { data: community } = await fetchCommunityBySlug('rotman')
    const res = await fetchCommunityMapSummary(community?.id)
    if (res.errorKind) {
      setMap({ loading: false, errorKind: res.errorKind, model: null })
      return                                            // live default stays My Circle
    }
    const model = normalizeMapSummary(res.data)
    if (!model) { setMap({ loading: false, errorKind: 'error', model: null }); return }
    setMap({ loading: false, errorKind: null, model })
    setView('map')
  }, [demoMode])

  useEffect(() => { loadCircle(); loadMap() }, [loadCircle, loadMap])

  // ── View models ──────────────────────────────────────────────────
  const isMap = view === 'map'
  const model = map.model
  const mapMeId = model?.meId || null
  const meId = isMap ? mapMeId : (circle.graph?.meId || 'me')

  // Locate me needs node keys shared between the map and my private
  // graph — true in demo and once both v8 RPCs are live.
  const locateReady = Boolean(model && circle.graph && (demoMode || circle.live))
  const locateOn = isMap && locate && locateReady

  // MY edges, remapped onto map node keys for the Locate overlay.
  const myMapEdges = useMemo(() => {
    if (!locateOn || !mapMeId) return []
    return circle.graph.edges
      .map((e) => ({
        ...e,
        a: e.a === 'me' ? mapMeId : e.a,
        b: e.b === 'me' ? mapMeId : e.b,
      }))
      .filter((e) => model.members.some((m) => m.id === e.a) && model.members.some((m) => m.id === e.b))
  }, [locateOn, circle.graph, mapMeId, model])

  const circleEdges = useMemo(
    () => (circle.graph ? filterEdges(circle.graph.edges, filter) : []),
    [circle.graph, filter]
  )
  // The edges this view actually renders: the map draws NONE unless
  // Locate me is on (and then only mine); My Circle draws mine.
  const renderedEdges = isMap ? myMapEdges : circleEdges

  const highlight = useMemo(() => {
    if (selectedEdge) {
      const e = renderedEdges.find((x) => `${x.a}-${x.b}` === selectedEdge)
      if (e) return new Set([e.a, e.b])
    }
    if (locateOn) return neighbourIds(myMapEdges, mapMeId)
    if (!isMap) return neighbourIds(circleEdges, meId)
    return selected ? new Set([selected]) : null       // map: soft focus only
  }, [selectedEdge, renderedEdges, locateOn, myMapEdges, mapMeId, isMap, circleEdges, selected, meId])

  // Map background fields: members grouped by broad Career Focus.
  const industryGroups = useMemo(
    () => (isMap && model ? groupByIndustry(model.members) : []),
    [isMap, model]
  )

  const layout = useMemo(() => {
    if (isMap) {
      if (!model) return {}
      const rank = (id) => {
        if (id === mapMeId) return 0
        const m = model.members.find((x) => x.id === id)
        if (m?.connector) return 1
        if (m && m.tier !== 'new') return 2
        return 3
      }
      const ordered = industryGroups.map((g) => ({
        label: g.label,
        ids: [...g.ids].sort((a, b) => rank(a) - rank(b) || (seed01(a) - seed01(b))),
      }))
      return fieldLayout(ordered, { width: VW, height: MAP_H - 8 })
    }
    return { pos: circle.graph ? ringLayout(circle.graph) : {}, fields: [] }
  }, [isMap, model, industryGroups, mapMeId, circle.graph])
  const basePos = layout.pos

  // One geometry per Career Focus field, produced by the layout
  // itself: the tinted area, its label and the aggregate paths all use
  // it, so a path is anchored to the FIELD and trimmed at its edge.
  const fields = layout.fields
  // Only meaningful members are drawn; the rest live in their field's
  // size and count, which is calmer AND says more.
  const featured = useMemo(
    () => (isMap && model ? featuredMemberIds(model.members, { selected }) : new Set()),
    [isMap, model, selected]
  )

  // Drawn nodes get room to breathe: a short separation pass pushes
  // the few visible members apart (and keeps each inside its own
  // field), so neither the circles nor their names ever collide.
  const fieldByLabel = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.label, f])), [fields]
  )

  const nodePos = useMemo(() => {
    if (!isMap || !model) return basePos
    const fieldOf = new Map()
    for (const g of industryGroups) {
      const f = fieldByLabel[g.label]
      if (f) for (const id of g.ids) fieldOf.set(id, f)
    }
    const pos = { ...basePos }
    const ids = [...featured].filter((id) => pos[id])
    if (ids.length < 2) return pos
    for (let it = 0; it < 90; it++) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const A = pos[ids[i]], B = pos[ids[j]]
          const dx = B.x - A.x, dy = B.y - A.y
          const d = Math.hypot(dx, dy) || 0.01
          if (d < 42) {
            const push = (42 - d) / 2
            pos[ids[i]] = { x: A.x - (dx / d) * push, y: A.y - (dy / d) * push }
            pos[ids[j]] = { x: B.x + (dx / d) * push, y: B.y + (dy / d) * push }
          }
        }
      }
      for (const id of ids) {
        const f = fieldOf.get(id)
        if (!f) continue
        const p = pos[id]
        const dx = p.x - f.x, dy = p.y - f.y
        const d = Math.hypot(dx, dy)
        const max = Math.max(0, f.r - 15)
        if (d > max) pos[id] = { x: f.x + (dx / d) * max, y: f.y + (dy / d) * max }
      }
    }
    return pos
  }, [isMap, model, basePos, featured, industryGroups, fieldByLabel])

  // Tap-to-zoom: gently toward the selected member (Map) or the
  // user's own circle (Locate me). Layout itself never rearranges.
  const camera = useMemo(() => {
    if (!isMap || !model) return { s: 1, tx: 0, ty: 0 }
    // Locate me never moves the camera: the complete community layout
    // stays exactly where it is, and the highlight does the work.
    if (locateOn) return { s: 1, tx: 0, ty: 0 }
    const pts = selected ? [nodePos[selected]].filter(Boolean) : []
    if (pts.length === 0) return { s: 1, tx: 0, ty: 0 }
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x))
    const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y))
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const bw = Math.max(90, maxX - minX + 90), bh = Math.max(90, maxY - minY + 110)
    const s = Math.min(1.7, Math.max(1.1, 0.82 * Math.min(VW / bw, MAP_VH / bh)))
    let tx = VW / 2 - s * cx
    let ty = MAP_VH / 2 - s * cy
    tx = Math.min(0, Math.max(VW - s * VW, tx))
    ty = Math.min(0, Math.max(MAP_VH - s * MAP_VH, ty))
    return { s, tx, ty }
  }, [isMap, model, locateOn, selected, mapMeId, myMapEdges, nodePos])

  useEffect(() => {
    setSelected(view === 'circle' ? (circle.graph?.meId || 'me') : null)
    setSelectedEdge(null); setSelectedLink(null)
    if (view !== 'map') setLocate(false)
    setInsightHidden(false)
  }, [view, circle.graph])

  // ── Animation engine (imperative per-frame updates) ─────────────
  const wrapRef = useRef(null)
  const nodeRefs = useRef({})
  const edgeRefs = useRef({})
  const dotRefs = useRef({})
  const running = useRef({ raf: 0, visible: true, tabVisible: true })
  const reduced = useMemo(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
  }, [])

  const allNodeIds = useMemo(() => {
    if (isMap) return model ? model.members.map((m) => m.id) : []
    return circle.graph ? [meId, ...circle.graph.nodes.map((n) => n.id)] : []
  }, [isMap, model, circle.graph, meId])

  useEffect(() => {
    if (allNodeIds.length === 0) return undefined
    const R = running.current

    const setPositions = (t) => {
      const pos = {}
      for (const id of allNodeIds) {
        const b = nodePos[id]
        if (b) pos[id] = reduced ? b : driftOf(b, id, t)
      }
      for (const [id, el] of Object.entries(nodeRefs.current)) {
        if (el && pos[id]) el.setAttribute('transform', `translate(${pos[id].x} ${pos[id].y})`)
      }
      for (const e of renderedEdges) {
        const key = `${e.a}-${e.b}`
        const a = pos[e.a], b = pos[e.b]
        if (!a || !b) continue
        for (const el of [edgeRefs.current[key], edgeRefs.current[`${key}:hit`]]) {
          if (el) {
            el.setAttribute('x1', a.x); el.setAttribute('y1', a.y)
            el.setAttribute('x2', b.x); el.setAttribute('y2', b.y)
          }
        }
        // Gold double-ring token markers: slow, and only on MY OWN
        // relationships (the only pair edges the browser ever holds).
        const tokens = e.tokens || 0
        if (tokens > 0) {
          const { moving } = tokenMarkers(tokens)
          for (let i = 0; i < moving; i++) {
            const el = dotRefs.current[`${key}:${i}`]
            if (!el) continue
            const isStatic = el.dataset.motion === 'static'
            const k = isStatic
              ? 0.5 + (i - (moving - 1) / 2) * 0.18
              : (t * 0.000045 + seed01(e.a + e.b) + i / moving) % 1
            el.setAttribute('transform',
              `translate(${a.x + (b.x - a.x) * k} ${a.y + (b.y - a.y) * k})`)
          }
          const lbl = dotRefs.current[`${key}:label`]
          if (lbl) lbl.setAttribute('transform',
            `translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 8})`)
        }
      }
    }

    setPositions(0)
    if (reduced) return undefined

    const tick = (t) => {
      if (R.visible && R.tabVisible) setPositions(t)
      R.raf = requestAnimationFrame(tick)
    }
    R.raf = requestAnimationFrame(tick)
    const io = new IntersectionObserver(([en]) => { R.visible = en.isIntersecting }, { threshold: 0.05 })
    if (wrapRef.current) io.observe(wrapRef.current)
    const onVis = () => { R.tabVisible = document.visibilityState === 'visible' }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(R.raf)
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [allNodeIds, nodePos, renderedEdges, reduced])

  // Locate me insight, derived from MY OWN relationships only.
  const insight = useMemo(() => {
    if (!locateOn || !circle.graph || !model) return null
    const focusByPeer = {}
    for (const m of model.members) focusByPeer[m.id] = m.industry
    // circle edges are always {a:'me', b:<map node key>}
    return locateInsight({
      edges: circle.graph.edges, focusByPeer,
      communityName: (model.summary?.name || communityName).trim(),
    })
  }, [locateOn, circle.graph, model, communityName])

  // ── Shell ────────────────────────────────────────────────────────
  const shell = (children) => (
    <div ref={wrapRef} style={{
      marginTop: 16, background: C.white, border: `1px solid ${C.line}`,
      borderRadius: 20, padding: '15px 16px 13px', boxShadow: '0 4px 18px rgba(60,45,10,0.05)',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )

  const loading = isMap ? map.loading : circle.loading
  if (loading && !(isMap ? model : circle.graph)) {
    return shell(
      <div aria-hidden="true">
        <div style={{ width: 130, height: 18, borderRadius: 7, background: '#F0EDE6' }} />
        <div style={{ width: 210, height: 11, borderRadius: 6, background: '#F4F1EB', marginTop: 7 }} />
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block', marginTop: 8 }}>
          <circle cx={CX} cy={CY} r="22" fill="#EFECE5" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2
            return <circle key={i} cx={CX + Math.cos(a) * 100} cy={CY + Math.sin(a) * 60} r="12" fill="#F3F0E9" />
          })}
        </svg>
      </div>
    )
  }

  // ── Header ───────────────────────────────────────────────────────
  const summary = model?.summary || null
  const rawCommunityName = (summary?.name || communityName).trim()
  const title = isMap
    ? (rawCommunityName.split(/\s+/).length > 1 ? rawCommunityName : `${rawCommunityName} Community`)
    : 'My Circle'
  const circleVerifiedTotal = circle.graph
    ? circle.graph.edges.reduce((s2, e) => s2 + (e.verified || 0), 0) : null
  // Community-level aggregates are public by design; pair data never
  // is. The community metric leads with movement (relationships
  // strengthened), not a raw count nobody can interpret.
  const countsLine = isMap
    ? (summary
        ? `${summary.members} members`
          + (summary.strengthened30d > 0
              ? ` · ${summary.strengthened30d} relationship${summary.strengthened30d === 1 ? '' : 's'} strengthened this month`
              : (summary.verifiedTotal != null
                  ? ` · ${summary.verifiedTotal} verified exchange${summary.verifiedTotal === 1 ? '' : 's'}` : ''))
        : null)
    : (circle.graph
        ? `${circle.graph.edges.length} ${circle.graph.edges.length === 1 ? 'person' : 'people'} in your circle`
          + (circleVerifiedTotal != null
              ? ` · ${circleVerifiedTotal} verified exchange${circleVerifiedTotal === 1 ? '' : 's'}` : '')
        : null)
  const subtitle = isMap && !locateOn
    ? 'See how the community connects, without exposing private relationships.'
    : null
  const header = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div role="tablist" style={{ display: 'flex', flex: 1, background: '#F6F4EF', borderRadius: 99, padding: 3, gap: 3 }}>
          {[{ id: 'map', label: 'Community Map' }, { id: 'circle', label: 'My Circle' }].map((v) => {
            const on = view === v.id
            return (
              <button key={v.id} type="button" role="tab" aria-selected={on} onClick={() => setView(v.id)}
                style={{
                  flex: 1, border: 'none', borderRadius: 99, padding: '7px 0',
                  fontSize: 11.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                  background: on ? C.white : 'transparent', color: on ? C.matcha : C.ink2,
                  boxShadow: on ? '0 1px 4px rgba(60,45,10,0.10)' : 'none',
                }}>
                {v.label}
              </button>
            )
          })}
        </div>
        {!isMap && (
          <button type="button" onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
              border: `1px solid ${filter !== 'all' ? C.matcha : C.line}`, borderRadius: 99,
              background: filter !== 'all' ? C.matchaSoft : C.white,
              color: filter !== 'all' ? C.matcha : C.ink2,
              padding: '6px 11px', fontSize: 11, fontWeight: 650, fontFamily: FONT, cursor: 'pointer',
            }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {filter === 'all' ? 'Filter' : FILTERS.find((f) => f.id === filter)?.label}
          </button>
        )}
      </div>
      {!isMap && filterOpen && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const on = filter === f.id
            return (
              <button key={f.id} type="button" onClick={() => { setFilter(f.id); if (f.id !== 'all') setFilterOpen(true) }}
                style={{
                  border: `1px solid ${on ? C.matcha : C.line}`, borderRadius: 99,
                  background: on ? C.matchaSoft : C.white, color: on ? C.matcha : C.ink2,
                  padding: '4px 12px', fontSize: 11, fontWeight: 650, fontFamily: FONT,
                  cursor: 'pointer', transition: 'all 0.25s ease',
                }}>
                {f.label}
              </button>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: C.ink, letterSpacing: '-0.015em', fontFamily: FONT, lineHeight: 1.25 }}>
              {title}
            </h2>
            {demoMode && (
              <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.ink3, border: `1px solid ${C.line}`, borderRadius: 5, padding: '1px 6px', fontFamily: FONT }}>
                Demo data
              </span>
            )}
          </div>
          {countsLine && (
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: C.ink2, fontFamily: FONT }}>
              {countsLine}
              <button type="button" onClick={() => setLegendOpen((o) => !o)}
                aria-label="About this view"
                style={{
                  marginLeft: 6, width: 15, height: 15, borderRadius: '50%',
                  border: `1px solid ${legendOpen ? C.gold : C.line}`,
                  background: legendOpen ? C.goldSoft : C.white,
                  color: legendOpen ? C.gold : C.ink3,
                  fontSize: 9.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                  verticalAlign: '1px', padding: 0, lineHeight: '13px',
                }}>
                i
              </button>
            </p>
          )}
          {subtitle && (
            <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.ink3, fontFamily: FONT, lineHeight: 1.45 }}>
              {subtitle}
            </p>
          )}
          {legendOpen && (
            <div style={{
              marginTop: 8, background: C.goldSoft, border: `1px solid ${C.goldLine}`,
              borderRadius: 12, padding: '9px 12px',
            }}>
              {/* Exact-edge copy appears ONLY where the viewer may see
                  exact edges (My Circle / Locate me). The default Map
                  explains the aggregate view. */}
              <p style={{ margin: 0, fontSize: 11, color: '#6B5518', lineHeight: 1.55, fontFamily: FONT }}>
                {isMap && !locateOn
                  ? 'Members sit inside their broad Career Focus. Wider paths mean more verified collaboration between these parts of the community. Individual relationships remain private, and a name appears only after you and that member connect.'
                  : 'A line appears after you both connect. A moving Token appears after you both verify a completed exchange. Only you and each partner can see these.'}
              </p>
              {isMap && !locateOn && model.suppressedLinks > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 10.5, color: '#6B5518', opacity: 0.85, lineHeight: 1.5, fontFamily: FONT }}>
                  {model.suppressedLinks} field pair{model.suppressedLinks === 1 ? ' is' : 's are'} not shown because those groups are still too small to summarise privately.
                </p>
              )}
            </div>
          )}
        </div>
        {isMap && model && locateReady && (
          <button type="button"
            onClick={() => {
              setLocate((o) => !o)
              setInsightHidden(false)   // re-entering locate brings the summary back
              setSelected(null); setSelectedEdge(null); setSelectedLink(null)
            }}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
              border: `1px solid ${locateOn ? C.matcha : C.line}`,
              background: locateOn ? C.matchaSoft : C.white,
              color: locateOn ? C.matcha : C.ink2,
              borderRadius: 99, padding: '7px 13px', fontSize: 11.5, fontWeight: 700,
              fontFamily: FONT, cursor: 'pointer',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" opacity="0.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            {locateOn ? 'Exit locate' : 'Locate me'}
          </button>
        )}
      </div>
    </>
  )

  // ── Non-graph states ─────────────────────────────────────────────
  if (isMap && !model) {
    const kind = map.errorKind
    return shell(
      <>
        {header}
        <div style={{ textAlign: 'center', padding: '70px 22px' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.ink2, lineHeight: 1.6, fontFamily: FONT }}>
            {kind === 'missing'
              ? "The Community Map isn't live yet. It switches on once the community data model is enabled."
              : kind === 'denied'
                ? 'The Community Map is available to active community members.'
                : "We couldn't load the Community Map right now."}
          </p>
          <button type="button" onClick={loadMap} style={{
            marginTop: 12, border: `1px solid ${C.goldLine}`, background: C.goldSoft,
            color: C.gold, borderRadius: 10, padding: '8px 18px', fontSize: 12.5,
            fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
          }}>
            {kind === 'error' ? 'Try again' : 'Check again'}
          </button>
        </div>
      </>
    )
  }

  if (!isMap && circle.error) {
    return shell(
      <>
        {header}
        <div style={{ textAlign: 'center', padding: '70px 22px' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.ink2, fontFamily: FONT }}>
            We couldn't load your circle right now.
          </p>
          <button type="button" onClick={loadCircle} style={{
            marginTop: 12, border: `1px solid ${C.goldLine}`, background: C.goldSoft,
            color: C.gold, borderRadius: 10, padding: '8px 18px', fontSize: 12.5,
            fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
          }}>
            Try again
          </button>
        </div>
      </>
    )
  }

  const empty = isMap
    ? (model?.members.length || 0) === 0
    : (circle.graph?.nodes.length || 0) === 0

  // ── Selection models ─────────────────────────────────────────────
  const selId = !isMap ? (selected || meId) : selected
  const selMember = isMap && selId ? model.members.find((m) => m.id === selId) : null
  const selNodeCircle = !isMap && selId
    ? (selId === meId
        ? { id: meId, name: userName || 'You', isSelf: true }
        : circle.graph?.nodes.find((n) => n.id === selId))
    : null
  const selEdges = !isMap && selId ? circleEdges.filter((e) => e.a === selId || e.b === selId) : []
  const selChannels = [...new Set(selEdges.map((e) => e.origin))].map(channelLabel)
  const myTokens = circle.graph
    ? circle.graph.edges.reduce((s, e) => s + (e.tokens || 0), 0) : 0

  const selEdgeObj = selectedEdge
    ? renderedEdges.find((e) => `${e.a}-${e.b}` === selectedEdge) || null
    : null
  // Both views only ever draw MY relationships, so the other end is
  // always someone I am connected to — my private graph has the name.
  const edgeEndName = (id) => {
    if (id === meId || id === mapMeId || id === 'me') return 'You'
    const node = circle.graph?.nodes.find((x) => x.id === id)
    return firstName(node?.name) || 'Community member'
  }
  const selLinkObj = selectedLink
    ? model?.links.find((l) => `${l.a}|${l.b}` === selectedLink) || null
    : null

  const milestone = nextMilestone(circleVerifiedTotal)
  const manyNodes = isMap && (model?.members.length || 0) > 18

  // Gold marks sustained contribution only. A first exchange does not
  // ring a node, otherwise the whole map turns gold and says nothing.
  const tierHalo = (m) => {
    if (!m) return null
    if (m.tier === 'builder') return { w: 1.8, o: 0.9 }
    if (m.tier === 'established') return { w: 1.3, o: 0.6 }
    return null
  }

  return shell(
    <>
      {header}
      {empty ? (
        <div style={{ padding: '76px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.ink3, lineHeight: 1.6, fontFamily: FONT }}>
            Your community network will grow as members meet and complete things together.
          </p>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <style>{`
            @keyframes mutuPulse {
              0%   { r: 16; opacity: 0.5; }
              70%  { r: 26; opacity: 0; }
              100% { r: 26; opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
              .mutu-pulse { animation: none !important; opacity: 0.35; }
            }
          `}</style>

          <svg viewBox={`0 0 ${VW} ${isMap ? MAP_VH : VH}`} style={{ width: '100%', display: 'block', marginTop: 2, touchAction: 'manipulation' }}
            role="img" aria-label={`${communityName} ${isMap ? 'community map' : 'relationship circle'}`}>

            <g style={{
              transform: `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.s})`,
              transition: 'transform 0.5s ease',
            }}>

            {view === 'circle' && (
              <path d={`M ${CX - 118} 142 A 118 80 0 0 1 ${CX + 118} 142`}
                fill="none" stroke={C.line} strokeWidth="0.7" opacity="0.55" />
            )}

            {/* Activity between fields: aggregate paths anchored to the
                CENTRES of two Career Focus fields and trimmed at each
                field's edge, drawn under everything. They summarise a
                whole field pair, never a relationship. Field pairs too
                small to publish are suppressed upstream. */}
            {isMap && !locateOn && model.links.map((l) => {
              const a = fieldByLabel[l.aLabel], b = fieldByLabel[l.bLabel]
              if (!a || !b) return null
              const key = `${l.a}|${l.b}`
              const on = selectedLink === key
              const { d } = ribbonPath(a, b, { padA: 4, padB: 4 })
              return (
                <g key={key}>
                  <path d={d} fill="none" strokeLinecap="round"
                    stroke={on ? 'rgba(166,130,42,0.30)' : 'rgba(166,130,42,0.13)'}
                    strokeWidth={ribbonWidth(l.tier)}
                    style={{ transition: 'stroke 0.3s ease' }} />
                  <path d={d} fill="none" stroke="rgba(0,0,0,0)" strokeWidth="22" strokeLinecap="round"
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onClick={() => { setSelectedLink(on ? null : key); setSelected(null); setSelectedEdge(null) }} />
                </g>
              )
            })}

            {/* Career Focus fields: placement carries the meaning, so
                the tint stays quiet and the label sits clear of the
                members and inside the viewport. */}
            {isMap && fields.map((f, i) => {
              // the label sits ABOVE the field, never over a member,
              // wraps instead of running off the screen, and is nudged
              // inward so it always fits the viewport
              const lines = [...wrapFieldLabel(f.label), `${f.size} member${f.size === 1 ? '' : 's'}`]
              const halfWidth = 3.1 * Math.max(...lines.map((l) => l.length))
              const lx = Math.min(VW - halfWidth - 4, Math.max(halfWidth + 4, f.x))
              const top = Math.max(9 + (lines.length - 1) * 9, f.y - f.r - 6 - (lines.length - 1) * 9)
              return (
                <g key={`field-${f.label}`} style={{ pointerEvents: 'none', opacity: locateOn ? 0.45 : 1, transition: 'opacity 0.45s ease' }}>
                  <circle cx={f.x} cy={f.y} r={f.r} fill={BLOB_FILLS[i % BLOB_FILLS.length]} />
                  <text x={lx} y={top} textAnchor="middle"
                    style={{
                      fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em',
                      fill: BLOB_INKS[i % BLOB_INKS.length], fontFamily: FONT,
                      // stays readable where a label passes over a neighbouring field
                      paintOrder: 'stroke', stroke: '#FFFFFF', strokeWidth: 2.6,
                    }}>
                    {lines.map((line, li) => (
                      <tspan key={line} x={lx} dy={li === 0 ? 0 : 9.5}
                        style={li === lines.length - 1
                          ? { fontSize: 7.5, fontWeight: 600, letterSpacing: '0.06em', opacity: 0.75 }
                          : undefined}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            })}

            {/* Locate me: MY relationships only — exact origin colour,
                verified thickness, real minted token markers. Nobody
                else's edges are in the payload, so nothing else can
                render. */}
            {renderedEdges.map((e) => {
              const key = `${e.a}-${e.b}`
              const isSelEdge = selectedEdge === key
              const active = !highlight || (highlight.has(e.a) && highlight.has(e.b))
              const tokens = e.tokens || 0
              const { moving, label } = tokenMarkers(tokens)
              const focused = isSelEdge || [e.a, e.b].some((id) => id === meId || id === selected)
              const dense = renderedEdges.length > 24
              const policy = edgeMotionPolicy({ tokens, reduced, dense, focused })
              return (
                <g key={key} style={{ opacity: active ? 0.92 : 0.12, transition: 'opacity 0.45s ease' }}>
                  <line ref={(el) => { edgeRefs.current[key] = el }}
                    stroke={ORIGIN_META[e.origin]?.color || C.ink3}
                    strokeWidth={edgeWidth(e.verified ?? e.depth)} strokeLinecap="round" />
                  <line ref={(el) => { edgeRefs.current[`${key}:hit`] = el }}
                    stroke="rgba(0,0,0,0)" strokeWidth="14" strokeLinecap="round"
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onClick={() => { setSelectedEdge(isSelEdge ? null : key); setSelected(null); setSelectedLink(null) }} />
                  {policy !== 'none' && Array.from({ length: moving }).map((_, i) => (
                    <g key={`${key}:${i}`}
                      ref={(el) => { if (el) { el.dataset.motion = policy; dotRefs.current[`${key}:${i}`] = el } }}
                      style={{ pointerEvents: 'none' }}>
                      <circle r="5.4" fill="#FFFDF5" opacity="0.92" />
                      <circle cx="-1.7" r="3" fill="none" stroke="#A6822A" strokeWidth="1.5" />
                      <circle cx="1.7" r="3" fill="none" stroke="#C9A33B" strokeWidth="1.5" />
                    </g>
                  ))}
                  {policy !== 'none' && label && (
                    <g ref={(el) => { dotRefs.current[`${key}:label`] = el }} style={{ pointerEvents: 'none' }}>
                      <text textAnchor="middle" style={{ fontSize: 9, fontWeight: 800, fill: C.gold, fontFamily: FONT, paintOrder: 'stroke', stroke: '#FFFFFF', strokeWidth: 3 }}>
                        {label}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* Map members: named nodes with EARNED public identity —
                tier halo, Community Connector ring. No pair data. */}
            {/* Everyone in the community is visible. Members the
                viewer has no relationship with are quiet flat dots —
                no ring, no inner dot, nothing repeated — so the field
                reads as people rather than as a pattern. */}
            {isMap && model.members.filter((m) => !featured.has(m.id)).map((m) => (
              <g key={m.id} ref={(el) => { nodeRefs.current[m.id] = el }}
                onClick={() => { setSelectedEdge(null); setSelectedLink(null); setSelected((s2) => (s2 === m.id ? null : m.id)) }}
                style={{
                  cursor: 'pointer',
                  opacity: highlight ? 0.3 : (m.tier === 'new' ? 0.5 : 0.72),
                  transition: 'opacity 0.45s ease',
                }}>
                <circle r="9" fill="rgba(0,0,0,0)" />
                <circle r={m.connector ? 6.4 : 5.4} fill={pastelOf(m.id)}
                  stroke="#FFFFFF" strokeWidth="1.4" />
                {m.connector && (
                  <circle r="9" fill="none" stroke={C.gold} strokeWidth="1.2" strokeDasharray="2.4 2.4" opacity="0.8" />
                )}
              </g>
            ))}

            {isMap && model.members.filter((m) => featured.has(m.id)).map((m) => {
              const isMe = m.id === mapMeId
              const on = !highlight || highlight.has(m.id)
              const isSel = selected === m.id || (locateOn && isMe)
              const baseR = (isMe ? 13 : 10) + (m.tier === 'builder' ? 2 : m.tier === 'established' ? 1 : 0)
              const zoom = isSel ? 1.4 : highlight && on ? 1.12 : highlight ? 0.85 : 1
              const r = baseR * zoom
              const halo = tierHalo(m)
              // Identity is unlocked per viewer by the RPC: a name
              // exists here only for me and for people I connected
              // with bilaterally. Everyone else is a neutral node.
              const known = m.unlocked ? m.name : null
              // Labels stay quiet on first load: my own circle and the
              // selection are named, the rest reveal on tap.
              // quiet first load: initials sit inside the node, and a
              // name label appears on tap or in Locate me
              const showLabel = !isMe && Boolean(known) && (locateOn || isSel)
              // Names never collide: when another DRAWN node sits close
              // by, the label moves to the side instead of stacking
              // above or below it.
              // Names never collide: nodes that sit close together
              // alternate their label above and below, which separates
              // them whichever way they are arranged.
              const here = nodePos[m.id]
              const crowded = showLabel && here && [...featured].some((id) => {
                const p = nodePos[id]
                return id !== m.id && p && Math.hypot(p.x - here.x, p.y - here.y) < 44
              })
              const rank = [...featured].sort().indexOf(m.id)
              const label = crowded && rank % 2 === 0
                ? { dx: 0, dy: -(r + 8), anchor: 'middle' }
                : { dx: 0, dy: r + 13, anchor: 'middle' }
              return (
                <g key={m.id} ref={(el) => { nodeRefs.current[m.id] = el }}
                  onClick={() => { setSelectedEdge(null); setSelectedLink(null); setSelected((s) => (s === m.id ? null : m.id)) }}
                  style={{ cursor: 'pointer', opacity: on ? 1 : 0.26, transition: 'opacity 0.45s ease' }}>
                  {/* generous tap target regardless of drawn radius */}
                  <circle r={Math.max(15, r + 5)} fill="rgba(0,0,0,0)" />
                  {isSel && <circle className="mutu-pulse" r={r + 5} fill="none" stroke={C.matcha} strokeWidth="1.6"
                    style={{ animation: 'mutuPulse 2.6s ease-out infinite' }} />}
                  {isSel && <circle r={r + 3.5} fill="none" stroke={C.matcha} strokeWidth="1.7" strokeDasharray="3 2.6" />}
                  {/* Community Connector: earned structural role, drawn
                      as a recognisable double halo (never a score) */}
                  {m.connector && !isSel && (
                    <>
                      <circle r={r + 5.4} fill="none" stroke={C.gold} strokeWidth="1" opacity="0.45" />
                      <circle r={r + 2.6} fill="none" stroke={C.gold} strokeWidth="1.6" opacity="0.95" />
                    </>
                  )}
                  {/* Contribution halo: verified contribution, never popularity */}
                  {halo && !m.connector && !isSel && (
                    <circle r={r + 2.6} fill="none" stroke={C.gold} strokeWidth={halo.w} opacity={halo.o} />
                  )}
                  {isMe ? (
                    <>
                      <circle r={r} fill={C.olive} stroke="#FFFFFF" strokeWidth="2.2" style={{ transition: 'r 0.35s ease' }} />
                      <text textAnchor="middle" dy="3.4" style={{ fontSize: 8.5, fontWeight: 800, fill: '#fff', letterSpacing: '0.04em', fontFamily: FONT }}>YOU</text>
                    </>
                  ) : (
                    <>
                      <circle r={r} fill={pastelOf(m.id)} stroke="#FFFFFF" strokeWidth="2" style={{ transition: 'r 0.35s ease' }} />
                      {/* initials when unlocked; otherwise a plain
                          circle — never a ring with a dot inside */}
                      {known && (
                        <text textAnchor="middle" dy="3.4" style={{ fontSize: 9, fontWeight: 700, fill: C.ink2, fontFamily: FONT }}>
                          {nodeInitials(known)}
                        </text>
                      )}
                    </>
                  )}
                  {showLabel && (
                    <text textAnchor={label.anchor} dx={label.dx} dy={label.dy}
                      style={{ fontSize: 9.5, fontWeight: 600, fill: C.ink2, fontFamily: FONT, paintOrder: 'stroke', stroke: C.white, strokeWidth: 3.2 }}>
                      {firstName(known)}
                    </text>
                  )}
                </g>
              )
            })}

            {/* My Circle nodes */}
            {!isMap && circle.graph?.nodes.map((n) => {
              const on = !highlight || highlight.has(n.id)
              const isSel = selected === n.id
              const depth = Math.min(4, Math.round(nodeDepth(circleEdges, n.id) / 2))
              const r = (10 + depth) * (isSel ? 1.4 : 1)
              return (
                <g key={n.id} ref={(el) => { nodeRefs.current[n.id] = el }}
                  onClick={() => { setSelectedEdge(null); setSelected((s) => (s === n.id ? meId : n.id)) }}
                  style={{ cursor: 'pointer', opacity: on ? 1 : 0.24, transition: 'opacity 0.45s ease' }}>
                  <circle r={Math.max(15, r + 5)} fill="rgba(0,0,0,0)" />
                  {isSel && <circle r={r + 3.5} fill="none" stroke={C.matcha} strokeWidth="1.7" strokeDasharray="3 2.6" />}
                  <circle r={r} fill={C.node} stroke={C.nodeLine} strokeWidth="1.4" style={{ transition: 'r 0.35s ease' }} />
                  <text textAnchor="middle" dy="3.6" style={{ fontSize: 9.5, fontWeight: 700, fill: C.ink, fontFamily: FONT }}>
                    {nodeInitials(n.name)}
                  </text>
                  <text textAnchor="middle" dy={r + 13} style={{ fontSize: 9.5, fontWeight: 600, fill: C.ink2, fontFamily: FONT }}>
                    {firstName(n.name)}
                  </text>
                </g>
              )
            })}

            {/* My Circle draws me at the centre */}
            {!isMap && (
              <g ref={(el) => { nodeRefs.current[meId] = el }} onClick={() => setSelected(meId)}
                style={{ cursor: 'pointer' }}>
                {(!selected || selected === meId) && (
                  <circle className="mutu-pulse" r="21" fill="none" stroke={C.matcha} strokeWidth="1.8"
                    style={{ animation: 'mutuPulse 2.6s ease-out infinite' }} />
                )}
                <circle r="18" fill="#5C6A3E" stroke="#FFFFFF" strokeWidth="2.2" />
                <text textAnchor="middle" dy="3.6" style={{ fontSize: 8.8, fontWeight: 800, fill: '#fff', letterSpacing: '0.04em', fontFamily: FONT }}>YOU</text>
              </g>
            )}
            </g>
          </svg>

          {/* Selected RELATIONSHIP strip — participants only (My
              Circle / Locate me): origin, verified count, state,
              strengthening channels, last verified date. */}
          {selEdgeObj && (
            <div style={{
              position: 'absolute', left: 6, right: 6, bottom: 4,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
              border: `1px solid ${C.line}`, borderRadius: 14, padding: '9px 13px',
              boxShadow: '0 4px 14px rgba(60,45,10,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {edgeEndName(selEdgeObj.a)} · {edgeEndName(selEdgeObj.b)}
                </span>
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.matcha, background: C.matchaSoft, borderRadius: 99, padding: '3px 9px', fontFamily: FONT }}>
                  {relationshipStateLabel(selEdgeObj.verified)}
                </span>
                <span style={{ flex: 1 }} />
                {(selEdgeObj.tokens || 0) > 0 && (
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: C.gold, fontFamily: FONT }}>
                    <svg width="16" height="12" viewBox="0 0 44 32" fill="none">
                      <circle cx="15" cy="16" r="11" stroke="#A6822A" strokeWidth="4" />
                      <circle cx="29" cy="16" r="11" stroke="#C9A33B" strokeWidth="4" />
                    </svg>
                    {selEdgeObj.tokens} token{selEdgeObj.tokens === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
                {relationshipSummary(selEdgeObj).join(' · ')}
              </p>
              {/* one honest next step for THIS relationship, never a
                  countdown and never invented progress */}
              {relationshipNextStep(selEdgeObj.verified) && (
                <p style={{ margin: '3px 0 0', fontSize: 10.5, color: C.matcha, fontFamily: FONT, lineHeight: 1.45 }}>
                  {relationshipNextStep(selEdgeObj.verified)}
                </p>
              )}
            </div>
          )}

          {/* Cluster-link strip: community aggregate, no pairs */}
          {!selEdgeObj && selLinkObj && (
            <div style={{
              position: 'absolute', left: 6, right: 6, bottom: 4,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
              border: `1px solid ${C.line}`, borderRadius: 14, padding: '9px 13px',
              boxShadow: '0 4px 14px rgba(60,45,10,0.08)',
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
                {selLinkObj.aLabel} ↔ {selLinkObj.bLabel}
              </span>
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
                {selLinkObj.connections} mutual connection{selLinkObj.connections === 1 ? '' : 's'}
                {' · '}
                {selLinkObj.verified} verified exchange{selLinkObj.verified === 1 ? '' : 's'}
              </p>
            </div>
          )}

          {/* Locate me: private insight about MY position, visible to
              nobody else. The bridge sentence only appears when my own
              verified relationships actually span two circles. */}
          {locateOn && insight && !insightHidden && !selEdgeObj && !selLinkObj && !selMember && (
            <div style={{
              position: 'absolute', left: 6, right: 6, bottom: 4,
              background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
              border: `1px solid ${C.line}`, borderRadius: 14, padding: '9px 13px',
              boxShadow: '0 4px 14px rgba(60,45,10,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
                  {insight.title}
                </span>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => setInsightHidden(true)}
                  aria-label="Hide this summary and keep my relationships shown"
                  style={{
                    flexShrink: 0, border: `1px solid ${C.line}`, background: C.white,
                    color: C.ink2, borderRadius: 99, padding: '3px 10px',
                    fontSize: 10.5, fontWeight: 650, fontFamily: FONT, cursor: 'pointer',
                  }}>
                  Close
                </button>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
                {insight.line}
              </p>
              {insight.bridge && (
                <p style={{ margin: '3px 0 0', fontSize: 10.5, color: C.matcha, fontFamily: FONT, lineHeight: 1.45 }}>
                  {insight.bridge}
                </p>
              )}
            </div>
          )}

          {/* Selected MAP MEMBER strip: public earned identity only —
              never partners, never pair counts, never dates. */}
          {!selEdgeObj && !selLinkObj && isMap && selMember && (
            <div style={{
              position: 'absolute', left: 6, right: 6,
              ...(((nodePos[selId]?.y ?? 0) * camera.s + camera.ty) > MAP_H * 0.55 ? { top: 4 } : { bottom: 4 }),
              background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(4px)',
              border: `1px solid ${C.line}`, borderRadius: 14, padding: '8px 13px 9px',
              boxShadow: '0 4px 14px rgba(60,45,10,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selMember.isSelf
                    ? 'You'
                    : (firstName(selMember.unlocked && selMember.name) || 'Anonymous Rotman member')}
                </span>
                <span style={{ flex: 1 }} />
                {selMember.connector ? (
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: C.gold, background: C.goldSoft, border: `1px solid ${C.goldLine}`, borderRadius: 99, padding: '4px 11px', fontFamily: FONT }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="5" cy="12" r="2.4" /><circle cx="19" cy="6" r="2.4" /><circle cx="19" cy="18" r="2.4" />
                      <path d="M7.2 11l9.4-4M7.2 13l9.4 4" />
                    </svg>
                    Community Connector
                  </span>
                ) : TIER_META[selMember.tier]?.label ? (
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.gold, background: C.goldSoft, border: `1px solid ${C.goldLine}`, borderRadius: 99, padding: '4px 11px', fontFamily: FONT }}>
                    {TIER_META[selMember.tier].label}
                  </span>
                ) : null}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.45 }}>
                {selMember.industry}
                {selMember.badges.length > 0
                  && ` · ${selMember.badges.map((b) => BADGE_META[b]?.label).filter(Boolean).join(' · ')}`}
              </p>
              {/* Connector explained without naming a single private
                  relationship that produced it */}
              {selMember.connector && (
                <p style={{ margin: '3px 0 0', fontSize: 10.5, color: C.gold, fontFamily: FONT, lineHeight: 1.45 }}>
                  Helps bring different parts of the community closer together.
                </p>
              )}
              {/* Private milestone progress: mine only, never others' */}
              {selMember.isSelf && milestone && (
                <p style={{ margin: '3px 0 0', fontSize: 10.5, color: C.matcha, fontFamily: FONT, lineHeight: 1.45 }}>
                  {milestone}
                </p>
              )}
            </div>
          )}

          {/* My Circle member/self strip */}
          {!selEdgeObj && !isMap && selNodeCircle && (
            <div style={{
              position: 'absolute', left: 6, right: 6, bottom: 4,
              background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(4px)',
              border: `1px solid ${C.line}`, borderRadius: 14, padding: '8px 13px 9px',
              boxShadow: '0 4px 14px rgba(60,45,10,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selId === meId ? 'Your circle' : (firstName(selNodeCircle.name) || 'Community member')}
                </span>
                <span style={{ flex: 1 }} />
                {selId === meId && myTokens > 0 && (
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: C.gold, fontFamily: FONT }}>
                    <svg width="16" height="12" viewBox="0 0 44 32" fill="none">
                      <circle cx="15" cy="16" r="11" stroke="#A6822A" strokeWidth="4" />
                      <circle cx="29" cy="16" r="11" stroke="#C9A33B" strokeWidth="4" />
                    </svg>
                    {myTokens} token{myTokens === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.45 }}>
                {selEdges.length} connection{selEdges.length === 1 ? '' : 's'}
                {selChannels.length > 0 && ` · ${selChannels.join(', ')}`}
              </p>
              {selId === meId && milestone && (
                <p style={{ margin: '3px 0 0', fontSize: 10.5, color: C.matcha, fontFamily: FONT, lineHeight: 1.45 }}>
                  {milestone}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend + privacy footnote */}
      {!empty && (
        <>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
            {(!isMap || locateOn) && Object.entries(ORIGIN_META).map(([k, m]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.ink2, fontFamily: FONT }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: m.color }} />
                {m.label}
              </span>
            ))}
            {isMap && !locateOn && (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.ink2, fontFamily: FONT }}>
                  <span style={{ width: 16, height: 6, borderRadius: 3, background: 'rgba(166,130,42,0.20)' }} />
                  Activity between fields
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.ink2, fontFamily: FONT }}>
                  <svg width="12" height="12" viewBox="0 0 14 14">
                    <circle cx="7" cy="7" r="5" fill="none" stroke={C.gold} strokeWidth="1.8" strokeDasharray="2.4 2.2" />
                  </svg>
                  Community Connector
                </span>
              </>
            )}
          </div>
          <p style={{ margin: '7px 0 0', fontSize: 9.5, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
            {isMap && !locateOn
              ? 'Each circle is a Career Focus, sized by how many members it holds · Individual relationships stay private'
              : 'Your relationships are visible only to you and each partner · Anonymous and unaccepted interactions stay private'}
          </p>
        </>
      )}
    </>
  )
}
