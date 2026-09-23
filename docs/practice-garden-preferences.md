# Practice Together: garden and personal preferences

Implemented on `feat/practice-garden-preferences`, based on main `3f7e22d`. Release target: a preview branch only, not main or production. The founder applies any production SQL manually.

## UX decision

The job is to find a useful reciprocal practice partner and edit preferences without searching through a game. The main barriers are a hidden settings link and too many steps before seeing a person.

Following the mandatory Mutu behavioral UX skill, this change uses ease (saved preferences and a visible entry), agency (list bypass and editable choices), and curiosity (a brief walk to a real partner). Walking is not rewarded or required.

Flow: **Together → Practice Together → Personalise my practice → Save → Garden or List → Invite → My Sessions → existing Messages**.

The existing My Sessions tab remains visible on entering Practice Together. The five stage journey is optional disclosure. Demo profiles remain available below real results and are explicitly fictional; the demo iframe loads only when opened.

## Inputs and hierarchy

The gold outlined **Personalise my practice** card stays above discovery and across journey stages. It includes direct links to practice types and availability.

- **What would you like to work on?** Up to three private focus skills from the canonical category rubric.
- **What can you help a partner with?** Up to three skills, visibly identified as chosen by the member, not verified endorsements.
- **Practice before Mutu** Optional range for each selected practice category. Private and self reported. Not added to verified session totals, used as a competence score, displayed on public pool cards, or used to rank people.
- Existing partner badge, verified history and invitation response sharing controls retain their separate explicit consent.

First time users can optionally add these details in the quick setup card. Only the two reciprocal practice type selections are required. Changing or saving skills reuses existing recommendation RPCs and server ordering. Feedback suggestions still require explicit selection and Save.

## Garden behavior and states

The generated pixel campus garden uses Mutu's white, matcha and muted gold controls with a short walking animation. The scene is decorative; text remains ordinary accessible HTML. It uses the existing scrolling screen container, not a fixed modal.

Case and Behavioural filter who can support the viewer's selected practice type while retaining reciprocal eligibility. A category not in saved preferences offers an edit action. Filtering never fabricates new candidates or scores.

Garden and List show the same server ranked people. One explicit click reveals the next unvisited recommendation. No autoplay, infinite loop, points, random rewards or name reveal. Reduced motion reveals immediately; hiding the page stops the walk. Encounter headings receive focus and scroll into view as needed. A failed decorative image does not block discovery.

Loading, genuine empty results, unavailable preferences, fetch failures and exhausted discovery each have distinct messages and recovery actions. Live refresh preserves the current encounter and unsaved skill edits. An unavailable candidate cannot remain invitable through a stale encounter. Expired availability has a visible update action without preventing a match.

## Database release boundary

The founder must manually run `scripts/migration-practice-starting-experience.sql` in the Supabase SQL Editor, after the existing recommendation and peer/history migrations. Do not rerun old browse migrations after newer ones.

The additive migration provides a private `prior_practice` column and two new get/save RPCs. It has no backfill, does not alter recommendation ordering, and does not modify pairings, sessions, profiles or tokens. Skills, consent and starting experience save atomically through the new RPC. Tests cover membership checks, author-only reads, anonymous denial, invalid inputs, retry safety and legacy-client compatibility.

Until this migration is applied, the frontend uses the existing skill preference RPC and omits the unsupported starting experience fields. Only missing-function errors allow fallback; authorization and network errors remain visible. A rollback can deploy the previous UI while preserving authored starting experience in the additive column.

## Manual acceptance checks

1. Use two consenting test accounts in the same community. Open Together, then Practice Together. Verify both For You and My Sessions are present without selecting a prior partner.
2. Open Personalise my practice. Select one private focus and one support skill. Save and reopen after refresh. Verify both persist. After the SQL update, also save and clear a starting practice range.
3. With both types selected, toggle Case and Behavioural. Check the card explains the selected type, while the reciprocal support requirement remains in effect.
4. Choose List view to bypass walking. Return to Garden and explore once. Verify it opens a real candidate in the same server order, not a sample profile.
5. Invite a partner. On the other account, accept through existing invitations. From My Sessions open Messages and confirm the existing real conversation is used for planning.
6. Open a preference draft, change a skill, and trigger a session/invitation refresh. The unfinished selection should remain. Test a failed Save and retry.
7. Test on iPhone with large text, a narrow viewport, keyboard open in availability editing, and Reduce Motion enabled. Confirm the preference Save button and invitation controls remain reachable by scrolling.
8. Complete a real test practice using the existing workflow. Verify counts and the shared token change only after both confirmations, never after walking or entering prior experience.

## Success and unchanged boundaries

Measure fewer abandoned setups, invitation acceptance, scheduled practices and mutually verified exchanges. Do not use walking time or number of encounters as success metrics. No new telemetry was added.

Existing community eligibility, blocking, mutual consent identity reveal, actual invitation endpoints, Messages, scheduling, feedback, token issuance, feature flag defaults, Buddy updates, login fixes, Give & Ask and the website remain unchanged.

## Verification

Automated verification: full Vitest suite and production build. The local SQL tests use PGlite, never Supabase. Browser rendering and iOS/TestFlight acceptance still require manual testing; automated DOM tests are not an iOS visual signoff.
