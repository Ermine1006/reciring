# Buddy Program pilot

## Ready to demonstrate

Open `/buddy-demo` on the app domain. This route now demonstrates the founder's revised, student-led selection flow with synthetic data: any first-year student composes a Give & Ask post using the same `SubmitRequest` component as the marketplace; an approved upper-year student browses full posts and chooses whom to support; the first-year student accepts or declines. The coordinator grants upper-year access instead of assigning pairs. The demo has a three-place limit including pending invitations. A role selector simulates each perspective. Sample access is not a production authorization mechanism. Publishing, invitations, access changes and connections remain in memory; reset or refresh clears them. AI rewriting is disabled without making a request.

The production Buddy database and Together entry still use the earlier automatic-matching implementation described below. They have NOT been converted to the new selection workflow. That needs a separate schema/API migration and founder-run SQL; do not use the old automatic-matching pilot as if it implements the new design.

## Enable the real pilot

1. The founder runs `scripts/migration-buddy-program.sql` in Supabase SQL Editor. It assumes the existing `profiles`, `communities`, `community_members`, `blocks`, and `auth.users` tables. It is rerunnable and does not enable or enroll anyone.
2. Review the owner email in `scripts/setup-buddy-program.sql`, then run it. This creates a closed Rotman program and makes that registered owner its coordinator. Freeda's coordinator access requires her verified account email; the commented SQL shows how to add it. No email is guessed.
3. The founder-approved production release displays Buddy Program in Together by default. Refresh the web app after deployment. An explicit Vercel `VITE_BUDDY_ENABLED=false` hides the entry for rollback; remove it or set it to `true` and redeploy to restore the entry. Native TestFlight builds require a new app build to include these changes. The public `/buddy-demo` remains separate and uses sample data.
4. In Coordinator overview, add registered Rotman students to the roster by email, assigning mentor or mentee roles. They must already have `community_members.status='member'`. The role is enforced by the database, not by a client toggle. Roster access does not publish a post or imply participation consent.
5. Review mentor capacity and response period in Program settings, then enable posting and automatic matching. Each student must opt in and publish their own Give & Ask post. Coordinators cannot read their contact details, post bodies, or chats through the dashboard.
6. Optional AI assistance uses the existing `OPENROUTER_API_KEY` plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. An optional `BUDDY_AI_MODEL` overrides the existing app model. Users explicitly choose “Suggest topics with AI”; only their visible need, offer and relevant experience text are sent. AI suggestions are editable before saving. Without the key or on provider error, manual topic selection remains fully functional. This endpoint verifies sign-in and roster/coordinator access, bounds input/output, and has a per-instance burst limit; a shared rate limiter is recommended before a large rollout.
7. To enable the daily internal reminders and expired-pairing sweep, set `BUDDY_CRON_ENABLED=true`, `CRON_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` on Vercel. The cron is `/api/cron/buddy-follow-up` at 09:00 UTC daily. Before migration/configuration the job returns `skipped`. Notices are visible inside My buddy; no emails or push notifications are sent.

## How matching works

The database runs matching on publishing a post, responding to a suggestion, withdrawing, changing program settings, and the enabled daily job. It serializes mutations per program, considers mentees with fewer candidate mentors first, and reserves capacity for pending suggestions as well as accepted pairings. Mentor limits are bounded by both the mentor's preference and the program limit.

Hard requirements: roster eligibility, active community membership, opposite roles, no block in either direction, active posts, compatible meeting mode, a future shared window of at least 30 minutes, capacity, and at least half the mentee's selected need topics covered by the mentor's offer. Declined pairs are not re-suggested. Other closed pairs have a seven-day quiet period.

Within those constraints it ranks by need coverage first, optional reverse need/offer overlap second, shared self-described experience topics third, then lower mentor load and waiting time. AI classifies text into the canonical topic set; assignment is transparent, deterministic logic. This is not an LLM comparing every pair, not a globally optimal assignment solver, and not a proven improvement in real-world outcomes. “Precision” needs pilot measurement. No compatibility percentage is shown.

Names and the volunteered contact field are returned only to the two participants after both accept. Before that, the suggestion shares only the program role, authored need/offer, and opted-in relevant experience. Text could itself identify a person, so this is not guaranteed anonymization. Blocks are checked during matching, acceptance and pair reads. Withdrawing ends live pairings and frees capacity. Historical consent and pairing rows are retained for audit; this feature does not implement account-data deletion or a retention policy.

Suggested times are overlap evidence, not bookings. After acceptance, both participants receive the other's volunteered contact details and arrange the conversation. The first-conversation check-in is bilateral and separate from existing Together sessions and Exchange Tokens. It does not mint a token, unlock unrelated profile data, or add a Community Map edge.

## Coordinator scope

The dashboard is computed from real records: accepted pairs, waiting suggestions, unmatched active mentees, program roster participation and bilateral first-conversation confirmations. No real status counts are hardcoded. Exception categories cover rematch requests, no suitable mentor, no shared time, and capacity/meeting preferences. Coordinators can invite more enrolled mentors, request availability updates through their usual program communication, and adjust program capacity. This first version does not import existing pair assignments or send coordinator emails automatically.

## Verification and pilot measures

Local PGlite tests exercise the migration twice, direct-table and internal-RPC denial, participant-only actions, capacity, bilateral identity/contact release, bilateral check-in, coordinator privacy, blocks, no common time, invalid windows, rematching, and reminder deduplication. Browser tests cover the public sample on phone and desktop, both-party acceptance, introductions, check-in and exception review with no real mutations. API tests cover authentication, roster checks, constrained AI output and provider failure.

Measure coordinator time spent assigning and following up; proportion of mentees receiving a feasible suggestion; both-party acceptance; rematch reasons; first conversations confirmed by both; and a separately collected “Did you receive the support you needed?” response. Do not present synthetic demo counts as pilot evidence.
