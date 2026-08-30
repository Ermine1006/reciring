// ── Exchange activity-type registry ──────────────────────────────
// One config for every user-facing activity type in the unified
// Exchange feed. `active` means REAL backend support exists today —
// inactive types may be listed but must never pretend to work.
// (Presentation layer only: Practice DB objects/RPCs keep their names.)

export const EXCHANGE_TYPES = [
  {
    id: 'mock_interview',
    label: 'Mock Interview',
    group: '1:1',
    active: true,                    // backed by the Practice tables/RPCs
    reward: 'token',                 // mutual verification mints 1 shared token
    blurb: 'A reciprocal two-round exchange, one round for each of you.',
  },
  {
    id: 'pitch_exchange',
    label: 'Pitch Exchange',
    group: '1:1',
    active: false,
    reward: 'token',
    blurb: 'Practise your pitches and share feedback.',
  },
  {
    id: 'resume_review',
    label: 'Resume Review',
    group: '1:1',
    active: false,
    reward: 'token',
    blurb: 'Review each other’s resumes.',
  },
  {
    id: 'skill_exchange',
    label: 'Skill Exchange',
    group: '1:1',
    active: false,
    reward: 'token',
    blurb: 'Trade skills, like Excel ↔ Presentation or Finance ↔ Product.',
  },
  {
    id: 'accountability',
    label: 'Accountability Session',
    group: 'Groups',
    active: false,
    reward: 'token',
    blurb: 'Complete a defined goal together.',
  },
  {
    id: 'group_circle',
    label: 'Group Circle',
    group: 'Groups',
    active: false,
    reward: 'token',
    blurb: 'A small circle around a shared interest.',
  },
  {
    id: 'event',
    label: 'Event',
    group: 'Events',
    active: true,                    // existing Events backend
    // Events currently have NO reliable completion-verification
    // mechanism (event_attendees.attendance_status is unused), so
    // they must not promise a token. See deferred backend list.
    reward: 'none',
    blurb: 'Workshops, dinners, and community gatherings.',
  },
]

export const EXCHANGE_FILTERS = ['All', '1:1', 'Groups', 'Events']

export const isGroupActive = (group) =>
  EXCHANGE_TYPES.some((t) => t.group === group && t.active)
