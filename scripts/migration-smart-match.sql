-- ============================================================
-- ReciRing: Smart Match Nudge — Slice 1 (schema only)
-- Run this in the Supabase SQL Editor. Idempotent.
--
-- This migration ONLY adds storage for the Smart Match feature.
-- No triggers, no Edge Functions, no UI wiring yet — those come
-- in Slice 2+.
-- ============================================================

-- ── 1. Profile enrichment fields ────────────────────────────
-- `interests` is intentionally distinct from the existing
-- `industry_interests` column (added in migration-onboarding.sql).
--   - industry_interests = "industries I'd consider working in"
--     (drives existing match ranking — DO NOT consolidate yet)
--   - interests          = "topics/themes I care about" used by
--     the new Smart Match scorer + AI reason generator.
-- If product later decides these are the same concept, we can
-- merge them in a follow-up migration.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goal          text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS working_style text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS timeline      text   NOT NULL DEFAULT '';


-- ── 2. match_nudges table ───────────────────────────────────
-- One row per (viewer, candidate) pair. The scorer upserts on
-- this composite key, so re-running suggestions for the same
-- viewer updates existing rows rather than appending duplicates.
--
-- status transitions (enforced at app layer for now):
--   pending    -> interested      (viewer clicks "see if it's mutual")
--   pending    -> skipped         (viewer dismisses the card)
--   interested -> matched         (when peer also reaches 'interested';
--                                  Slice 4 will set this via a trigger
--                                  + create the materialized matches row)
--
-- Slice 4 will likely add a partial unique index or trigger to
-- coordinate the mutual-interest handshake. Out of scope here.

CREATE TABLE IF NOT EXISTS public.match_nudges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score         integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  reason        text    NOT NULL DEFAULT '',
  status        text    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'interested', 'skipped', 'matched')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One nudge row per (viewer, candidate) — upsert target
  UNIQUE (user_id, candidate_id),

  -- Defensive: no self-suggestions
  CONSTRAINT match_nudges_no_self CHECK (user_id <> candidate_id)
);

-- Fast lookup: "show me my pending nudges, newest first"
CREATE INDEX IF NOT EXISTS idx_match_nudges_user_status_created
  ON public.match_nudges (user_id, status, created_at DESC);

-- Inverse lookup for the mutual-interest check in Slice 4:
-- "is there a row where candidate_id = X AND user_id = me AND status = 'interested'?"
CREATE INDEX IF NOT EXISTS idx_match_nudges_candidate_status
  ON public.match_nudges (candidate_id, status);

-- Keep updated_at fresh on every row change
CREATE OR REPLACE FUNCTION public.touch_match_nudges_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_nudges_touch ON public.match_nudges;
CREATE TRIGGER trg_match_nudges_touch
  BEFORE UPDATE ON public.match_nudges
  FOR EACH ROW EXECUTE FUNCTION public.touch_match_nudges_updated_at();


-- ── 3. RLS ──────────────────────────────────────────────────
-- Per spec:
--   - Users can only READ their own match_nudges rows
--     (candidate_id rows belong to the other person — never visible here)
--   - Users can only UPDATE status on their own rows
--   - INSERT is reserved for the Edge Function (service-role bypasses RLS)
--     so we deliberately do NOT add an INSERT policy for `authenticated`.

ALTER TABLE public.match_nudges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own nudges"   ON public.match_nudges;
CREATE POLICY "Users read own nudges"
  ON public.match_nudges FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own nudges" ON public.match_nudges;
CREATE POLICY "Users update own nudges"
  ON public.match_nudges FOR UPDATE
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No DELETE policy: the Edge Function (service-role) handles cleanup
-- of stale suggestions when re-scoring. Cascade-delete via the FK on
-- profiles still works regardless of RLS.


-- ── 4. Sanity check ─────────────────────────────────────────
-- After running, verify columns + table exist:
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles'
--     AND column_name IN ('interests','goal','working_style','timeline');
--   -- expect 4 rows
--
--   SELECT count(*) FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='match_nudges';
--   -- expect 1
