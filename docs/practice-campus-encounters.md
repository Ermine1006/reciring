# Campus encounters UI

Founder approved main push and deployment after reviewing the local implementation.
No database changes required. The 22 affected tests and production build passed.

## Interaction

The job is to find a useful practice partner without losing the current scene or
scrolling down to discover a card. Curiosity, ease and agency guide this change.
Explore the garden opens the first real candidate after a short walk. Continue
exploring walks to the next unseen candidate in the existing server order.
Scenes rotate through Campus garden, Campus library, Study room and Fifth floor
patio. The patio includes a CN Tower view. These are imagined campus illustrations,
not actual meeting locations or architectural reproductions.

The native modal sits above navigation, has a scrollable body, close control,
Escape dismissal, a dimmed inert background, and returns focus to the garden
action. It reuses PartnerCard and the actual invitation payload. Skills and
response history expand on demand; missing evidence remains missing. List view
retains full cards. Reduced motion reveals the encounter immediately.

The useful loop is recommendation, invitation, mutual acceptance, practice and
verified completion. Scenery awards no tokens and never changes eligibility,
privacy, recommendation order, identities or scores. Success remains reciprocal
acceptances and verified exchanges, not time spent walking. Empty pools and
filters retain recovery actions; failed art retains a usable gradient scene;
exhausted recommendations lead to the list without an endless discovery loop.

## Assets

Generated using the built-in image generation tool, then encoded as 900px WebP
for the app. Existing garden and profile avatars are preserved.

- `public/illustrations/practice-library.webp`: cozy university library, tall
  bookshelves, green lamps, arched windows, golden light, pixel art, open lower
  walkway, no people or UI.
- `public/illustrations/practice-study-room.webp`: university study room, shared
  desks, plants, large campus windows, warm daylight, pixel art, open lower
  walkway, no people or UI.
- `public/illustrations/practice-patio.webp`: imagined fifth floor library patio,
  CN Tower skyline, glass railing, plants, study tables, golden afternoon,
  pixel art, open lower walkway, no people or UI.

## Review

Run the app locally and open Together, Practice Together. With at least four
eligible candidates, Explore then Continue exploring three times shows all four
scenes. Check the close button, Escape, List view, filter changes, avatar colour,
and expanded skills on a narrow viewport. Invite uses the existing real action;
do not send invitations solely for visual review. Automated tests cover order,
scene rotation, modal dismissal, focus return, polling removal and reduced motion.
Native mobile modal scrolling and visual layout still need device review.
