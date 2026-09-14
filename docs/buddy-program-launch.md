# Buddy Program: upper-year choice

## Production entry

Together → Buddy Program now loads `BuddyChoiceProgram`, not the older automatic-pairing page. It uses real RPCs and never loads sample posts or silently switches to the demo. If the new schema is missing, it shows a setup message and a retry button.

## Founder-run SQL

In Supabase SQL Editor, run these files in order if not already installed:

1. `scripts/migration-buddy-program.sql` (base program/coordinator tables).
2. `scripts/setup-buddy-program.sql` (verify owner email before running).
3. `scripts/migration-buddy-choice.sql` (new posts, permission grants, invitations and RPCs).

If steps 1 and 2 were completed earlier, run ONLY step 3. The new script is rerunnable. It stops automatic allocation and enables the manual-choice workflow. No sample students, posts, invitations or role grants are inserted. Existing automatic-matching posts/pairings are retained in their original tables and are not imported into the new workflow. Do not rerun the old setup to migrate posts or re-enable the old automatic matcher.

Verify with:

```sql
SELECT name, automatic, choice_enabled
FROM public.buddy_programs;
```

Expected: `automatic=false`, `choice_enabled=true`. The legacy `enabled` field does not gate this workflow. A database constraint prevents the legacy matcher from being enabled alongside manual choice.

The Together entry is enabled by default. An explicit Vercel `VITE_BUDDY_ENABLED=false` still hides it. Vercel deployment updates the web app; TestFlight requires a new native build.

## Actual user flow

- Active community members can self-enroll as first-year students by confirming their year and participation. Their year is self-declared, not independently verified. There is no individual first-year roster approval.
- First-year students publish using the existing Give & Ask `SubmitRequest` form. Offers remain optional. Audience text states that only approved upper-year buddies may browse. Anonymous posts hide the author name until a connection is accepted; real-name posts explicitly show the name.
- A coordinator verifies an upper-year student's role and grants browsing access to their exact registered email. The account must already belong to the program's community. Only coordinators can grant/revoke this access; a browser role toggle cannot grant it.
- Approved upper-year students filter and preview full posts, then choose whom to support. Pending and accepted invitations reserve up to three places, bounded by the program capacity.
- First-year students accept or decline invitations. Acceptance reveals names only to the two participants. One first-year student can have one accepted buddy per program; accepting one invitation withdraws their other pending invitations. Declined invitations are not silently resent.
- Upper-year students can withdraw invitations/end connections. First-year students can remove their own posts, which ends associated invitations. Revoking upper-year access ends their active invitations.
- Community membership and blocks are checked on reads, selection and acceptance. Expired pending invitations release capacity when the program is read or a selection is attempted. Accepted connections survive post expiry. The system does not automatically assign buddies.

## Boundaries

The coordinator sees granted upper-year accounts but not the first-year post list unless separately authorized as an upper-year participant. Matching is manual choice, with no AI ranking or compatibility score. No notification emails, private emails, chat integration, calendar booking or Exchange Tokens are introduced. Connections reveal profile names, not contact details. The old Buddy daily cron does not process new choice invitations. Published text itself can identify its author.

## Demo

`/buddy-demo` uses synthetic, in-memory data. Expand “Interactive demo” to switch First-year, Upper-year and Coordinator perspectives. Demo role grants do not affect real permissions. It reuses the same composer and post presentation. Refresh/reset clears sample changes.

## Validation

PGlite tests install the migrations twice and verify community access, self-enrollment, coordinator-only grants, anonymous author protection, upper-year-only browsing/selection, reserved capacity, bilateral acceptance, one accepted buddy, revoked access, blocks, table/helper denial and post removal. UI tests verify the actual composer calls the new publish API, upper-year selection calls its API, and missing-schema states never fall back to sample or automatic matching.

## Anonymous upper-year recommendations

Run `scripts/migration-buddy-recommendations.sql` after the choice migration. No one is automatically opted in. Approved upper-year students open **My anonymous buddy profile**, review help types and Career Focus prefilled where compatible with their own profile, then explicitly choose whether to appear in recommendations. Only those approved, opted-in profile fields are exposed; no name, account ID, photo, employer, biography or contact details are returned.

The first-year page shows **People you should meet** below its main content. Recommendations use the selected published post's help types and Career Focus. Help overlap is weighted ahead of Career Focus overlap, with up to three eligible candidates per request. This is a simple topic-overlap recommendation, not AI ranking or a validated percentage. No score is shown. Exact canonical composer labels are used on both sides. Blocked, revoked, nonmember, fully allocated and already-invited/declined counterparts are excluded. Accepted first-year students receive no further recommendations.

**Interested** records an intention for that post and anonymously identifies the upper-year card via an opaque ID. The upper-year student's normal post list displays an interest badge after reloading or using **Refresh interests**. It does not create a pairing, reserve capacity, send email/push or reveal the upper-year identity. They still choose whether to invite the student, who then accepts. First-year real-name posts retain their chosen visibility. **Skip** hides the recommendation for this post across refreshes; **Withdraw interest** removes the intention and hides that suggestion. A student may select which of their published, unexpired posts to use for recommendations.

Missing recommendation SQL yields a local setup/unavailable message without breaking posting or selection. Synthetic examples in `/buddy-demo` remain clearly separate from production data. Database tests cover opt-in, access, identity protection, interest without pairing, persistent skips, revoked permissions, blocks and reserved capacity. Mobile/desktop browser checks cover card layout, anonymous profile expansion and interest/withdraw controls without external mutations.
