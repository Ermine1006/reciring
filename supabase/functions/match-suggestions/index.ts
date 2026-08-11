// ============================================================
// Smart Match Nudge — rule-based scoring (v3)
//
// Compatibility score 0-100, four buckets per spec:
//   40  Professional   — skills teach/learn, industry, role keywords
//   30  Personal       — prompt_ask_me (interests/topics) + prompt_weekend (activities)
//   20  Intent         — networking_intent overlap OR opportunity↔talent complementary
//   10  Mutual context — same program / same career stage (weak proxies until
//                        we collect communities/classes/events)
//
// Output: top 5 candidates persisted to match_nudges with up to 3
// human-readable reasons joined by ` · ` (highest-weight first).
// Reasons are identity-free.
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TOP_N = 5

const STOPWORDS = new Set([
  'about','above','after','again','against','also','because','before','below','between','during',
  'from','have','here','into','more','only','other','should','such','that','their','them','then',
  'there','these','they','this','those','through','what','when','where','which','while','with',
  'would','your','need','needs','want','wants','help','helping','looking','offer','offers','offering',
  'someone','anyone','please','could','willing','really','people','person','years','year','currently',
])

const NETWORKING_INTENT_LABELS = {
  mentor:      'a mentor',
  cofounder:   'a co-founder',
  investor:    'an investor',
  opportunity: 'career opportunities',
  friend:      'friends',
  insight:     'industry insights',
  talent:      'talent',
}

function tokenize(text) {
  if (!text) return new Set()
  return new Set(
    String(text).toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 4 && !STOPWORDS.has(w)),
  )
}

function arrayIntersect(a, b) {
  const setB = new Set((b || []).map(s => String(s).toLowerCase()))
  return (a || []).filter(s => setB.has(String(s).toLowerCase()))
}

function setIntersect(setA, setB) {
  const out = []
  for (const x of setA) if (setB.has(x)) out.push(x)
  return out
}

function titleizeTag(s) {
  if (!s) return s
  return String(s)
    .split(/\s+/)
    .map(w => w.length <= 3 ? w.toUpperCase() : (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// ── Scoring ────────────────────────────────────────────────
// Returns { score, reason, breakdown }.
// `breakdown` is exposed for debugging / future analytics.
function scoreCandidate(viewer, candidate) {
  const buckets = { professional: 0, personal: 0, intent: 0, mutual: 0 }
  // Collect each scoring event so we can emit the top-3 as reasons.
  const events = []

  // ────────── 1. Professional (40 pts) ──────────

  // 1a. Skill teach/learn — most actionable signal (20 pts)
  const theyTeachMe = arrayIntersect(viewer.skills_to_learn, candidate.can_help_with)
  const iTeachThem  = arrayIntersect(viewer.can_help_with,   candidate.skills_to_learn)
  if (theyTeachMe.length + iTeachThem.length > 0) {
    buckets.professional += 20
    const text = theyTeachMe.length >= iTeachThem.length
      ? `They can teach you ${titleizeTag(theyTeachMe[0] || iTeachThem[0])}`
      : `You can teach them ${titleizeTag(iTeachThem[0])}`
    events.push({ text, weight: 20 })
  }

  // 1b. Industry overlap (12 pts)
  const sharedIndustries = arrayIntersect(viewer.industry_interests, candidate.industry_interests)
  if (sharedIndustries.length > 0) {
    buckets.professional += 12
    const display = sharedIndustries.slice(0, 2).map(titleizeTag).join(' & ')
    events.push({ text: `Shared focus on ${display}`, weight: 12 })
  }

  // 1c. Role/headline keyword overlap (8 pts)
  const vRole = tokenize(viewer.headline)
  const cRole = tokenize(candidate.headline)
  const sharedRole = setIntersect(vRole, cRole)
  if (sharedRole.length > 0) {
    buckets.professional += 8
    events.push({ text: `Similar background in ${titleizeTag(sharedRole[0])}`, weight: 8 })
  }

  // ────────── 2. Personal Interest (30 pts) ──────────

  // 2a. prompt_ask_me overlap — interests/topics (15 pts)
  const vAsk = tokenize(viewer.prompt_ask_me)
  const cAsk = tokenize(candidate.prompt_ask_me)
  const sharedAsk = setIntersect(vAsk, cAsk)
  if (sharedAsk.length > 0) {
    buckets.personal += 15
    events.push({ text: `Both fascinated by ${sharedAsk[0]}`, weight: 15 })
  }

  // 2b. prompt_weekend overlap — activities (15 pts)
  const vWeekend = tokenize(viewer.prompt_weekend)
  const cWeekend = tokenize(candidate.prompt_weekend)
  const sharedWeekend = setIntersect(vWeekend, cWeekend)
  if (sharedWeekend.length > 0) {
    buckets.personal += 15
    events.push({ text: `Weekend vibe: both into ${sharedWeekend[0]}`, weight: 15 })
  }

  // ────────── 3. Intent (20 pts) ──────────
  //
  // Two paths to full points:
  //   (a) Direct overlap — both want the same thing (cofounder/cofounder,
  //       both want mentors, both want insights, etc.)
  //   (b) Complementary opportunity↔talent (the canonical "I want a job"
  //       meets "I want to hire" pairing). This is the only complementary
  //       pair we can detect from the current networking_intent vocabulary;
  //       mentor↔mentee can't be inferred without a separate "I want to be
  //       a mentor" flag, which we don't collect.
  const vIntents = new Set(viewer.networking_intent || [])
  const cIntents = new Set(candidate.networking_intent || [])
  const sharedIntents = setIntersect(vIntents, cIntents)
  if (sharedIntents.length > 0) {
    buckets.intent += 20
    const label = NETWORKING_INTENT_LABELS[sharedIntents[0]] || sharedIntents[0]
    events.push({ text: `Both looking for ${label}`, weight: 20 })
  } else {
    const oppMeetsTalent =
      (vIntents.has('opportunity') && cIntents.has('talent')) ||
      (vIntents.has('talent')      && cIntents.has('opportunity'))
    if (oppMeetsTalent) {
      buckets.intent += 20
      events.push({
        text: vIntents.has('opportunity')
          ? "You're seeking opportunities — they're seeking talent"
          : "You're seeking talent — they're seeking opportunities",
        weight: 20,
      })
    }
  }

  // ────────── 4. Mutual Context (10 pts) ──────────
  //
  // The spec wants communities/classes/events/mutual connections — none
  // of which we collect today. Falling back to program + career_stage as
  // weak proxies. When the schema grows a `communities text[]` column,
  // this is where to wire it in.

  if (viewer.program && candidate.program && viewer.program === candidate.program) {
    buckets.mutual += 5
    events.push({ text: `Both in the ${viewer.program} program`, weight: 5 })
  }
  if (viewer.career_stage && candidate.career_stage && viewer.career_stage === candidate.career_stage) {
    buckets.mutual += 5
    events.push({ text: `Both at the ${viewer.career_stage} stage`, weight: 5 })
  }

  // ────────── Aggregate ──────────

  const total = buckets.professional + buckets.personal + buckets.intent + buckets.mutual

  // Top 3 reasons by weight. Stable secondary sort by insertion order
  // (Array.sort is stable in V8 / Deno).
  const topReasons = events
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(e => e.text)

  const reason = topReasons.length > 0
    ? topReasons.join(' · ')
    : 'Potential match based on profile overlap'

  return { score: total, reason, breakdown: buckets }
}

// ── HTTP handler ───────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'method not allowed' }, 405)

  try {
    // 1. Verify JWT — resolve viewer id server-side, ignore body
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'missing token' }, 401)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return json({ error: 'function not configured' }, 500)
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'invalid token' }, 401)

    const viewerId = user.id

    // 2. Service-role client for cross-user reads + writes
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Fields read for scoring. Update this list when adding new buckets.
    const PROFILE_FIELDS = `
      id, onboarding_done, program, career_stage,
      industry_interests, can_help_with, skills_to_learn, networking_intent,
      headline, prompt_ask_me, prompt_weekend
    `

    // 3. Viewer profile
    const { data: viewer, error: vErr } = await admin
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', viewerId)
      .maybeSingle()
    if (vErr) throw vErr
    if (!viewer) return json({ error: 'viewer profile not found' }, 404)
    if (!viewer.onboarding_done) {
      return json({ ok: true, count: 0, suggestions: [], reason: 'onboarding incomplete' })
    }

    // 4. Blocked users
    let blockedIds = new Set()
    const { data: blockedRows, error: bErr } = await admin
      .from('blocks')
      .select('blocked_user_id')
      .eq('blocker_id', viewerId)
    if (!bErr && blockedRows) blockedIds = new Set(blockedRows.map(r => r.blocked_user_id))

    // 5. Candidate profiles
    const { data: rawCandidates, error: cErr } = await admin
      .from('profiles')
      .select(PROFILE_FIELDS)
      .neq('id', viewerId)
      .eq('onboarding_done', true)
    if (cErr) throw cErr

    const candidates = (rawCandidates || []).filter(c => !blockedIds.has(c.id))
    if (candidates.length === 0) {
      await admin.from('match_nudges').delete().eq('user_id', viewerId).eq('status', 'pending')
      return json({ ok: true, count: 0, suggestions: [] })
    }

    // 6. Score, filter zeros, sort, top N
    const scored = candidates
      .map(c => {
        const { score, reason, breakdown } = scoreCandidate(viewer, c)
        return { candidate_id: c.id, score, reason, breakdown }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N)

    // 7. Persist — clear stale pending, upsert top-N (status preserved on existing rows)
    const { error: delErr } = await admin
      .from('match_nudges')
      .delete()
      .eq('user_id', viewerId)
      .eq('status', 'pending')
    if (delErr) throw delErr

    if (scored.length > 0) {
      const rows = scored.map(s => ({
        user_id:      viewerId,
        candidate_id: s.candidate_id,
        score:        s.score,
        reason:       s.reason,
      }))
      const { error: upErr } = await admin
        .from('match_nudges')
        .upsert(rows, { onConflict: 'user_id,candidate_id' })
      if (upErr) throw upErr
    }

    return json({
      ok: true,
      count: scored.length,
      // `suggestions` keeps the breakdown for future debug overlays / analytics;
      // the persisted `match_nudges` row only stores `reason` (the joined string).
      suggestions: scored,
    })

  } catch (err) {
    console.error('[match-suggestions] error:', err?.message || err)
    return json({ error: err?.message || 'internal error' }, 500)
  }
})

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
