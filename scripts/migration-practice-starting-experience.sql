-- Founder runs manually in Supabase SQL Editor. Do not execute against production automatically.
-- Apply AFTER migration-practice-recommendations.sql and existing peer/history migrations.
-- Additive. No backfill. Does not redefine browse, ranking, invitations or token rules.
BEGIN;

CREATE OR REPLACE FUNCTION public.practice_prior_practice_valid(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'object' THEN NOT EXISTS (
    SELECT 1 FROM jsonb_each(value) entry
    WHERE entry.key NOT IN ('case','behavioural')
      OR jsonb_typeof(entry.value) <> 'string'
      OR entry.value #>> '{}' NOT IN ('none','1_to_4','5_to_10','11_to_20','over_20')
  ) ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.practice_prior_practice_valid(jsonb) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.practice_recommendation_preferences
  ADD COLUMN IF NOT EXISTS prior_practice jsonb NOT NULL DEFAULT '{}';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.practice_recommendation_preferences'::regclass
      AND conname = 'practice_prior_practice_valid') THEN
    ALTER TABLE public.practice_recommendation_preferences ADD CONSTRAINT practice_prior_practice_valid
      CHECK (public.practice_prior_practice_valid(prior_practice));
  END IF;
END $$;
COMMENT ON COLUMN public.practice_recommendation_preferences.prior_practice IS
  'Private self reported practice before Mutu, by category. Never verified history or a public skill rating.';

CREATE OR REPLACE FUNCTION public.practice_personal_preferences_get(p_community_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  -- Existing getter enforces auth.uid() and current community eligibility.
  result := public.practice_recommendation_preferences_get(p_community_id);
  RETURN result || jsonb_build_object('prior_practice_supported', true, 'prior_practice', coalesce(
    (SELECT p.prior_practice FROM public.practice_recommendation_preferences p
      WHERE p.user_id = auth.uid() AND p.community_id = p_community_id), '{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.practice_personal_preferences_save(
  p_community_id uuid, p_support_skills text[], p_focus_skills text[],
  p_share_response boolean, p_prior_practice jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Same eligibility, skill constraints and consent. Both writes commit together.
  PERFORM public.practice_recommendation_preferences_save(
    p_community_id, p_support_skills, p_focus_skills, p_share_response);
  IF p_prior_practice IS NULL OR NOT public.practice_prior_practice_valid(p_prior_practice) THEN
    RAISE EXCEPTION 'invalid_prior_practice';
  END IF;
  UPDATE public.practice_recommendation_preferences SET prior_practice = p_prior_practice
    WHERE user_id = auth.uid() AND community_id = p_community_id;
END $$;

REVOKE ALL ON FUNCTION public.practice_personal_preferences_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.practice_personal_preferences_save(uuid,text[],text[],boolean,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_personal_preferences_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.practice_personal_preferences_save(uuid,text[],text[],boolean,jsonb) TO authenticated;
COMMIT;

-- Client rollback: deploy previous UI. Legacy preference RPCs still work and
-- preserve starting experience. Keep the column to avoid losing authored data.
