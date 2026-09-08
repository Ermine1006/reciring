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
