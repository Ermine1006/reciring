-- ============================================================
-- ReciRing: Add 'unmatched' status to matches table
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Drop the existing CHECK constraint and re-create with 'unmatched'
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('active', 'completed', 'cancelled', 'unmatched'));

-- 2. Index for fast Discover filtering (find posts with active matches)
CREATE INDEX IF NOT EXISTS idx_matches_post_status
  ON public.matches (post_id, status)
  WHERE status = 'active';
