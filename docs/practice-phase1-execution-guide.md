# Practice Phase 1 — Manual execution guide (founder)

**Files** (run in this order, all manually, in the Supabase SQL Editor):

1. [scripts/schema-baseline-dump.sql](../scripts/schema-baseline-dump.sql) — read-only pre-flight + baseline
2. [scripts/migration-practice-reciprocal.sql](../scripts/migration-practice-reciprocal.sql) — the migration (idempotent; rollback SQL at the bottom)
3. [scripts/practice-assertions.sql](../scripts/practice-assertions.sql) — the proof suite (self-rolls-back; touches nothing permanently)

**Local verification already done (2026-08-26):** all three files were executed against a scratch PostgreSQL 17 with a stub of the live schema (Supabase roles, `auth.uid()`, `profiles`, `matches` with its real `matches_source_chk`, `notifications` with the current 10-value CHECK, `user_emails`, `blocks`, and Supabase-style broad default grants). Results: migration applies cleanly on a fresh DB, is idempotent on re-run, all **27 assertion groups pass**, the rollback section removes every practice object while keeping `communities` and restoring the notifications CHECK, and re-migrating after a rollback works. None of this touched Supabase — the same proof must now be repeated on the real project, where drift could differ.

---

## Step 1 — Baseline dump (read-only, ~5 min)

Run each section of `schema-baseline-dump.sql`. Save all output to `scripts/schema-baseline-2026-08-26.txt` and commit it.

**Stop conditions (fix before Step 2):**

- §0.1 name collisions: any non-NULL table or any function row → an object already exists; compare before proceeding.
- §0.2 `blocks` shape: must have `blocker_id` and `blocked_user_id` (uuid). If the live names differ, update the three `public.blocks` references in the migration (§9 browse RPC and §10.1 invitation RPC) first.
- §0.3 notifications CHECK: must list exactly the ten values named in the file. If the live list has **more**, add the extras to §12 of the migration — omitting one breaks existing notification triggers (Events/marketplace).
- §0.4 `matches_source_chk` must be the expected definition (it permits the post-less `source='practice'` insert).
- §0.5 is your B1 review: the exact people the backfill will enroll as Rotman members. This is your one-time attestation — read the list.

> **2026-08-26 update — first live attempt caught real drift.** The founder's baseline + first migration run proved `public.blocks` does not exist in production, even though the app's Block button ([safety.js](../src/lib/safety.js)) has been calling it — blocking was silently failing. The migration's new **§0** now creates that table (additive, empty, own-rows-only RLS), which fixes the Block feature and lets the Practice exclusions work. The Supabase SQL Editor runs a pasted script as one implicit transaction, so the failed attempt committed **nothing** — confirm with `SELECT to_regclass('public.communities');` (expect NULL), then simply run the updated migration file. The whole pipeline was re-verified locally against a stub **without** a blocks table, matching production.

## Step 2 — Dry run, then real run (~10 min)

1. Paste the **entire** migration wrapped in a transaction:
   ```sql
   BEGIN;
   -- <full contents of migration-practice-reciprocal.sql>
   ROLLBACK;
   ```
   Expect zero errors. This proves it parses and applies against the live schema without committing anything.
2. Run the file again **without** the wrapper (or with `COMMIT;` instead of `ROLLBACK;`). It is idempotent — re-running later is safe; the B1 backfill is internally guarded and only ever fires while the Rotman community has zero members.
3. Quick sanity:
   ```sql
   SELECT count(*) FROM public.community_members cm
   JOIN public.communities c ON c.id = cm.community_id WHERE c.slug='rotman';
   -- expect: the number of active profiles you reviewed in §0.5 (43 as of the last snapshot)
   SELECT * FROM public.practice_admin_report;   -- one row per community, all zeros
   ```

## Step 3 — Assertion suite (~2 min)

Run `practice-assertions.sql` as one batch. It wraps itself in `BEGIN … ROLLBACK`, creates throwaway users, and exercises RLS/auth for real by switching to the `authenticated`/`anon` roles with emulated JWT claims.

- **Success** = final `NOTICE: ALL PRACTICE ASSERTIONS PASSED` (27 `ok:` notices before it) and no error.
- Any `ASSERTION <id> FAILED` aborts and rolls back — nothing to clean up; send me the id.
- If the very first `INSERT INTO auth.users` fails, your auth schema wants more columns — the file header says what to edit.

What it proves, in brief: the one-time backfill guard; strict D1 auto-enroll (`rotman.utoronto.ca` yes, `mail.utoronto.ca` no); one active request per user per community; anonymous browse with exact windows but no path to the owner; both-sides community eligibility (a de-membered owner vanishes instantly); pre-acceptance anonymity in views, RPC returns, and notification payloads; no duplicate live pairing; addressee-only single acceptance; contextual reveal on a **new** practice match with the pre-existing anonymous match byte-untouched; snapshot immutability; mutual propose→confirm scheduling; zero direct client write paths; the completion time-gate and both-rounds reciprocity gate; atomic verify + exactly one shared community-stamped token (idempotent mint); token/edge privacy; service-role-only admin report; composite FKs forbidding any cross-community session or token; the 30-day decline cooldown with indefinite block exclusion; full anon/public lockout; all ten pre-existing notification types intact; and unblocked account deletion.

## Rollback (if ever needed)

The migration file ends with a commented `ROLLBACK` section — run its statements top to bottom. It removes every practice object and restores the notifications CHECK verbatim, but **keeps** `communities`/`community_members` (a general Mutu primitive other features may adopt) and keeps `matches` rows with `source='practice'` (real user conversations; inert without the tables). A separately-commented "full rollback" variant inside it also drops the community tables — only if nothing else has adopted them.

## Not in this migration (deliberately)

- No cron entry — `practice_sweep_expired()` exists (service-role only) but scheduling it is Phase 4; you can run `SELECT public.practice_sweep_expired();` manually meanwhile.
- No realtime publication on any `practice_*` table (invitation UX rides the notifications bell).
- No frontend — Phase 2/3 begin only after this migration is live and asserted.
- Nothing writes to existing tables except the notifications CHECK re-list and the one-time backfill INSERT into the new membership table.
