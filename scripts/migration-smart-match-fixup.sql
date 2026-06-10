-- ============================================================
-- ReciRing: Smart Match — Slice 2 schema fixup
-- Run this AFTER migration-smart-match.sql.
--
-- Drops the `interests` column added in Slice 1. Decision:
-- reuse the existing `industry_interests` column instead of
-- maintaining two parallel interest fields. The Edge Function
-- (and any future Smart Match UI) reads from industry_interests.
--
-- Idempotent. Safe to run multiple times.
-- ============================================================

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS interests;
