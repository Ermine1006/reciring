-- ============================================================
-- Mutu — Practice Phase 1 · Step 0: live-schema baseline dump
--
-- READ-ONLY. Run each section in the Supabase SQL Editor (as the
-- default postgres/service role) and save the combined output to
--   scripts/schema-baseline-2026-08-26.txt   (commit it)
-- BEFORE running migration-practice-reciprocal.sql.
--
-- Why: scripts/ is a proven-drifted mirror of the live schema
-- (see docs/practice-workflow-audit.md §1.4). This dump is the
-- authoritative baseline the Practice migration was written
-- against. If any PRE-FLIGHT check below fails, STOP and resolve
-- before migrating.
-- ============================================================


-- ── 0.1 PRE-FLIGHT · name-collision check ────────────────────
-- Every row must come back NULL. A non-null value means an object
-- the migration wants to create already exists — stop and compare.
SELECT
  to_regclass('public.communities')                    AS communities,
  to_regclass('public.community_members')              AS community_members,
  to_regclass('public.practice_requests')              AS practice_requests,
  to_regclass('public.practice_availability_windows')  AS practice_availability_windows,
  to_regclass('public.practice_pairings')              AS practice_pairings,
  to_regclass('public.practice_sessions')              AS practice_sessions,
  to_regclass('public.practice_session_confirmations') AS practice_session_confirmations,
  to_regclass('public.practice_exchange_tokens')       AS practice_exchange_tokens;

SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_community_member','practice_is_community_eligible',
                    'browse_practice_requests','send_practice_invitation',
                    'accept_practice_pairing','decline_practice_invitation',
                    'withdraw_practice_invitation','propose_practice_session',
                    'confirm_practice_session','decline_practice_session',
                    'withdraw_practice_session','cancel_practice_session',
                    'submit_practice_confirmation','practice_sweep_expired',
                    'enroll_rotman_on_verified_email','touch_practice_updated_at');
-- Expected: zero rows.


-- ── 0.2 PRE-FLIGHT · blocks table shape ──────────────────────
-- The browse RPC excludes blocked pairs. src/lib/safety.js uses
-- public.blocks(blocker_id, blocked_user_id) but scripts/ has no
-- CREATE TABLE for it (drift). Confirm the live shape matches:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'blocks'
ORDER BY ordinal_position;
-- Expected columns to include: blocker_id (uuid), blocked_user_id (uuid).
-- If names differ, edit the "blocks" references in
-- migration-practice-reciprocal.sql (search: "public.blocks") first.
-- RESULT 2026-08-26: ZERO ROWS — public.blocks does not exist in
-- production even though src/lib/safety.js calls it (the Block button
-- was silently failing). The migration's §0 now CREATES the table;
-- this check is kept for the record.


-- ── 0.3 PRE-FLIGHT · current notifications_type_check ────────
-- The migration re-creates this CHECK re-listing every existing
-- value. Confirm the live list matches the ten the migration
-- preserves (new_match, new_message, feedback_request,
-- meeting_confirmed, review_received, event_cancelled,
-- event_joined, event_message, event_below_min,
-- marketplace_interest). If the live list has MORE values, add
-- them to §12 of the migration before running it.
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'notifications_type_check';


-- ── 0.4 PRE-FLIGHT · matches constraints ─────────────────────
-- accept_practice_pairing() inserts a post-less matches row with
-- source='practice'. Confirm matches_source_chk still permits it:
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.matches'::regclass
ORDER BY conname;
-- Expected: matches_source_chk =
--   CHECK (post_id IS NOT NULL OR marketplace_post_id IS NOT NULL OR source <> 'post')


-- ── 0.5 PRE-FLIGHT · membership composition (D2 = B1 input) ──
-- The backfill enrolls every access_status='active' profile into
-- the Rotman community, on the founder's one-time attestation.
-- Review who that is BEFORE migrating:
SELECT access_status, count(*) FROM public.profiles GROUP BY 1 ORDER BY 2 DESC;
SELECT p.id, p.email, p.access_status, p.access_type, p.member_type
FROM public.profiles p
WHERE p.access_status = 'active'
ORDER BY p.created_at;
-- Also: who would D1 auto-enrollment cover today (verified
-- rotman.utoronto.ca only)?
SELECT ue.user_id, ue.email
FROM public.user_emails ue
WHERE ue.is_verified = true AND ue.email ILIKE '%@rotman.utoronto.ca';


-- ── 0.6 BASELINE · full table + column inventory ─────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;


-- ── 0.7 BASELINE · every RLS policy ──────────────────────────
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ── 0.8 BASELINE · triggers and functions ────────────────────
SELECT event_object_table AS table_name, trigger_name, action_timing,
       event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;


-- ── 0.9 BASELINE · realtime publication + view grants ────────
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
ORDER BY table_name, grantee;

-- End of baseline dump. Save all output, then proceed to
-- migration-practice-reciprocal.sql (dry run first — see
-- docs/practice-phase1-execution-guide.md).
