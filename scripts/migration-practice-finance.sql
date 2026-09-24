-- Founder runs manually in Supabase SQL Editor. Do not run automatically.
-- Prerequisites: meeting-links, starting-experience, teammate-feedback and skill-ratings migrations.
-- Adds Finance without rewriting old sessions, identity, pairing, RLS or token rules.
BEGIN;
-- Fail before making changes if the ratings prerequisite is missing.
DO $$ BEGIN
 IF to_regclass('public.practice_skill_ratings') IS NULL THEN
  RAISE EXCEPTION 'Run migration-practice-skill-ratings.sql first';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.practice_recommendation_skill_category(p_skill text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE
 WHEN p_skill=ANY(ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','leadership']::text[]) THEN 'case'
 WHEN p_skill=ANY(ARRAY['story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence']::text[]) THEN 'behavioural'
 WHEN p_skill=ANY(ARRAY['finance_accounting','finance_valuation','finance_dcf','finance_ma','finance_lbo']::text[]) THEN 'finance'
 WHEN p_skill=ANY(ARRAY['finance_underwriting','finance_origination','finance_debt_metrics']::text[]) THEN 'finance_debt'
 WHEN p_skill=ANY(ARRAY['finance_market_discussion','finance_stock_pitch']::text[]) THEN 'finance_markets'
 WHEN p_skill=ANY(ARRAY['finance_story_selection','finance_situation_and_context','finance_personal_actions','finance_results_and_impact','finance_reflection_and_learning','finance_concision','finance_follow_up_questions','finance_executive_presence']::text[]) THEN 'finance_behavioural'
 END;
$$;
REVOKE ALL ON FUNCTION public.practice_recommendation_skill_category(text) FROM PUBLIC,anon,authenticated;

ALTER TABLE public.practice_requests DROP CONSTRAINT IF EXISTS pr_want_types_canonical;
ALTER TABLE public.practice_requests ADD CONSTRAINT pr_want_types_canonical CHECK
 (want_types <@ ARRAY['case','behavioural','finance','finance_debt','finance_markets','finance_behavioural','technical','product','other']::text[]);
ALTER TABLE public.practice_requests DROP CONSTRAINT IF EXISTS pr_help_types_canonical;
ALTER TABLE public.practice_requests ADD CONSTRAINT pr_help_types_canonical CHECK
 (help_types <@ ARRAY['case','behavioural','finance','finance_debt','finance_markets','finance_behavioural','technical','product','other']::text[]);

ALTER TABLE public.practice_recommendation_preferences DROP CONSTRAINT IF EXISTS practice_rec_skills_known;
ALTER TABLE public.practice_recommendation_preferences ADD CONSTRAINT practice_rec_skills_known CHECK (
 array_position(support_skills,NULL) IS NULL AND array_position(focus_skills,NULL) IS NULL
 AND support_skills <@ ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','leadership','story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence','finance_accounting','finance_valuation','finance_dcf','finance_ma','finance_lbo','finance_underwriting','finance_origination','finance_debt_metrics','finance_market_discussion','finance_stock_pitch','finance_story_selection','finance_situation_and_context','finance_personal_actions','finance_results_and_impact','finance_reflection_and_learning','finance_concision','finance_follow_up_questions','finance_executive_presence']::text[]
 AND focus_skills <@ ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','leadership','story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence','finance_accounting','finance_valuation','finance_dcf','finance_ma','finance_lbo','finance_underwriting','finance_origination','finance_debt_metrics','finance_market_discussion','finance_stock_pitch','finance_story_selection','finance_situation_and_context','finance_personal_actions','finance_results_and_impact','finance_reflection_and_learning','finance_concision','finance_follow_up_questions','finance_executive_presence']::text[]);

ALTER TABLE public.practice_sessions DROP CONSTRAINT IF EXISTS ps_interview_category_valid;
ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_interview_category_valid CHECK
 (interview_category IS NULL OR interview_category IN ('case','behavioural','finance','finance_debt','finance_markets','finance_behavioural'));
ALTER TABLE public.practice_sessions DROP CONSTRAINT IF EXISTS ps_skill_matches_category;
ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_skill_matches_category CHECK (
 skill_focus IS NULL OR ((interview_category='case' AND skill_focus IN ('problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','leadership')) OR (interview_category='behavioural' AND skill_focus IN ('story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence')) OR (interview_category='finance' AND skill_focus IN ('finance_accounting','finance_valuation','finance_dcf','finance_ma','finance_lbo')) OR (interview_category='finance_debt' AND skill_focus IN ('finance_underwriting','finance_origination','finance_debt_metrics')) OR (interview_category='finance_markets' AND skill_focus IN ('finance_market_discussion','finance_stock_pitch')) OR (interview_category='finance_behavioural' AND skill_focus IN ('finance_story_selection','finance_situation_and_context','finance_personal_actions','finance_results_and_impact','finance_reflection_and_learning','finance_concision','finance_follow_up_questions','finance_executive_presence'))));

CREATE OR REPLACE FUNCTION public.practice_prior_practice_valid(value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'object' THEN NOT EXISTS (
    SELECT 1 FROM jsonb_each(value) entry
    WHERE entry.key NOT IN ('case','behavioural','finance','finance_debt','finance_markets','finance_behavioural')
      OR jsonb_typeof(entry.value) <> 'string'
      OR entry.value #>> '{}' NOT IN ('none','1_to_4','5_to_10','11_to_20','over_20')
  ) ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.practice_prior_practice_valid(jsonb) FROM PUBLIC, anon, authenticated;


-- Same proposal RPC as meeting-links, widening only its category allowlist.
CREATE OR REPLACE FUNCTION public.propose_practice_session(
  p_pairing_id       uuid,
  p_scheduled_start  timestamptz,
  p_duration_minutes integer  DEFAULT 60,
  p_timezone         text     DEFAULT 'America/Toronto',
  p_location_type    text     DEFAULT 'virtual',
  p_location_detail  text     DEFAULT '',
  p_session_mode       text   DEFAULT NULL,
  p_interview_category text   DEFAULT NULL,
  p_skill_focus        text   DEFAULT NULL,
  p_meeting_method     text   DEFAULT NULL,
  p_meeting_url        text   DEFAULT NULL,
  p_meeting_location   text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_session public.practice_sessions%ROWTYPE;
  v_other   uuid;
  v_minutes integer := p_duration_minutes;
  v_url     text := nullif(btrim(coalesce(p_meeting_url, '')), '');
  v_loc     text := nullif(btrim(coalesce(p_meeting_location, '')), '');
  v_type    text := p_location_type;
  v_detail  text := p_location_detail;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF auth.uid() NOT IN (v_pairing.requester_user_id, v_pairing.addressee_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_pairing.status <> 'accepted' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF NOT public.practice_is_community_eligible(auth.uid(), v_pairing.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;
  IF p_scheduled_start <= now() THEN RAISE EXCEPTION 'start_in_past'; END IF;

  IF p_session_mode IS NOT NULL THEN
    IF p_session_mode NOT IN ('full_mock_swap','quick_skill_drill') THEN
      RAISE EXCEPTION 'invalid_session_mode';
    END IF;
    IF p_interview_category IS NULL THEN RAISE EXCEPTION 'category_required'; END IF;
    IF p_interview_category NOT IN ('case','behavioural','finance','finance_debt','finance_markets','finance_behavioural') THEN
      RAISE EXCEPTION 'invalid_interview_category';
    END IF;
    IF p_session_mode = 'quick_skill_drill' AND p_skill_focus IS NULL THEN
      RAISE EXCEPTION 'skill_focus_required';
    END IF;
    v_minutes := CASE p_session_mode WHEN 'full_mock_swap' THEN 75 ELSE 30 END;
  ELSIF p_interview_category IS NOT NULL OR p_skill_focus IS NOT NULL THEN
    RAISE EXCEPTION 'session_mode_required';
  END IF;

  -- the meeting, validated here as well as by the CHECK constraints
  IF p_meeting_method IS NOT NULL THEN
    IF p_meeting_method NOT IN ('teams','zoom','in_person','other_video') THEN
      RAISE EXCEPTION 'invalid_meeting_method';
    END IF;
    IF p_meeting_method = 'in_person' THEN
      IF v_url IS NOT NULL THEN RAISE EXCEPTION 'meeting_url_not_allowed'; END IF;
      v_type := 'in_person';
      v_detail := coalesce(v_loc, '');
    ELSE
      IF v_url IS NULL THEN RAISE EXCEPTION 'meeting_url_required'; END IF;
      IF v_url !~ '^https://' THEN RAISE EXCEPTION 'meeting_url_not_https'; END IF;
      -- credentials in the authority are a phishing shape
      IF split_part(split_part(v_url, '://', 2), '/', 1) LIKE '%@%' THEN
        RAISE EXCEPTION 'meeting_url_has_credentials';
      END IF;
      v_loc := NULL;
      v_type := 'virtual';
      -- the legacy column keeps mirroring the link, so a client that
      -- has not been updated still shows the right thing
      v_detail := v_url;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.practice_sessions
           (pairing_id, community_id,
            participant_a_user_id, participant_b_user_id, created_by_user_id,
            scheduled_start, duration_minutes, timezone,
            location_type, location_detail,
            session_mode, interview_category, skill_focus,
            meeting_method, meeting_url, meeting_location)
    VALUES (v_pairing.id, v_pairing.community_id,
            v_pairing.requester_user_id, v_pairing.addressee_user_id, auth.uid(),
            p_scheduled_start, v_minutes, p_timezone,
            v_type, v_detail,
            p_session_mode, p_interview_category, p_skill_focus,
            p_meeting_method, v_url, v_loc)
    RETURNING * INTO v_session;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'session_already_live';
    WHEN check_violation THEN RAISE EXCEPTION 'invalid_session_agreement';
  END;

  v_other := CASE WHEN auth.uid() = v_pairing.requester_user_id
                  THEN v_pairing.addressee_user_id ELSE v_pairing.requester_user_id END;
  -- the notification body never carries the link
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_other, 'practice_session_proposed',
          'Practice time proposed',
          'Your practice partner proposed a session time — confirm or suggest another',
          jsonb_build_object('pairing_id', p_pairing_id, 'session_id', v_session.id,
                             'community_id', v_pairing.community_id));

  RETURN to_jsonb(v_session);
END $$;

REVOKE ALL ON FUNCTION public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text, text, text, text) TO authenticated;


-- Evidence stays in the same private ratings row and inherits its existing RLS.
ALTER TABLE public.practice_skill_ratings
 ADD COLUMN IF NOT EXISTS finance_observations jsonb NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.practice_skill_ratings.finance_observations IS
 'Optional WHAT/WHY/HOW observations for rated finance skills. Private after mutual verification, never a readiness claim.';

CREATE OR REPLACE FUNCTION public.submit_practice_confirmation_with_finance(
 p_session_id uuid,p_outcome text,p_completed_own_round boolean DEFAULT false,
 p_completed_partner_round boolean DEFAULT false,p_no_show_of uuid DEFAULT NULL,
 p_suggestion_code text DEFAULT NULL,p_note text DEFAULT '',p_strength_skills text[] DEFAULT '{}',
 p_skill_ratings jsonb DEFAULT '{}',p_observations jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.practice_sessions%ROWTYPE; item record; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
 IF auth.uid() NOT IN(s.participant_a_user_id,s.participant_b_user_id) THEN RAISE EXCEPTION 'not_participant'; END IF;
 IF s.interview_category IS NULL OR s.interview_category NOT IN('finance','finance_debt','finance_markets') THEN RAISE EXCEPTION 'invalid_finance_category'; END IF;
 IF p_observations IS NULL OR jsonb_typeof(p_observations)<>'object' THEN RAISE EXCEPTION 'invalid_finance_observations'; END IF;
 IF (SELECT count(*) FROM jsonb_each(p_observations))>3 THEN RAISE EXCEPTION 'invalid_finance_observations'; END IF;
 FOR item IN SELECT * FROM jsonb_each(p_observations) LOOP
  IF public.practice_recommendation_skill_category(item.key) IS DISTINCT FROM s.interview_category
   OR NOT coalesce(p_skill_ratings ? item.key,false) OR jsonb_typeof(item.value)<>'array'
  THEN RAISE EXCEPTION 'invalid_finance_observations'; END IF;
  IF jsonb_array_length(item.value) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'invalid_finance_observations'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(item.value) v WHERE v NOT IN('"what"'::jsonb,'"why"'::jsonb,'"how"'::jsonb))
   OR (SELECT count(DISTINCT v) FROM jsonb_array_elements(item.value) v)<>jsonb_array_length(item.value)
  THEN RAISE EXCEPTION 'invalid_finance_observations'; END IF;
 END LOOP;
 -- Authoritative existing path enforces completion, skill scores, immutable confirmations and token uniqueness.
 result:=public.submit_practice_confirmation_with_ratings(p_session_id,p_outcome,p_completed_own_round,p_completed_partner_round,p_no_show_of,p_suggestion_code,p_note,p_strength_skills,p_skill_ratings);
 UPDATE public.practice_skill_ratings SET finance_observations=p_observations
 WHERE session_id=p_session_id AND author_user_id=auth.uid();
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_practice_confirmation_with_finance(uuid,text,boolean,boolean,uuid,text,text,text[],jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_confirmation_with_finance(uuid,text,boolean,boolean,uuid,text,text,text[],jsonb,jsonb) TO authenticated;

-- UI opens Finance only after this transaction has completed successfully.
CREATE OR REPLACE FUNCTION public.practice_finance_supported()
RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.practice_finance_supported() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_finance_supported() TO authenticated;
COMMIT;
-- To pause new Finance setup, redefine practice_finance_supported() to SELECT false.
-- Do not remove taxonomy values or evidence columns after finance records exist.
