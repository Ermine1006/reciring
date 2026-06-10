-- ============================================================
-- ReciRing: Onboarding v2 — Hinge-style profile schema
--
-- Drops the Slice 2.5 fields (goal/working_style/timeline) that
-- are superseded by the more concrete v2 fields below, then adds
-- the new columns powering the 3-step wizard and the upgraded
-- Edge Function scorer.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. Drop Slice 2.5 columns ───────────────────────────────
-- These were collected but never read by anything outside the
-- match-suggestions Edge Function. The new fields replace them.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS goal,
  DROP COLUMN IF EXISTS working_style,
  DROP COLUMN IF EXISTS timeline;


-- ── 2. Add v2 columns ───────────────────────────────────────
-- All NOT NULL with sensible defaults so existing rows don't
-- break and the client/edge code can read without null checks.

-- NOTE: do NOT use `current_role` — it's a PostgreSQL reserved keyword
-- (returns the current database role). Using `headline` instead.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS headline          text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS career_stage      text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS skills_to_learn   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS networking_intent text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prompt_ask_me     text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_weekend    text   NOT NULL DEFAULT '';


-- ── 3. Sanity check ─────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles'
--     AND column_name IN (
--       'headline','career_stage','skills_to_learn',
--       'networking_intent','prompt_ask_me','prompt_weekend'
--     );
--   -- expect 6 rows
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles'
--     AND column_name IN ('goal','working_style','timeline');
--   -- expect 0 rows
