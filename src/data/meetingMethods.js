// ── How two people will meet ─────────────────────────────────────────
// The method, the link and the in-person location for a Practice
// session. One place for the labels, the copy and — most importantly —
// the URL rules.
//
// A meeting link is PARTICIPANT-PRIVATE session information. It lives
// in the session row, which only its two participants can read. It
// never reaches the Community Map, a profile, the Passport, a browse
// RPC, analytics, or a notification body.
//
// Mutu creates no meetings and fetches no previews: the sender makes
// the meeting in Teams or Zoom themselves and pastes the link.

export const MEETING_URL_MAX = 500

export const MEETING_METHODS = {
  teams: {
    key: 'teams',
    label: 'Microsoft Teams',
    short: 'Microsoft Teams meeting',
    online: true,
    fieldLabel: 'Teams meeting link',
    placeholder: 'https://teams.microsoft.com/l/meetup-join/...',
    help: 'Create the meeting in Teams, then paste the invitation link here.',
  },
  zoom: {
    key: 'zoom',
    label: 'Zoom',
    short: 'Zoom meeting',
    online: true,
    fieldLabel: 'Zoom meeting link',
    placeholder: 'https://zoom.us/j/...',
    help: 'Create the meeting in Zoom, then paste the invitation link here.',
  },
  other_video: {
    key: 'other_video',
    label: 'Other video link',
    short: 'Video meeting',
    online: true,
    fieldLabel: 'Video meeting link',
    placeholder: 'https://...',
    help: 'Paste a secure meeting link that your partner can open.',
  },
  in_person: {
    key: 'in_person',
    label: 'In person',
    short: 'In person',
    online: false,
    fieldLabel: 'Meeting location',
    placeholder: 'Rotman building, BMO Financial Group Finance Research and Trading Lab',
    help: 'Optional. Where you will meet.',
  },
}
export const MEETING_METHOD_KEYS = ['teams', 'zoom', 'in_person', 'other_video']

export const NOT_RECORDED = 'Meeting details not recorded'

// Official meeting hosts. Institutional tenants live on subdomains
// (utoronto.zoom.us), so subdomains of these are accepted too.
const TEAMS_HOSTS = ['teams.microsoft.com', 'teams.live.com', 'teams.microsoft.us']
const ZOOM_HOSTS = ['zoom.us', 'zoom.com']

const hostMatches = (host, roots) =>
  roots.some((root) => host === root || host.endsWith(`.${root}`))

/**
 * THE url rule. Returns the trimmed value and its host, or an error.
 * Anything that is not a plain https:// link with no embedded
 * credentials is refused, whatever it claims to be.
 */
export function validateMeetingUrl(raw, method = 'other_video') {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: false, error: 'url_required', message: 'Add the meeting link.' }
  if (value.length > MEETING_URL_MAX) {
    return { ok: false, error: 'url_too_long', message: 'That link is too long.' }
  }

  let url
  try { url = new URL(value) } catch {
    return { ok: false, error: 'url_malformed', message: 'That does not look like a link.' }
  }

  // https only: no javascript:, data:, file:, or app protocols
  if (url.protocol !== 'https:') {
    return { ok: false, error: 'url_not_https', message: 'Use a link that starts with https.' }
  }
  // credentials in a URL are a phishing shape, never a meeting link
  if (url.username || url.password) {
    return { ok: false, error: 'url_has_credentials', message: 'Remove the username or password from the link.' }
  }
  if (!url.hostname || !url.hostname.includes('.')) {
    return { ok: false, error: 'url_malformed', message: 'That does not look like a link.' }
  }

  const host = url.hostname.toLowerCase()
  // query strings are normal in institutional invitations, so the host
  // is what we check, never the length or the parameters
  if (method === 'teams' && !hostMatches(host, TEAMS_HOSTS)) {
    return {
      ok: false, error: 'not_teams_host',
      message: 'That is not a Microsoft Teams link. Choose Other video link instead.',
    }
  }
  if (method === 'zoom' && !hostMatches(host, ZOOM_HOSTS)) {
    return {
      ok: false, error: 'not_zoom_host',
      message: 'That is not a Zoom link. Choose Other video link instead.',
    }
  }
  return { ok: true, error: null, message: null, url: value, host }
}

/** The method a link belongs to, read from the link itself. */
export function methodFromUrl(rawUrl) {
  const check = validateMeetingUrl(rawUrl, 'other_video')
  if (!check.ok) return null
  if (hostMatches(check.host, TEAMS_HOSTS)) return 'teams'
  if (hostMatches(check.host, ZOOM_HOSTS)) return 'zoom'
  return 'other_video'
}

/** Is this meeting setup complete enough to propose or to accept? */
export function validateMeetingSetup({ method, url, location } = {}) {
  if (!method) return { ok: false, error: 'method_required', message: 'Choose how you will meet.' }
  const meta = MEETING_METHODS[method]
  if (!meta) return { ok: false, error: 'method_invalid', message: 'Choose how you will meet.' }
  if (!meta.online) return { ok: true, error: null, message: null }   // location is optional
  return validateMeetingUrl(url, method)
}

/**
 * What both participants see. Reads the structured meeting columns
 * when the database has them, and otherwise falls back to the
 * location fields that already exist today — deriving the platform
 * from the link's own host, never guessing one.
 */
export function describeMeeting(session) {
  if (!session) return { recorded: false, label: NOT_RECORDED, host: null, url: null, joinable: false }

  const stored = session.meeting_method || null
  const url = session.meeting_url || (session.location_type !== 'in_person' ? session.location_detail : '') || ''
  const location = session.meeting_location
    || (session.location_type === 'in_person' ? session.location_detail : '') || ''

  const method = stored || (url ? methodFromUrl(url) : (session.location_type === 'in_person' ? 'in_person' : null))
  if (!method) {
    return { recorded: false, label: NOT_RECORDED, host: null, url: null, location: '', joinable: false }
  }

  const meta = MEETING_METHODS[method]
  if (!meta.online) {
    return {
      recorded: true, method, label: meta.short, host: null, url: null,
      location, joinable: false,
    }
  }
  const check = validateMeetingUrl(url, method)
  return {
    recorded: true,
    method,
    label: meta.short,
    host: check.ok ? check.host : null,
    url: check.ok ? check.url : null,
    location: '',
    // only a link that passed validation is ever clickable
    joinable: check.ok,
    invalid: !check.ok,
  }
}

/** Cancelled or settled sessions must not offer Join meeting. */
export const JOINABLE_STATUSES = ['proposed', 'scheduled', 'completed_pending_confirmation']
export const canJoin = (session) =>
  Boolean(session) && JOINABLE_STATUSES.includes(session.status) && describeMeeting(session).joinable
