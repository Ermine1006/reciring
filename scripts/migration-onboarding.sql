-- ============================================================
-- ReciRing: Add onboarding profile columns
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- New columns for onboarding data
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS program            text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS industry_interests text[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_help_with      text[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_done    boolean NOT NULL DEFAULT false;
