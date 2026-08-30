// ── Shared taxonomy for the reciprocal Practice feature ──────────
// Single source of truth. Import from here everywhere.
//
// The DB CHECK on practice_requests accepts the FULL canonical list
// (migration-practice-reciprocal.sql §3), but the Rotman consulting
// pilot UI surfaces only PILOT_PRACTICE_TYPES. Widening later is a
// UI change, not a migration.

export const PRACTICE_TYPES = [
  'case',
  'behavioural',
  'technical',
  'product',
  'finance',
  'other',
]

// What the pilot request composer actually shows (consulting focus).
export const PILOT_PRACTICE_TYPES = ['case', 'behavioural']

export const PRACTICE_TYPE_LABELS = {
  case:        'Case interview',
  behavioural: 'Behavioural / fit',
  technical:   'Technical',
  product:     'Product',
  finance:     'Finance',
  other:       'Other',
}

// Compact labels for the reciprocal pair headline ("Case ↔ Behavioural")
// and the YOU GET / YOU GIVE columns.
export const PRACTICE_TYPE_SHORT = {
  case:        'Case',
  behavioural: 'Behavioural',
  technical:   'Technical',
  product:     'Product',
  finance:     'Finance',
  other:       'Other',
}

// Session length options (DB CHECK allows 30–180 min; default 60 is
// long enough for the two-round agenda).
export const DURATION_OPTIONS = [45, 60, 90]
export const DEFAULT_DURATION_MINUTES = 60

export const DEFAULT_TIMEZONE = 'America/Toronto'

export const LOCATION_TYPES = [
  { value: 'virtual',   label: 'Virtual' },
  { value: 'in_person', label: 'In person' },
  { value: 'either',    label: 'Either' },
]

// The default two-round session agenda (guidance shown in session
// detail — not a rigid timer).
export const SESSION_AGENDA = [
  { minutes: 5,  label: 'Set goals and choose order' },
  { minutes: 20, label: 'Round 1 interview' },
  { minutes: 5,  label: 'Round 1 feedback' },
  { minutes: 20, label: 'Round 2 interview' },
  { minutes: 5,  label: 'Round 2 feedback' },
  { minutes: 5,  label: 'Agree on next step' },
]

// Human-readable messages for the RPC error codes raised by the
// Practice SECURITY DEFINER functions (see migration §10).
export const PRACTICE_ERROR_MESSAGES = {
  not_authenticated:        'Please sign in again.',
  not_eligible:             'Together is not available for this account yet.',
  request_unavailable:      'This mock interview request is no longer available.',
  cannot_invite_self:       "You can't invite yourself.",
  own_request_required:     'Set up your own mock interview first. Both people practise, both people help!',
  no_mutual_fit:            "This partner's request doesn't match yours in both directions.",
  already_invited:          'There is already an invitation between you two.',
  invalid_slot:             'That time slot is no longer available. Please pick another.',
  slot_taken:               'That time slot was already booked for another session.',
  pairing_not_found:        'This invitation no longer exists.',
  not_addressee:            'Only the invited person can respond to this invitation.',
  not_requester:            'Only the sender can withdraw this invitation.',
  invalid_state:            'That action is no longer available. Things have moved along since.',
  invitation_expired:       'This invitation has expired.',
  not_participant:          "You're not part of this mock interview session.",
  session_not_found:        'This session no longer exists.',
  session_already_live:     'There is already a proposed or scheduled session. Respond to that one first.',
  cannot_confirm_own_proposal: 'Your partner needs to confirm the time you proposed.',
  use_withdraw:             'You proposed this time. Withdraw it instead of declining.',
  not_proposer:             'Only the person who proposed this time can withdraw it.',
  start_in_past:            'Pick a time in the future.',
  session_not_started:      "You can confirm after the session's scheduled start time.",
  invalid_outcome:          'Choose a valid outcome.',
  invalid_no_show_of:       'Invalid no-show selection.',
  already_confirmed:        'You already submitted your confirmation.',
}

export function practiceErrorMessage(error) {
  if (!error) return null
  const code = String(error.message || error).trim()
  return PRACTICE_ERROR_MESSAGES[code] || 'Something went wrong. Please try again.'
}
