# Buddy Program: upper-year choice

## Production entry

Together → Buddy Program now loads `BuddyChoiceProgram`, not the older automatic-pairing page. It uses real RPCs and never loads sample posts or silently switches to the demo. If the new schema is missing, it shows a setup message and a retry button.

## Founder-run SQL

**Open upper-year signup update:** If the Buddy choice workflow is already installed, run only `scripts/migration-buddy-open-access.sql` in Supabase SQL Editor. The new UI calls `buddy_choice_join_upper`; deploying the UI alone does not install that function. The script is additive, rerunnable and reloads the PostgREST schema cache. It does not change existing memberships, posts or invitations. Never run this against production on the founder's behalf.

In Supabase SQL Editor, run these files in order if not already installed:

1. `scripts/migration-buddy-program.sql` (base program/coordinator tables).
2. `scripts/setup-buddy-program.sql` (verify owner email before running).
3. `scripts/migration-buddy-choice.sql` (new posts, permission grants, invitations and RPCs).
4. `scripts/migration-buddy-open-access.sql` (upper-year self-enrollment).

If steps 1 and 2 were completed earlier, run steps 3 and 4. If step 3 is already installed, run only step 4. Rerunning the choice migration revokes all choice-function grants, so always reapply open access afterward. No sample students, posts, invitations or role grants are inserted. Existing automatic-matching posts/pairings remain in their original tables. Do not rerun the old setup to migrate posts or re-enable the old automatic matcher.

Verify with:

```sql
SELECT name, automatic, choice_enabled
FROM public.buddy_programs;
```

Expected: `automatic=false`, `choice_enabled=true`. The legacy `enabled` field does not gate this workflow. A database constraint prevents the legacy matcher from being enabled alongside manual choice.

The Together entry is enabled by default. An explicit Vercel `VITE_BUDDY_ENABLED=false` still hides it. Vercel deployment updates the web app; TestFlight requires a new native build.

## Actual user flow

- Active community members can self-enroll as first-year students by confirming their year and participation. Their year is self-declared, not independently verified. There is no individual first-year roster approval.
- First-year students publish using the existing Give & Ask `SubmitRequest` form. Offers remain optional. Audience text states that upper-year buddies in the community may browse. Anonymous posts hide the author name until a connection is accepted; real-name posts explicitly show the name.
- Upper-year students select their year and press **Join and browse requests**. Year is self-declared; coordinator approval is not required. The server still requires an active community membership and an enabled program. No year is selected in advance. Existing active upper-year accounts can retry safely. Paused participation cannot be reactivated by signup, and a first-year membership cannot be silently overwritten.
- Participating upper-year students filter and preview full posts, then choose whom to support. Pending and accepted invitations reserve up to three places, bounded by the program capacity.
- First-year students accept or decline invitations. Acceptance reveals names only to the two participants. One first-year student can have one accepted buddy per program; accepting one invitation withdraws their other pending invitations. Declined invitations are not silently resent.
- Upper-year students can withdraw invitations/end connections. First-year students can remove their own posts, which ends associated invitations. Revoking upper-year access ends their active invitations.
- Community membership and blocks are checked on reads, selection and acceptance. Expired pending invitations release capacity when the program is read or a selection is attempted. Accepted connections survive post expiry. The system does not automatically assign buddies.

## Boundaries

The coordinator sees upper-year participants but not the first-year post list unless they also join as an upper-year participant. Coordinator controls remain for assistance and moderation, not mandatory approval. Matching is manual choice, with no AI ranking or compatibility score. No notification emails, private emails, chat integration, calendar booking or Exchange Tokens are introduced. Connections reveal profile names, not contact details. The old Buddy daily cron does not process new choice invitations. Published text itself can identify its author.

## Demo

`/buddy-demo` uses synthetic, in-memory data. Expand “Interactive demo” to switch First-year, Upper-year and Coordinator perspectives. Demo role grants do not affect real permissions. It reuses the same composer and post presentation. Refresh/reset clears sample changes.

## Validation

PGlite tests install the migrations twice and verify both student signup paths, safe retries, community boundaries, paused programs, suspended participation, role-conflict rejection, anonymous author protection, reserved capacity, bilateral acceptance, blocks and table/helper denial. Recommendation tests use self-enrolled upper-year students. UI tests verify explicit role selection, successful signup routing, migration-missing recovery, publishing and invitations.

## Signup UX

The approval queue added work for the people volunteering to help. The new flow uses ease and agency: choose your year, join, browse a relevant request, offer support, return when the student responds. White role cards and one matcha action retain the current visual style without extra animation. Empty, loading, paused and error states explain the next step; the UI never claims signup succeeded before server confirmation. Measure signup-to-invitation conversion, accepted invitations and mutually verified exchanges, not visits. Bottom navigation, existing avatars, recommendation opt-in, community boundaries and mutual identity consent remain unchanged.

## Anonymous upper-year recommendations

Run `scripts/migration-buddy-recommendations.sql` after the choice migration. No one is automatically opted in. Participating upper-year students open **My anonymous buddy profile**, review help types and Career Focus prefilled where compatible with their own profile, then explicitly choose whether to appear in recommendations. Only those opted-in profile fields are exposed; no name, account ID, photo, employer, biography or contact details are returned. Self-enrolled upper-year students use the same recommendation permissions as existing participants.

The first-year page shows **People you should meet** below its main content. Recommendations use the selected published post's help types and Career Focus. Help overlap is weighted ahead of Career Focus overlap, with up to three eligible candidates per request. This is a simple topic-overlap recommendation, not AI ranking or a validated percentage. No score is shown. Exact canonical composer labels are used on both sides. Blocked, revoked, nonmember, fully allocated and already-invited/declined counterparts are excluded. Accepted first-year students receive no further recommendations.

**Interested** records an intention for that post and anonymously identifies the upper-year card via an opaque ID. The upper-year student's normal post list displays an interest badge after reloading or using **Refresh interests**. It does not create a pairing, reserve capacity, send email/push or reveal the upper-year identity. They still choose whether to invite the student, who then accepts. First-year real-name posts retain their chosen visibility. **Skip** hides the recommendation for this post across refreshes; **Withdraw interest** removes the intention and hides that suggestion. A student may select which of their published, unexpired posts to use for recommendations.

Missing recommendation SQL yields a local setup/unavailable message without breaking posting or selection. Synthetic examples in `/buddy-demo` remain clearly separate from production data. Database tests cover opt-in, access, identity protection, interest without pairing, persistent skips, revoked permissions, blocks and reserved capacity. Mobile/desktop browser checks cover card layout, anonymous profile expansion and interest/withdraw controls without external mutations.
