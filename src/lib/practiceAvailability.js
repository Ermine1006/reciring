// ── One-tap availability presets for the practice setup flow ─────
//
// Setup used to ask for a date, a start time and an end time, typed by
// hand, for every window. Testers stalled there, so the common answers
// ("weekday evenings", "weekend mornings") became one tap each and the
// typed form moved behind "Pick exact times".
//
// A preset expands into the SAME wall-time window shape the flow
// already submits ({ date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM' }),
// so nothing downstream changes: wallTimeToUtc still does the timezone
// conversion and the DB still stores plain UTC instants.
//
// Windows are always in the member's own timezone and always in the
// future, because a window that has already passed can never be booked.

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** The calendar date and weekday of `instant` as seen in `timeZone`. */
function zonedDay(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant).map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_INDEX[parts.weekday],
  }
}

// Each preset names the weekdays it covers and the hours it offers.
// `count` caps how many windows one tap publishes: enough for a partner
// to find an overlap, few enough that nobody is committing their month.
const PRESETS = {
  weekday_evenings: { weekdays: [1, 2, 3, 4, 5], start: '18:00', end: '21:00', count: 3 },
  weekend_mornings: { weekdays: [0, 6],          start: '09:00', end: '12:00', count: 2 },
  exact:            null,
}

export const AVAILABILITY_PRESETS = [
  { id: 'none', label: 'Decide together', detail: 'Arrange a time after matching' },
  { id: 'weekday_evenings', label: 'Weekday evenings', detail: 'Mon to Fri · 6 to 9 PM' },
  { id: 'weekend_mornings', label: 'Weekend mornings',           detail: 'Sat and Sun · 9 AM to 12 PM' },
  { id: 'exact',            label: 'Pick exact times',           detail: 'Choose your own dates and hours' },
]

/**
 * Expand a preset id into upcoming wall-time windows.
 *
 * Starts from tomorrow: "this evening" is usually already gone by the
 * time someone finishes setup, and publishing a dead window would make
 * the member look unavailable rather than available.
 *
 * Returns [] for 'exact' (the member types their own) and for anything
 * unrecognised, so a bad id can never publish surprise availability.
 */
export function presetToWindows(presetId, timeZone, now = new Date()) {
  const preset = PRESETS[presetId]
  if (!preset) return []

  const windows = []
  const startFrom = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(startFrom)) return []

  for (let offset = 1; offset <= 14 && windows.length < preset.count; offset += 1) {
    const day = zonedDay(new Date(startFrom + offset * 86_400_000), timeZone)
    if (!preset.weekdays.includes(day.weekday)) continue
    windows.push({ date: day.date, start: preset.start, end: preset.end })
  }
  return windows
}

/** Does this preset id expand into windows on its own? */
export function isPresetAutomatic(presetId) {
  return Boolean(PRESETS[presetId])
}
