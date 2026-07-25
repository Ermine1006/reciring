-- ReciRing / Mutu — Find "ghost" profiles (authenticated but denied access)
--
-- WHY THESE EXIST
-- The on_auth_user_created trigger auto-inserts a profiles row the instant
-- ANYONE authenticates with Supabase — BEFORE the app's invite/referral gate
-- runs. When the gate then denies them (Gmail/other email with no code), the
-- app signs them out but the auto-created profiles row stays behind.
--
-- HOW TO TELL THEM APART
-- A real, admitted user went through ensureProfile(), which stamps
-- access_type ('institutional_email' | 'referral_code' | 'invite_code' | ...).
-- A denied ghost never reached that code, so its access_type is NULL and its
-- name is still the trigger's placeholder 'Anonymous'.
-- ─────────────────────────────────────────────────────────────

-- 1. LIST every ghost profile — anyone who got a row but never cleared the gate.
--    Cross-referenced with auth.users so you can see when they tried and
--    whether they ever confirmed an email.
SELECT
  p.id,
  p.email,
  p.name,
  p.access_type,          -- NULL  == never admitted
  p.access_status,        -- NULL  == never admitted
  p.member_type,
  p.is_anonymous,
  u.created_at            AS authenticated_at,
  u.last_sign_in_at,
  u.email_confirmed_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.access_type IS NULL     -- the definitive "denied / never admitted" marker
ORDER BY u.created_at DESC;

-- 2. COUNT them, so you know the scale before doing anything.
SELECT count(*) AS ghost_profiles
FROM public.profiles
WHERE access_type IS NULL;

-- 3. (Optional) The mirror view: your REAL, admitted members.
SELECT p.email, p.name, p.access_type, p.member_type, u.created_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.access_type IS NOT NULL
ORDER BY u.created_at DESC;
