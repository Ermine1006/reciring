-- ReciRing / Mutu — Backfill missing profiles
--
-- Some early accounts have an auth.users row but no matching public.profiles
-- row (created before the current sign-in profile-creation logic, or the
-- best-effort insert was swallowed). Anything that FKs to profiles then fails
-- for them: posting (posts_created_by_fk), and the join/comment notification
-- triggers (null actor name). Symptom the user sees:
--   "insert or update on table posts violates foreign key constraint
--    posts_created_by_fk"
--   "null value in column body of relation notifications violates not-null"
--
-- This creates a profile for every auth user missing one, so they can post,
-- join, and be matched. Run in the Supabase SQL Editor (service role bypasses
-- RLS). Safe to run repeatedly — the WHERE only touches users with no profile.
--
-- Values mirror what AuthContext.ensureProfile writes for a grandfathered
-- account: access_type 'legacy', access_status 'active', member_type 'student'
-- (all valid per the profiles CHECK constraints). Name falls back to the email
-- local-part; the user can change it in Profile.
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.profiles (id, email, name, access_type, access_status, member_type)
SELECT
  u.id,
  u.email,
  COALESCE(NULLIF(split_part(u.email, '@', 1), ''), 'Member'),
  'legacy',
  'active',
  'student'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- How many were missing (run separately if you want the count):
-- SELECT count(*) FROM auth.users u
--   LEFT JOIN public.profiles p ON p.id = u.id
--   WHERE p.id IS NULL;
