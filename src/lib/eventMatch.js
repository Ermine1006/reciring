import { supabase, isSupabaseConfigured } from './supabase'
import { broadLabelsOf } from '../data/careerFocus'
import { fetchEventGoals } from './eventPrep'

// v1 in-event matcher — rule-based, no AI cost. Ranks other attendees by how
// well their stated need/offer complements the current user's, using keyword
// overlap. This is the "先跑通" version: it proves people fill in intentions
// and that a ranked "who to meet" list is useful, before spending on an LLM
// semantic pass (v2). Scoring is intentionally simple and transparent.
//
// Phase 1.4: the viewer's own Prepare-page goal (event_goals, private) biases
// the ranking — see goalWeights(). Goals are per-viewer only; we never read
// other attendees' goals (they're private), so this personalizes MY list
// without leaking anyone's intent.

const STOP = new Set([
  'a','an','the','and','or','to','of','for','in','on','at','with','my','me','i',
  'you','your','we','our','is','are','be','can','could','would','want','need',
  'offer','looking','help','someone','who','that','this','about','from','get',
  'more','some','any','it','as','so','if','but','am','into','out','up','by',
])

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w))
  )
}

function overlap(a, b) {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

// Turn the viewer's goal selection (event_goals.goals) into scoring weights.
// No goals set → all-neutral, i.e. identical to the pre-1.4 behavior.
//   • learn              → value "they can teach me" more (weight the theyHelpMe side)
//   • find_collaborators → value two-way (mutual) fits more (bigger mutual bonus)
//   • explore            → surface breadth: nudge single-direction fits up so the
//                          list isn't dominated purely by the tightest mutual matches
function goalWeights(goals) {
  const g = new Set(goals || [])
  return {
    learnMult:    g.has('learn') ? 2 : 1,
    mutualBonus:  g.has('find_collaborators') ? 6 : 3,
    exploreNudge: g.has('explore') ? 1 : 0,
  }
}

/**
 * Fetch every attendee of an event with their intentions + display info, then
 * rank them for `meUserId` by complementarity:
 *   theyHelpMe  = my need   ∩ their offer   (they can give me what I want)
 *   iHelpThem   = my offer  ∩ their need    (I can give them what they want)
 * Mutual matches (both > 0) score highest — those are the two-way intros worth
 * making. Returns [{ userId, name, program, need, offer, score, reason }],
 * best first, excluding me and anyone with no stated intentions.
 */
export async function fetchEventMatches(eventId, meUserId) {
  if (!isSupabaseConfigured || !eventId || !meUserId) return { data: [], error: null }

  const { data: rows, error } = await supabase
    .from('event_attendees')
    .select('user_id, need_text, offer_text')
    .eq('event_id', eventId)
  if (error) return { data: [], error }

  const me = (rows || []).find(r => r.user_id === meUserId)
  if (!me || (!me.need_text && !me.offer_text)) {
    // Can't match without my own intentions. Not an error — the caller shows
    // a "add what you're looking for" nudge instead.
    return { data: [], error: null, needsMyIntentions: true }
  }

  const others = (rows || []).filter(r => r.user_id !== meUserId && (r.need_text || r.offer_text))
  if (others.length === 0) return { data: [], error: null }

  // Pull display info for the candidates. Separate query rather than an embed:
  // event_attendees FKs to auth.users, not profiles, so a PostgREST embed isn't
  // guaranteed. Anonymity is respected — a private profile shows no real name.
  const ids = others.map(o => o.user_id)
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, program, visibility')
    .in('id', ids)
  const profById = new Map((profs || []).map(p => [p.id, p]))

  const myNeed  = tokens(me.need_text)
  const myOffer = tokens(me.offer_text)

  // The viewer's own event goal (private) tilts the ranking. Read only mine.
  const { goals: myGoals } = await fetchEventGoals(eventId, meUserId)
  const w = goalWeights(myGoals)

  const ranked = others.map(o => {
    const theyHelpMe = overlap(myNeed, tokens(o.offer_text))
    const iHelpThem  = overlap(myOffer, tokens(o.need_text))
    const mutual = theyHelpMe > 0 && iHelpThem > 0
    // Goal-weighted score. Base is complementarity (they-help-me + i-help-them);
    // a mutual two-way fit gets a bonus, amplified when the viewer's goal is to
    // meet collaborators. "learn" up-weights the teach-me side; "explore" gives
    // single-direction fits a small nudge so more people surface.
    const score =
      theyHelpMe * w.learnMult +
      iHelpThem +
      (mutual ? w.mutualBonus : 0) +
      (!mutual && (theyHelpMe > 0 || iHelpThem > 0) ? w.exploreNudge : 0)

    const p = profById.get(o.user_id) || {}
    const isPublic = p.visibility === 'public' && p.name
    return {
      userId:  o.user_id,
      name:    isPublic ? p.name : 'A peer',
      program: isPublic ? (p.program || null) : null,
      need:    o.need_text || '',
      offer:   o.offer_text || '',
      score,
      reason:  mutual
        ? 'Mutual fit — they can help you and you can help them'
        : theyHelpMe > 0
          ? 'They offer what you’re looking for'
          : iHelpThem > 0
            ? 'You can offer what they need'
            : 'Also at this event',
    }
  })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)

  return { data: ranked, error: null }
}

// Build my need/offer token sets from profile priority — the FALLBACK signal
// for Ask Mutu's "prepare for an event" when I haven't set per-event intentions.
// Needs (what I'm looking for) come from my networking intent + skills to learn;
// offers (what I bring) from what I can help with. Interests feed both sides.
function profileTokens(profile) {
  const p = profile || {}
  const need = [
    ...(p.networking_intent || []),
    ...(p.skills_to_learn || []),
    ...broadLabelsOf(p.industry_interests || []),
  ].join(' ')
  const offer = [
    ...(p.can_help_with || []),
    ...broadLabelsOf(p.industry_interests || []),
  ].join(' ')
  return { myNeed: tokens(need), myOffer: tokens(offer) }
}

/**
 * Ask Mutu "prepare for an event" — rank the event's attendees for `meUserId`.
 * Uses my per-event need/offer when I've set them ('event' signal); otherwise
 * falls back to my profile priority ('profile' signal) so the briefing still
 * works before I've filled in event intentions. Same complementarity ranking
 * and privacy rules as fetchEventMatches (public profiles only show a name).
 * Returns { candidates, signal: 'event'|'profile'|'none', error }, best first.
 */
export async function fetchEventPrepCandidates(eventId, meUserId, profile, { limit = 6 } = {}) {
  if (!isSupabaseConfigured || !eventId || !meUserId) return { candidates: [], signal: 'none', error: null }

  const { data: rows, error } = await supabase
    .from('event_attendees')
    .select('user_id, need_text, offer_text')
    .eq('event_id', eventId)
  if (error) return { candidates: [], signal: 'none', error }

  const me = (rows || []).find(r => r.user_id === meUserId)
  const hasEventIntent = me && (me.need_text || me.offer_text)

  let myNeed, myOffer, signal
  if (hasEventIntent) {
    myNeed = tokens(me.need_text)
    myOffer = tokens(me.offer_text)
    signal = 'event'
  } else {
    const t = profileTokens(profile)
    myNeed = t.myNeed
    myOffer = t.myOffer
    signal = 'profile'
  }
  // Neither event intentions nor a filled-in profile → nothing to rank on.
  if (myNeed.size === 0 && myOffer.size === 0) return { candidates: [], signal: 'none', error: null }

  const others = (rows || []).filter(r => r.user_id !== meUserId && (r.need_text || r.offer_text))
  if (others.length === 0) return { candidates: [], signal, error: null }

  const ids = others.map(o => o.user_id)
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, name, program, visibility')
    .in('id', ids)
  const profById = new Map((profs || []).map(p => [p.id, p]))

  // My own private event goal biases the ranking, exactly like the Board matcher.
  const { goals: myGoals } = await fetchEventGoals(eventId, meUserId)
  const w = goalWeights(myGoals)

  const ranked = others.map(o => {
    const theyHelpMe = overlap(myNeed, tokens(o.offer_text))
    const iHelpThem  = overlap(myOffer, tokens(o.need_text))
    const mutual = theyHelpMe > 0 && iHelpThem > 0
    const score =
      theyHelpMe * w.learnMult +
      iHelpThem +
      (mutual ? w.mutualBonus : 0) +
      (!mutual && (theyHelpMe > 0 || iHelpThem > 0) ? w.exploreNudge : 0)

    const p = profById.get(o.user_id) || {}
    const isPublic = p.visibility === 'public' && p.name
    return {
      name:    isPublic ? p.name : 'A peer',
      program: isPublic ? (p.program || null) : null,
      need:    o.need_text || '',
      offer:   o.offer_text || '',
      score,
      reason:  mutual
        ? 'Mutual fit — they can help you and you can help them'
        : theyHelpMe > 0
          ? 'They offer what you’re looking for'
          : iHelpThem > 0
            ? 'You can offer what they need'
            : 'Also at this event',
    }
  })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return { candidates: ranked, signal, error: null }
}
