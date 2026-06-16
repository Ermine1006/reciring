-- ============================================================
-- ReciRing: Email subscription opt-out flag
--
-- Default TRUE — new users are subscribed. Marketing emails
-- (broadcasts, weekly digest) check this flag and skip sends
-- for unsubscribed users. Transactional emails (welcome,
-- account/security) are sent regardless.
--
-- Idempotent. Safe to re-run.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_subscribed boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_email_subscribed
  ON public.profiles (email_subscribed)
  WHERE email_subscribed = true;
