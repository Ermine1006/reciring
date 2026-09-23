# Together ivory refinement

Approved reference: the September 23 Together concept with ivory bevels,
gold double borders, matcha practice and buddy actions, gold event action.

The user's job is to choose a useful way to connect without interpreting a
dense dashboard. The barrier is inconsistent typography and unclear action
hierarchy. Relevant motivation lenses are ease (short copy and aligned
actions), agency (explicit buttons), and attraction (familiar garden art).

Hierarchy: Together and real token count; existing For You / My Sessions;
Practice Together, Groups & Events, Buddy Program; compact Story Garden.
Copy is kept in togetherContent.js and the respective entry components.
Cards retain the existing pixel assets, with ivory surfaces, thin gold edges,
raised buttons, consistent image proportions and smaller semibold typography.
The shared header, navigation and avatar remain their existing components.
The concept's sample counts are never hardcoded. No new motion is introduced.

Flow: choose an entry, use the existing feature, complete a useful exchange,
mutually verify it, return through My Sessions. Success remains completed
verified exchanges and reciprocal invitation acceptance, not page dwell time.

Boundaries: landing presentation and copy only. Feature flags, anonymous
identity rules, matching, privacy, consent, scheduling, loading/error/empty
states and completed-session handling are unchanged. Story Garden's compact
button opens the same feature; its original full entry remains available to
other callers. Narrow screens retain wrapping and 44px minimum actions.

Validation: production build and existing Together summary tests. Device
visual comparison is still needed; this is a code implementation, not a claim
of pixel-perfect rendering across different system fonts and viewports.
