import { supabase, isSupabaseConfigured } from './supabase'

// v1 in-event matcher — rule-based, no AI cost. Ranks other attendees by how
// well their stated need/offer complements the current user's, using keyword
// overlap. This is the "先跑通" version: it proves people fill in intentions
// and that a ranked "who to meet" list is useful, before spending on an LLM
// semantic pass (v2). Scoring is intentionally simple and transparent.

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

  const ranked = others.map(o => {
    const theyHelpMe = overlap(myNeed, tokens(o.offer_text))
    const iHelpThem  = overlap(myOffer, tokens(o.need_text))
    const mutual = theyHelpMe > 0 && iHelpThem > 0
    // Mutual matches get a bonus so two-way intros float to the top.
    const score = theyHelpMe + iHelpThem + (mutual ? 3 : 0)

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
