import { describe, it, expect } from 'vitest'
import { AVAILABILITY_PRESETS, presetToWindows, isPresetAutomatic } from '../practiceAvailability'

const TZ = 'America/Toronto'
// A Wednesday, mid-afternoon in Toronto.
const WED = new Date('2026-09-23T18:00:00Z')

function weekdayOf(date, timeZone = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, weekday: 'short' })
    .format(new Date(`${date}T12:00:00Z`))
}

describe('presetToWindows', () => {
  it('offers three weekday evenings, all on weekdays', () => {
    const windows = presetToWindows('weekday_evenings', TZ, WED)
    expect(windows).toHaveLength(3)
    for (const w of windows) {
      expect(w.start).toBe('18:00')
      expect(w.end).toBe('21:00')
      expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(weekdayOf(w.date))
    }
  })

  it('offers both weekend mornings', () => {
    const windows = presetToWindows('weekend_mornings', TZ, WED)
    expect(windows).toHaveLength(2)
    expect(windows.map((w) => weekdayOf(w.date)).sort()).toEqual(['Sat', 'Sun'])
    expect(windows.every((w) => w.start === '09:00' && w.end === '12:00')).toBe(true)
  })

  it('never publishes a window in the past, and keeps them in order', () => {
    const windows = presetToWindows('weekday_evenings', TZ, WED)
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(WED)
    for (const w of windows) expect(w.date > today).toBe(true)
    expect([...windows].sort((a, b) => a.date.localeCompare(b.date))).toEqual(windows)
  })

  it('leaves the exact-times option to the member', () => {
    expect(presetToWindows('exact', TZ, WED)).toEqual([])
    expect(isPresetAutomatic('exact')).toBe(false)
  })

  it('publishes nothing for an unknown preset', () => {
    expect(presetToWindows('whatever', TZ, WED)).toEqual([])
    expect(presetToWindows(undefined, TZ, WED)).toEqual([])
  })

  it('respects the member timezone when a day is about to roll over', () => {
    // 02:00 UTC Thursday is still Wednesday evening in Toronto, so the
    // first offered window must be Thursday, not Friday.
    const lateUtc = new Date('2026-09-24T02:00:00Z')
    const [first] = presetToWindows('weekday_evenings', TZ, lateUtc)
    expect(first.date).toBe('2026-09-24')
  })

  it('exposes one option per preset for the UI', () => {
    expect(AVAILABILITY_PRESETS.map((p) => p.id))
      .toEqual(['weekday_evenings', 'weekend_mornings', 'exact'])
  })
})
