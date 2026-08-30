// ── Together page: pure derivations ──────────────────────────────
// Everything the redesigned page shows is derived here from data the
// app ALREADY loads. No fabrication: when a value was never recorded
// the helper returns null and the page omits that element rather than
// inventing one.

import { PRACTICE_TYPE_LABELS } from '../data/practiceOptions'
import { MILESTONE_THRESHOLDS, MILESTONES } from './practicePassport'

/**
 * Which matching state the member is actually in.
 *
 * Only 'searching' is allowed to say matching is under way, so a
 * member who never joined, or who withdrew, is never told that Mutu
 * is looking for a partner on their behalf.
 */
export function matchingState({
  myRequest = null,
  fitCount = 0,
  outgoingCount = 0,
  incomingCount = 0,
  scheduledCount = 0,
} = {}) {
  if (scheduledCount > 0) return 'scheduled'
  if (incomingCount > 0) return 'invitation_received'
  if (outgoingCount > 0) return 'invitation_pending'
  if (!myRequest) return 'not_enrolled'
  if (myRequest.status && myRequest.status !== 'active') return 'paused'
  if (fitCount > 0) return 'suggested'
  return 'searching'
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Morning / afternoon / evening, in the window's own timezone. */
function partOfDay(hour) {
  if (hour < 12) return 'mornings'
  if (hour < 17) return 'afternoons'
  return 'evenings'
}

/**
 * "Tue evenings" from the member's real availability windows, or null
 * when they listed none or every one of them is in the past. Never
 * guesses a time the member did not offer.
 */
export function availabilitySummary(windows = [], timeZone, now = new Date()) {
  const live = (windows || []).filter((w) => w?.starts_at && new Date(w.starts_at) > now)
  if (live.length === 0) return null
  const counts = new Map()
  for (const w of live) {
    const d = new Date(w.starts_at)
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone, weekday: 'short', hour: 'numeric', hour12: false,
      }).formatToParts(d).map((p) => [p.type, p.value])
    )
    const hour = parts.hour === '24' ? 0 : Number(parts.hour)
    const key = `${parts.weekday} ${partOfDay(hour)}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  // most offered slot wins; ties resolve by weekday order for stability
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1]
      || DAY.indexOf(a[0].split(' ')[0]) - DAY.indexOf(b[0].split(' ')[0]))[0][0]
}

/**
 * Compact chips describing what the member actually asked for.
 * A value that was never recorded produces no chip at all — the page
 * must never show "Not recorded" in this summary.
 *
 * Session mode is deliberately absent: it is agreed per session, not
 * stored on the request, so there is nothing truthful to show yet.
 */
export function preferenceChips(myRequest, windows = [], now = new Date()) {
  if (!myRequest) return []
  const chips = []
  for (const t of myRequest.want_types || []) {
    const label = PRACTICE_TYPE_LABELS[t]
    if (label) chips.push({ id: `want_${t}`, label })
  }
  if (myRequest.duration_minutes) {
    chips.push({ id: 'duration', label: `About ${myRequest.duration_minutes} min` })
  }
  const when = availabilitySummary(windows, myRequest.timezone, now)
  if (when) chips.push({ id: 'when', label: when })
  return chips
}

/**
 * Progress toward the next milestone the member has NOT yet earned,
 * using the thresholds that already govern the Passport. Returns null
 * when every milestone is earned or the contract cannot be read, so
 * the page shows no bar rather than an invented one.
 */
export function nextMilestoneProgress(passport) {
  if (!passport) return null
  for (const m of MILESTONES) {
    const need = MILESTONE_THRESHOLDS[m.id]
    if (!need) continue
    const keys = Object.keys(need)
    const done = keys.every((k) => (passport[k] || 0) >= need[k])
    if (done) continue
    // the least-complete requirement is the honest one to show
    const ratios = keys.map((k) => Math.min(1, (passport[k] || 0) / need[k]))
    const value = Math.min(...ratios)
    const lead = keys[ratios.indexOf(value)]
    return {
      id: m.id,
      label: m.label,
      value,
      current: passport[lead] || 0,
      target: need[lead],
      valueText: `${passport[lead] || 0} of ${need[lead]} toward ${m.label}`,
    }
  }
  return null
}

/**
 * The single event to preview. Prefers one the member already joined
 * or hosts, then the soonest upcoming event they can actually see.
 * Returns null when there is genuinely nothing, so the page renders
 * its empty state instead of a placeholder.
 */
export function nextEventForYou(events = [], joinedIds = new Set(), userId = null) {
  const upcoming = (events || [])
    .filter((e) => e?.start_at && new Date(e.start_at) > new Date())
    .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))
  if (upcoming.length === 0) return null
  const has = (id) => (joinedIds instanceof Set ? joinedIds.has(id) : (joinedIds || []).includes(id))
  return upcoming.find((e) => has(e.id) || (userId && e.host_user_id === userId)) || upcoming[0]
}

/** "Community wellness · Sep 6" from the event's own fields. */
export function eventMeta(event) {
  if (!event) return ''
  const when = event.start_at
    ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(new Date(event.start_at))
    : null
  return [event.category, when].filter(Boolean).join(' · ')
}
