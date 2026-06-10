-- ============================================================
-- ReciRing: Program options update
-- Run this in the Supabase SQL Editor.
--
-- The program list expanded from {MBA, MFin, MBAN, MMgt, MMA, PhD, Other}
-- to {FT-MBA, PT-MBA, MMA, MFin, EMBA, GEMBA, PhD, Other}.
--
-- 'MBA' is now ambiguous — map existing rows to 'FT-MBA' (the most common
-- legacy value at Rotman) so users don't see an unselected program chip
-- when they next open My Profile.
--
-- MBAN and MMgt no longer appear in the chip list — but we DO NOT touch
-- those rows. They'll display in the My Profile editor as "no chip
-- selected" until the user picks a new program. This preserves the
-- record of what they originally entered and lets them re-classify
-- themselves rather than guessing.
--
-- Idempotent. Safe to re-run.
-- ============================================================

UPDATE public.profiles
SET program = 'FT-MBA'
WHERE program = 'MBA';

-- Sanity check after running:
--   SELECT program, count(*) FROM public.profiles
--   GROUP BY program ORDER BY count DESC;
