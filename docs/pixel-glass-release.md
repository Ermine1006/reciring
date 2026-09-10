# Pixel & Glass production UI

This release adds the approved warm pixel campus atmosphere and glass materials to the existing Mutu application. Home keeps Community Map and My Circle, Discover keeps its original swipe gestures and consent flow, and Together keeps Mock Interview, Groups & Events and Story Garden. Chat, profile, scheduling, reporting and settings retain their existing handlers and routes.

## Presentation

Shared surface variables and glass controls cover existing screens, sheets and forms. Campus artwork frames the phone layout. Together has two pixel scene illustrations. Career Focus circles gain a glass highlight while keeping their current placement, labels, aggregate links and existing motion policy. No activity or relationship data is invented.

AnonymousAvatar.jsx and presetAvatars.js are unchanged, including all seeds and identity rules. Avatar buttons are excluded from the added glass treatment. No database, authentication, API, taxonomy or feature-flag changes are required.

## UX checks

The relevant motivations are curiosity (explore real connections), ease (keep familiar navigation and actions), and earned pride (retain verified relationship progress). The loop remains discovering a relevant opportunity, choosing an interaction, completing and mutually confirming it, and seeing the resulting relationship progress. Existing warm copy, loading, empty, error and completed states are retained. Success remains completed verified exchanges, not raw swipes or time spent.

Focus indicators remain visible. Existing graph reduced-motion, visibility and offscreen policies remain intact. Opaque surface fallbacks support reduced transparency. Forms and story text use high-opacity reading surfaces.

## Verification

- Production build passes.
- 337 tests pass across 17 files. The shared palette contract now expects the CSS theme variable with the previous color as fallback.
- Anonymous avatar source SHA-256: e8609f4ad26a83fbe1fc0ee1312cc27fe8b7e5693b992ba16e08689c92ceb0c1
- Preset avatar source SHA-256: deebc42719550d8dc46b84791a830c72625bf23ece645805579247d05818b142
- Browser connection did not respond in this environment. Phone visual comparison, authenticated end-to-end checks and physical iOS acceptance remain unverified; this is not a claim of pixel-perfect parity with all design boards.

Deployment uses the existing Vercel project connected to main. Reverting this release commit restores the prior UI without a database rollback.

## Together and notification follow-up

Together entries now use full-width horizontal rows, with square artwork on the left and the existing description and action on the right. Each scene preserves the source sprite's square aspect ratio rather than stretching into a wide rectangle.

Notifications render through a document-body portal above the phone shell. This avoids the stacking context introduced by the glass header's backdrop filter. The opaque panel is bounded by viewport width and height, with a scrollable list, backdrop dismissal, close button, Escape, keyboard navigation and focus restoration. Notification data, read state and destination handlers are retained.

Production build and 339 tests pass, including portal placement, dismissal/focus restoration and keyboard message selection. These DOM checks do not claim physical-phone visual verification. Avatar sources remain unchanged.

## Web chat scrolling correction

ChatView now participates in the constrained flex layout with a zero minimum height. Its message list can shrink and scroll inside the available space, leaving the composer fixed below it. Automatic scrolling targets the message list itself instead of scrollIntoView, which could also scroll ancestor containers. The scroll region is keyboard-focusable. Message, match, scheduling and avatar logic are unchanged. Browser visual acceptance remains a separate manual check.

## PC Matches index scrolling correction

The Matches index was wrapped in AppScreen's phone-scroll while MatchesList also owned a phone-scroll container. The content-sized inner container had overscroll containment, trapping desktop wheel/trackpad scrolling before the outer container could move. MatchesList now renders directly in the constrained main flex area as the sole scroll owner, with an explicit zero flex minimum, keyboard focus and a more visible scrollbar. Active/Past filtering, destinations, rows and avatars are preserved. Production build and all 339 existing tests pass; these are not a browser wheel acceptance test.
