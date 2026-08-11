-- ============================================================
-- Mutu / ReciRing: one-time backfill — Profile V3 columns → legacy v2
--
-- Context (Phase 1.2): the app now runs on the LEGACY (v2) profile and
-- every matching engine reads the v2 columns. A handful of accounts
-- onboarded earlier via Profile V3, which wrote only the v3 column
-- family — so their v2 columns are empty and they are invisible to
-- matching. This copies their v3 data into the v2 columns the engines
-- read, so they show up again.
--
-- SAFE / IDEMPOTENT:
--   • Only fills a v2 column that is currently EMPTY (never overwrites
--     a legacy user's existing v2 data).
--   • Only pulls from a v3 column that is NON-empty.
--   • Re-runnable — a second run changes nothing.
--
-- Run once in the Supabase SQL Editor.
-- ============================================================

UPDATE public.profiles p SET
  -- "help I can give":  expertise_offered → can_help_with
  can_help_with = CASE
    WHEN COALESCE(cardinality(p.can_help_with), 0) = 0
     AND COALESCE(cardinality(p.expertise_offered), 0) > 0
    THEN p.expertise_offered ELSE p.can_help_with END,

  -- "help I want":  help_wanted → skills_to_learn
  skills_to_learn = CASE
    WHEN COALESCE(cardinality(p.skills_to_learn), 0) = 0
     AND COALESCE(cardinality(p.help_wanted), 0) > 0
    THEN p.help_wanted ELSE p.skills_to_learn END,

  -- industries:  industries_known + industries_exploring → industry_interests (deduped)
  industry_interests = CASE
    WHEN COALESCE(cardinality(p.industry_interests), 0) = 0
     AND COALESCE(cardinality(p.industries_known), 0)
       + COALESCE(cardinality(p.industries_exploring), 0) > 0
    THEN (
      SELECT array_agg(DISTINCT x)
      FROM unnest(COALESCE(p.industries_known, '{}') || COALESCE(p.industries_exploring, '{}')) AS x
      WHERE x IS NOT NULL AND x <> ''
    )
    ELSE p.industry_interests END,

  -- one-line role:  professional_headline (else title) → headline
  headline = CASE
    WHEN COALESCE(NULLIF(btrim(p.headline), ''), NULL) IS NULL
     AND COALESCE(NULLIF(btrim(p.professional_headline), ''), NULLIF(btrim(p.title), '')) IS NOT NULL
    THEN COALESCE(NULLIF(btrim(p.professional_headline), ''), NULLIF(btrim(p.title), ''))
    ELSE p.headline END,

  -- interests (free-text prompts Smart Match tokenizes):
  --   personal_interests → prompt_ask_me,  activity_preferences → prompt_weekend
  prompt_ask_me = CASE
    WHEN COALESCE(NULLIF(btrim(p.prompt_ask_me), ''), NULL) IS NULL
     AND COALESCE(cardinality(p.personal_interests), 0) > 0
    THEN array_to_string(p.personal_interests, ', ')
    ELSE p.prompt_ask_me END,

  prompt_weekend = CASE
    WHEN COALESCE(NULLIF(btrim(p.prompt_weekend), ''), NULL) IS NULL
     AND COALESCE(cardinality(p.activity_preferences), 0) > 0
    THEN array_to_string(p.activity_preferences, ', ')
    ELSE p.prompt_weekend END

WHERE
  COALESCE(cardinality(p.expertise_offered), 0)    > 0
  OR COALESCE(cardinality(p.help_wanted), 0)        > 0
  OR COALESCE(cardinality(p.industries_known), 0)   > 0
  OR COALESCE(cardinality(p.industries_exploring), 0) > 0
  OR COALESCE(cardinality(p.personal_interests), 0) > 0
  OR COALESCE(cardinality(p.activity_preferences), 0) > 0
  OR NULLIF(btrim(p.professional_headline), '') IS NOT NULL
  OR NULLIF(btrim(p.title), '') IS NOT NULL;

-- Note: career_stage and networking_intent have no V3 source (the V3
-- quick-start didn't collect them) — they stay empty; those Smart Match
-- buckets simply don't score for these users until they edit their profile.


-- ── Verify (see who got backfilled) ──────────────────────────
--   SELECT id, can_help_with, skills_to_learn, industry_interests, headline
--   FROM public.profiles
--   WHERE COALESCE(cardinality(expertise_offered),0) > 0
--      OR COALESCE(cardinality(help_wanted),0) > 0;
