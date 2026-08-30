import { describe, it, expect } from 'vitest'
import {
  MEETING_METHODS, MEETING_METHOD_KEYS, MEETING_URL_MAX, NOT_RECORDED,
  validateMeetingUrl, validateMeetingSetup, methodFromUrl, describeMeeting, canJoin,
} from '../meetingMethods'

const TEAMS = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%3a%22x%22%7d'
const ZOOM = 'https://utoronto.zoom.us/j/98765432101?pwd=aBcDeF'
const OTHER = 'https://meet.google.com/abc-defg-hij'

describe('online sessions require a safe https link (tests 1, 2, 3, 6)', () => {
  it('accepts an institutional Teams invitation, query string and all', () => {
    const r = validateMeetingUrl(TEAMS, 'teams')
    expect(r.ok).toBe(true)
    expect(r.host).toBe('teams.microsoft.com')
  })

  it('accepts a tenant Zoom subdomain', () => {
    const r = validateMeetingUrl(ZOOM, 'zoom')
    expect(r.ok).toBe(true)
    expect(r.host).toBe('utoronto.zoom.us')
  })

  it('accepts any https link under Other video link', () => {
    expect(validateMeetingUrl(OTHER, 'other_video').ok).toBe(true)
  })

  it('requires a link for every online method', () => {
    for (const m of ['teams', 'zoom', 'other_video']) {
      expect(validateMeetingSetup({ method: m, url: '' }).error).toBe('url_required')
      expect(validateMeetingSetup({ method: m, url: '   ' }).error).toBe('url_required')
    }
  })

  it('trims surrounding whitespace', () => {
    const r = validateMeetingUrl(`   ${ZOOM}\n`, 'zoom')
    expect(r.ok).toBe(true)
    expect(r.url).toBe(ZOOM)
  })

  it('refuses dangerous protocols and malformed text', () => {
    const bad = [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
      'zoommtg://zoom.us/join?confno=1',
      'http://zoom.us/j/123',
      'not a link at all',
      'https://',
      '<a href="https://zoom.us/j/1">click</a>',
    ]
    for (const v of bad) expect(validateMeetingUrl(v, 'other_video').ok, v).toBe(false)
    expect(validateMeetingUrl('http://zoom.us/j/1', 'zoom').error).toBe('url_not_https')
  })

  it('refuses links carrying embedded credentials', () => {
    expect(validateMeetingUrl('https://user:pass@zoom.us/j/123', 'zoom').error)
      .toBe('url_has_credentials')
    expect(validateMeetingUrl('https://evil.com@teams.microsoft.com/x', 'teams').error)
      .toBe('url_has_credentials')
  })

  it('limits the link length', () => {
    expect(MEETING_URL_MAX).toBe(500)
    const long = `https://zoom.us/j/1?x=${'a'.repeat(MEETING_URL_MAX)}`
    expect(validateMeetingUrl(long, 'zoom').error).toBe('url_too_long')
  })
})

describe('platform selection is enforced (tests 4, 5)', () => {
  it('Teams rejects a link that is not a Teams host, and says what to do', () => {
    const r = validateMeetingUrl(ZOOM, 'teams')
    expect(r.error).toBe('not_teams_host')
    expect(r.message).toMatch(/Other video link/)
    expect(validateMeetingUrl('https://teams.microsoft.com.evil.co/x', 'teams').ok).toBe(false)
  })

  it('Zoom rejects a link that is not a Zoom host', () => {
    expect(validateMeetingUrl(TEAMS, 'zoom').error).toBe('not_zoom_host')
    expect(validateMeetingUrl('https://zoom.us.evil.co/j/1', 'zoom').ok).toBe(false)
  })

  it('reads the platform from the link itself, never guessing', () => {
    expect(methodFromUrl(TEAMS)).toBe('teams')
    expect(methodFromUrl(ZOOM)).toBe('zoom')
    expect(methodFromUrl(OTHER)).toBe('other_video')
    expect(methodFromUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('in person needs no link (test 7)', () => {
  it('is valid with or without a location', () => {
    expect(validateMeetingSetup({ method: 'in_person' }).ok).toBe(true)
    expect(validateMeetingSetup({ method: 'in_person', location: 'Rotman, room 2020' }).ok).toBe(true)
  })

  it('offers a location field and no url field', () => {
    expect(MEETING_METHODS.in_person.online).toBe(false)
    expect(MEETING_METHODS.in_person.fieldLabel).toBe('Meeting location')
    expect(MEETING_METHOD_KEYS).toEqual(['teams', 'zoom', 'in_person', 'other_video'])
  })
})

describe('what both participants see (tests 8, 9, 10, 16, 19)', () => {
  const session = (over = {}) => ({
    id: 's1', status: 'scheduled', location_type: 'virtual', location_detail: '', ...over,
  })

  it('describes a stored meeting with its platform and host', () => {
    const d = describeMeeting(session({ meeting_method: 'teams', meeting_url: TEAMS }))
    expect(d).toMatchObject({
      recorded: true, method: 'teams', label: 'Microsoft Teams meeting',
      host: 'teams.microsoft.com', joinable: true,
    })
    expect(d.url).toBe(TEAMS)
  })

  it('reads a link stored in the existing location field, deriving the platform from the host', () => {
    const d = describeMeeting(session({ location_type: 'virtual', location_detail: ZOOM }))
    expect(d).toMatchObject({ recorded: true, method: 'zoom', host: 'utoronto.zoom.us', joinable: true })
  })

  it('shows an in-person location and offers no Join meeting', () => {
    const d = describeMeeting(session({ location_type: 'in_person', location_detail: 'Rotman, room 2020' }))
    expect(d).toMatchObject({ recorded: true, method: 'in_person', joinable: false })
    expect(d.location).toBe('Rotman, room 2020')
  })

  it('an online proposal with no link is incomplete, so it cannot be accepted', () => {
    const d = describeMeeting(session({ meeting_method: 'zoom', meeting_url: '' }))
    expect(d.recorded).toBe(true)
    expect(d.joinable).toBe(false)
    expect(d.invalid).toBe(true)
    expect(d.url).toBeNull()
  })

  it('never makes unsafe text clickable', () => {
    for (const bad of ['javascript:alert(1)', 'not a link', 'http://zoom.us/j/1']) {
      const d = describeMeeting(session({ meeting_method: 'other_video', meeting_url: bad }))
      expect(d.joinable).toBe(false)
      expect(d.url).toBeNull()
    }
  })

  it('leaves a historical session as Meeting details not recorded', () => {
    const d = describeMeeting(session({ location_type: 'virtual', location_detail: '' }))
    expect(d.recorded).toBe(false)
    expect(d.label).toBe(NOT_RECORDED)
    expect(d.joinable).toBe(false)
  })

  it('stops offering Join meeting once the session is cancelled or settled', () => {
    const live = session({ meeting_method: 'zoom', meeting_url: ZOOM })
    expect(canJoin(live)).toBe(true)
    expect(canJoin({ ...live, status: 'proposed' })).toBe(true)
    for (const st of ['cancelled', 'no_show', 'declined', 'withdrawn', 'expired', 'verified', 'disputed']) {
      expect(canJoin({ ...live, status: st }), st).toBe(false)
    }
  })

  it('both participants derive the identical description from the same row', () => {
    const row = session({ meeting_method: 'teams', meeting_url: TEAMS })
    expect(describeMeeting(row)).toEqual(describeMeeting({ ...row }))
  })
})
