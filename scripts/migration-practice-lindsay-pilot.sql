-- Founder runs manually in Supabase SQL Editor. Do not execute against production automatically.
-- Lindsay pilot polish: Mental math plus separate case candidate and interviewer experience.
-- Apply AFTER migration-practice-finance.sql and migration-practice-starting-experience.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.practice_recommendation_skill_category(p_skill text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE
  WHEN p_skill=ANY(ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','mental_math','exhibit_interpretation','synthesis','final_recommendation','communication','leadership']::text[]) THEN 'case'
  WHEN p_skill=ANY(ARRAY['story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence']::text[]) THEN 'behavioural'
  WHEN p_skill=ANY(ARRAY['finance_accounting','finance_valuation','finance_dcf','finance_ma','finance_lbo']::text[]) THEN 'finance'
  WHEN p_skill=ANY(ARRAY['finance_underwriting','finance_origination','finance_debt_metrics']::text[]) THEN 'finance_debt'
  WHEN p_skill=ANY(ARRAY['finance_market_discussion','finance_stock_pitch']::text[]) THEN 'finance_markets'
  WHEN p_skill=ANY(ARRAY['finance_story_selection','finance_situation_and_context','finance_personal_actions','finance_results_and_impact','finance_reflection_and_learning','finance_concision','finance_follow_up_questions','finance_executive_presence']::text[]) THEN 'finance_behavioural'
 END
$$;
REVOKE ALL ON FUNCTION public.practice_recommendation_skill_category(text) FROM PUBLIC,anon,authenticated;

ALTER TABLE public.practice_recommendation_preferences DROP CONSTRAINT IF EXISTS practice_rec_skills_known;
ALTER TABLE public.practice_recommendation_preferences ADD CONSTRAINT practice_rec_skills_known CHECK (
 array_position(support_skills,NULL) IS NULL AND array_position(focus_skills,NULL) IS NULL
 AND support_skills <@ ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','mental_math','exhibit_interpretation','synthesis','final_recommendation','communication','leadership','story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence','finance_accounting','finance_valuation','finance_dcf','finance_ma','finance_lbo','finance_underwriting','finance_origination','finance_debt_metrics','finance_market_discussion','finance_stock_pitch','finance_story_selection','finance_situation_and_context','finance_personal_actions','finance_results_and_impact','finance_reflection_and_learning','finance_concision','finance_follow_up_questions','finance_executive_presence']::text[]
 AND focus_skills <@ ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','mental_math','exhibit_interpretation','synthesis','final_recommendation','communication','leadership','story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence','finance_accounting','finance_valuation','finance_dcf','finance_ma','finance_lbo','finance_underwriting','finance_origination','finance_debt_metrics','finance_market_discussion','finance_stock_pitch','finance_story_selection','finance_situation_and_context','finance_personal_actions','finance_results_and_impact','finance_reflection_and_learning','finance_concision','finance_follow_up_questions','finance_executive_presence']::text[]);

ALTER TABLE public.practice_sessions DROP CONSTRAINT IF EXISTS ps_skill_matches_category;
ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_skill_matches_category CHECK (
 skill_focus IS NULL OR ((interview_category='case' AND skill_focus IN ('problem_clarification','hypothesis_development','structuring','quantitative_reasoning','mental_math','exhibit_interpretation','synthesis','final_recommendation','communication','leadership')) OR (interview_category='behavioural' AND skill_focus IN ('story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence')) OR (interview_category='finance' AND skill_focus IN ('finance_accounting','finance_valuation','finance_dcf','finance_ma','finance_lbo')) OR (interview_category='finance_debt' AND skill_focus IN ('finance_underwriting','finance_origination','finance_debt_metrics')) OR (interview_category='finance_markets' AND skill_focus IN ('finance_market_discussion','finance_stock_pitch')) OR (interview_category='finance_behavioural' AND skill_focus IN ('finance_story_selection','finance_situation_and_context','finance_personal_actions','finance_results_and_impact','finance_reflection_and_learning','finance_concision','finance_follow_up_questions','finance_executive_presence'))));

CREATE OR REPLACE FUNCTION public.practice_prior_practice_valid(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'object' THEN NOT EXISTS (
    SELECT 1 FROM jsonb_each(value) entry
    WHERE entry.key NOT IN ('case','case_done','case_led','behavioural','finance','finance_debt','finance_markets','finance_behavioural')
      OR jsonb_typeof(entry.value) <> 'string'
      OR entry.value #>> '{}' NOT IN ('none','1_to_4','5_to_10','11_to_20','over_20')
  ) ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.practice_prior_practice_valid(jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.practice_recommendation_preferences.prior_practice IS
  'Private self reported practice before Mutu. Case may store candidate and interviewer counts separately. Never verified history or a public skill rating.';

COMMIT;
