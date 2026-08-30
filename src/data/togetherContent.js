// ── Together page: tokens and copy, in one place ─────────────────
// The Together redesign keeps every product decision where it already
// lives. This module holds only presentation constants, so the page's
// wording and palette can be asserted in tests without rendering a
// DOM, and so no arbitrary hex values get scattered through the JSX.
//
// Positioning that must survive any future edit: Together is Mutu's
// broad community hub. Mock Interview is ONE consulting-focused
// feature inside it. Groups & Events is an equal-level pathway and is
// never described as consulting-specific.

// Existing app values, re-exported rather than re-invented, so this
// page can never drift from the rest of Mutu.
import { MATCHA_DEEP, MATCHA_SOFT, MATCHA_INK } from '../lib/matchaCta'

export const T = {
  // canvas — matches AppScreen's default background exactly
  page:        '#F9F7F4',
  surface:     '#FFFFFF',
  // pale matcha surface for the practice-side card + selected tab
  matchaSoft:  MATCHA_SOFT,   // #F0F2E8
  matchaDeep:  MATCHA_DEEP,   // #68764A — action green
  matchaInk:   MATCHA_INK,
  // restrained Mutu gold
  gold:        '#C9A33B',
  goldDark:    '#A6822A',
  goldLight:   '#E8D9A7',
  goldBg:      '#F8F3E5',
  // text
  ink:         '#18160F',     // charcoal
  ink2:        '#6E6A61',     // secondary warm gray
  ink3:        '#9A958B',
  border:      '#E9E5DD',
  radius:      20,            // 20–24px card radii
  radiusSm:    14,
  shadow:      '0 1px 2px rgba(24,22,15,0.04), 0 6px 18px rgba(24,22,15,0.05)',
}

export const FONT = 'Inter, system-ui, sans-serif'

/** Every interactive element on this page clears the 44px minimum. */
export const MIN_TAP = 44

export const PAGE = {
  title: 'Together',
  subtitle: 'Practise, learn and connect with your community.',
  connectHeading: 'How do you want to connect?',
  activityTitle: 'Your activity',
  activityAction: 'View progress',
  upcomingHeading: 'Upcoming for you',
}

// The two equal-weight pathways. `action` is the id the page maps to
// the EXISTING flow; no route or handler is defined here.
//
// `art` is an OPTIONAL drop-in illustration. Put a file at that path
// under public/ and the card uses it; leave the path empty and the
// card keeps its built-in SVG. A file that 404s also falls back to
// the SVG, so a typo can never leave a broken image on the page.
export const CONNECTION_CARDS = [
  {
    id: 'one_on_one',
    action: 'practice',
    title: 'Mock Interview',
    sub: 'Practise consulting case and behavioural interviews',
    cta: 'Find a partner',
    tone: 'matcha',
    art: '/illustrations/mock-interview.png',
  },
  {
    id: 'groups',
    action: 'events',
    title: 'Groups & Events',
    sub: 'Learn, share interests and meet your community',
    cta: 'Explore events',
    tone: 'gold',
    art: '/illustrations/groups-events.png',
  },
]

/** The box the card art is drawn into, at 1x. */
export const ART_BOX = { width: 74, height: 60 }

export const EMPTY_EVENT = {
  title: 'No upcoming events yet',
  body: 'Explore Groups & Events to see what’s happening in the community.',
  cta: 'Explore events',
}

// One entry per matching state. Copy must stay accurate: only
// `searching` may claim that matching is under way.
export const MATCHING_COPY = {
  not_enrolled: {
    title: 'Join the mock interview pool',
    body: 'Tell us what you want to practise and what you can help with, and we will look for a match.',
    cta: 'Set up my preferences',
  },
  searching: {
    title: 'Finding your mock interview partner',
    body: 'We’re looking for someone whose goals and availability complement yours.',
    cta: 'Update preferences',
  },
  suggested: {
    title: 'Partners are ready for you',
    body: 'Someone in your community complements what you want to practise.',
    cta: 'Update preferences',
  },
  invitation_pending: {
    title: 'Your invitation is waiting',
    body: 'You have sent an invitation. You will hear back once they respond.',
    cta: 'Update preferences',
  },
  invitation_received: {
    title: 'Someone invited you',
    body: 'A partner would like to practise with you. Their invitation is in My Sessions.',
    cta: 'Update preferences',
  },
  scheduled: {
    title: 'Your mock interview is booked',
    body: 'The details are in My Sessions, along with where you are meeting.',
    cta: 'Update preferences',
  },
  paused: {
    title: 'You have left the matching pool',
    body: 'Nobody is being matched with you right now. You can rejoin whenever you like.',
    cta: 'Rejoin the pool',
  },
}
