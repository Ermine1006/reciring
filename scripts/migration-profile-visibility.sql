-- ============================================================
-- ReciRing: Profile visibility setting
--
-- Adds a user-level toggle that controls how their identity surfaces
-- across the app. Defaults to 'private' so existing users keep their
-- current anonymous-by-default behavior — they opt-in to 'public'.
--
-- 'public'  — Discover cards show first name + program + role +
--             industry + avatar.
-- 'private' — Discover cards show a descriptive label
--             (program · industry) and the anonymous avatar.
--
-- Matching and chat surfaces are NOT affected by this flag in the
-- current slice; they continue to use the existing identity-reveal
-- mechanism. Per-post overrides could be added later as a column on
-- posts; for now visibility is per-user.
--
-- Idempotent. Safe to re-run.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_visibility_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_visibility_check
    CHECK (visibility IN ('public', 'private'));
