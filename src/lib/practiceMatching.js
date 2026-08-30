// ── Practice: pure matching / state / formatting logic ───────────
// No Supabase imports — everything here is deterministic and unit-
// testable (see __tests__/practiceMatching.test.js). The DB is the
// source of truth for eligibility (the browse RPC only returns
// reciprocal-eligible partners); these helpers explain and render
// what the DB decided.

import { PRACTICE_TYPE_LABELS } from '../data/practiceOptions'

const overlap = (a = [], b = []) => a.filter((t) => b.includes(t))

/**
 * Deterministic two-direction fit between my request and a partner's
 * (either as full rows or browse-RPC rows). True only when BOTH
 * directions have a real basis — the same rule the DB enforces.
 */
export function mutualFit(mine, theirs) {
  if (!mine || !theirs) return false
  return (
    overlap(theirs.help_types, mine.want_types).length > 0 &&
    overlap(mine.help_types, theirs.want_types).length > 0
  )
}

const labelList = (types = []) =>
  types.map((t) => (PRACTICE_TYPE_LABELS[t] || t).toLowerCase()).join(' or ')

/**
 * The mandatory plain-language two-direction explanation for a
 * partner card. Returns null when there is no mutual fit.
 *
 * { youGet:  "You want to practise a case interview, and they can help with that.",
 *   youGive: "They want to practise behavioural / fit, and you can help with that." }
 */
export function fitExplanation(mine, theirs, partnerName = 'they') {
  if (!mutualFit(mine, theirs)) return null
  const iGet = overlap(theirs.help_types, mine.want_types)
  const iGive = overlap(mine.help_types, theirs.want_types)
  const cap = partnerName.charAt(0).toUpperCase() + partnerName.slice(1)
  return {
    youGet: `You want to practise ${labelList(iGet)}, and ${partnerName} can help with that.`,
    youGive: `${cap} want${partnerName === 'they' ? '' : 's'} to practise ${labelList(iGive)}, and you can help with that.`,
  }
}

/**
 * One user-facing stage per pairing (+ its live session, if any).
 * Pure: pass `now` for testability (defaults to real time).
 *
 * pairing:   row from the my_practice_pairings view
 * session:   the pairing's most recent session row, or null
 * myUserId:  current user id
 * myConfirmed: whether I already submitted a session confirmation
 */
export function deriveDisplayState({ pairing, session = null, myUserId, myConfirmed = false, now = new Date() }) {
  if (!pairing) return null

  if (pairing.status === 'declined')  return 'declined'
  if (pairing.status === 'withdrawn') return 'withdrawn'
  if (pairing.status === 'expired')   return 'expired'
  if (pairing.status === 'ended')     return 'ended'
  if (pairing.status === 'invited') {
    if (pairing.expires_at && new Date(pairing.expires_at) <= now) return 'expired'
    return pairing.i_invited ? 'awaiting_their_response' : 'invitation_received'
  }

  // pairing accepted — the session (if any) drives the rest
  const dead = ['declined', 'withdrawn', 'expired', 'cancelled', 'no_show']
  if (!session || dead.includes(session.status)) return 'scheduling'

  if (session.status === 'proposed') {
    return session.created_by_user_id === myUserId ? 'proposal_sent' : 'proposal_received'
  }
  if (session.status === 'scheduled') {
    return new Date(session.scheduled_start) <= now ? 'ready_to_confirm' : 'scheduled'
  }
  if (session.status === 'completed_pending_confirmation') {
    return myConfirmed ? 'waiting_for_partner' : 'ready_to_confirm'
  }
  if (session.status === 'verified') return 'verified'
  if (session.status === 'disputed') return 'disputed'
  return 'scheduling'
}

/**
 * Overlapping availability between two window lists (ISO strings),
 * keeping only intersections of at least `minMinutes`. Returns
 * [{ starts_at, ends_at }] as ISO strings, sorted.
 */
export function overlapWindows(windowsA = [], windowsB = [], minMinutes = 30) {
  const out = []
  for (const a of windowsA) {
    for (const b of windowsB) {
      const start = Math.max(new Date(a.starts_at).getTime(), new Date(b.starts_at).getTime())
      const end = Math.min(new Date(a.ends_at).getTime(), new Date(b.ends_at).getTime())
      if (end - start >= minMinutes * 60_000) {
        out.push({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() })
      }
    }
  }
  return out.sort((x, y) => x.starts_at.localeCompare(y.starts_at))
}

/**
 * Render one availability window with an EXPLICIT timezone label —
 * the one thing the legacy scheduling UI got wrong (browser-local
 * dates). e.g. "Tue, Aug 26 · 3:00 – 4:30 PM EDT"
 */
export function formatWindow(startsAtIso, endsAtIso, timeZone) {
  const start = new Date(startsAtIso)
  const end = new Date(endsAtIso)
  const day = new Intl.DateTimeFormat('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone,
  }).format(start)
  const time = (d, withZone) => new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
    ...(withZone ? { timeZoneName: 'short' } : {}),
  }).format(d)
  return `${day} · ${time(start, false)} – ${time(end, true)}`
}

/**
 * Do two window lists share any usable overlap? SCHEDULING status
 * only — never part of fit. Reciprocal practice fit (mutualFit) is
 * about TYPES alone; availability just changes which invite CTA the
 * UI offers ("Time works for both" vs "Choose a time").
 */
export function windowsOverlap(windowsA = [], windowsB = [], minMinutes = 15) {
  return overlapWindows(windowsA, windowsB, minMinutes).length > 0
}

/**
 * One combined status for a partner card. Fit is types-only; overlap
 * only refines the label. Returns:
 *   'fit_overlap'    — reciprocal types + some shared availability
 *   'fit_no_overlap' — reciprocal types, no pre-existing overlap
 *   'no_fit'         — types not reciprocal
 *   null             — cannot judge (viewer has no active request)
 */
export function fitStatus(mine, theirs, myWindows = [], theirWindows = []) {
  if (!mine) return null
  if (!mutualFit(mine, theirs)) return 'no_fit'
  return windowsOverlap(myWindows, theirWindows) ? 'fit_overlap' : 'fit_no_overlap'
}

/**
 * Convert a wall-clock time IN A NAMED IANA ZONE to a UTC ISO string.
 * This is the inverse of formatWindow and the fix for the legacy bug
 * of building `new Date(\`${date}T${time}\`)` in browser-local time:
 * "2026-08-27 15:00 in America/Toronto" is the same instant for every
 * device that saves it, regardless of where that device is.
 * Two-pass offset resolution handles DST edges.
 */
export function wallTimeToUtc(dateStr, timeStr, timeZone) {
  const [y, mo, d] = String(dateStr).split('-').map(Number)
  const [h, mi] = String(timeStr).split(':').map(Number)
  const asIfUtc = Date.UTC(y, mo - 1, d, h, mi)
  let ts = asIfUtc - tzOffsetAt(asIfUtc, timeZone)
  const second = tzOffsetAt(ts, timeZone)
  if (asIfUtc - second !== ts) ts = asIfUtc - second
  return new Date(ts).toISOString()
}

// Zone offset (ms east of UTC) at a given instant, via Intl.
function tzOffsetAt(ts, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ts)).map((p) => [p.type, p.value])
  )
  const asIf = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  return asIf - ts
}

/**
 * Render a session start with explicit zone, e.g.
 * "Tue, Aug 26 · 3:00 PM EDT (60 min)"
 */
export function formatSessionTime(startsAtIso, durationMinutes, timeZone) {
  const start = new Date(startsAtIso)
  const s = new Intl.DateTimeFormat('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone, timeZoneName: 'short',
  }).format(start)
  // en-CA renders "Tue, Aug 26, 3:00 p.m. EDT" — normalize the comma
  // before the time into the app's "·" separator style.
  const normalized = s.replace(/, (\d)/, ' · $1').replace(/\ba\.m\./, 'AM').replace(/\bp\.m\./, 'PM')
  return `${normalized} (${durationMinutes} min)`
}
