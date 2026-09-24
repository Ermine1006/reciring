-- Founder runs manually after migration-practice-teammate-feedback.sql.
-- Private per-session ratings. No public score, ranking, token or historical backfill.
BEGIN;
CREATE OR REPLACE FUNCTION public.practice_recommendation_skill_category(p_skill text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN p_skill=ANY(ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','leadership']::text[]) THEN 'case'
 WHEN p_skill=ANY(ARRAY['story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence']::text[]) THEN 'behavioural' END;
$$;
REVOKE ALL ON FUNCTION public.practice_recommendation_skill_category(text) FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.practice_skill_ratings (
 session_id uuid NOT NULL REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
 author_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 ratings jsonb NOT NULL CHECK(jsonb_typeof(ratings)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,author_user_id),
 CHECK(author_user_id<>recipient_user_id)
);
ALTER TABLE public.practice_skill_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_skill_ratings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.practice_skill_ratings TO authenticated;
DROP POLICY IF EXISTS private_skill_ratings_read ON public.practice_skill_ratings;
CREATE POLICY private_skill_ratings_read ON public.practice_skill_ratings FOR SELECT TO authenticated USING (
 auth.uid() IN(author_user_id,recipient_user_id)
 AND EXISTS(SELECT 1 FROM public.practice_sessions s WHERE s.id=session_id AND s.status='verified')
 AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE
   (b.blocker_id=author_user_id AND b.blocked_user_id=recipient_user_id) OR
   (b.blocker_id=recipient_user_id AND b.blocked_user_id=author_user_id))
);
CREATE OR REPLACE FUNCTION public.submit_practice_confirmation_with_ratings(
 p_session_id uuid,p_outcome text,p_completed_own_round boolean DEFAULT false,
 p_completed_partner_round boolean DEFAULT false,p_no_show_of uuid DEFAULT NULL,
 p_suggestion_code text DEFAULT NULL,p_note text DEFAULT '',p_strength_skills text[] DEFAULT '{}',
 p_skill_ratings jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.practice_sessions%ROWTYPE; other_user uuid; result jsonb; item record;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
 IF auth.uid() NOT IN(s.participant_a_user_id,s.participant_b_user_id) THEN RAISE EXCEPTION 'not_participant'; END IF;
 other_user:=CASE WHEN auth.uid()=s.participant_a_user_id THEN s.participant_b_user_id ELSE s.participant_a_user_id END;
 IF p_skill_ratings IS NULL OR jsonb_typeof(p_skill_ratings)<>'object' THEN RAISE EXCEPTION 'invalid_skill_ratings'; END IF;
 IF (SELECT count(*) FROM jsonb_each(p_skill_ratings)) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'invalid_skill_ratings'; END IF;
 IF p_outcome IS DISTINCT FROM 'completed' OR p_completed_own_round IS DISTINCT FROM true OR p_completed_partner_round IS DISTINCT FROM true THEN RAISE EXCEPTION 'ratings_require_completed_rounds'; END IF;
 FOR item IN SELECT * FROM jsonb_each(p_skill_ratings) LOOP
   IF s.interview_category IS NULL OR public.practice_recommendation_skill_category(item.key) IS DISTINCT FROM s.interview_category
      OR jsonb_typeof(item.value)<>'number' THEN RAISE EXCEPTION 'invalid_skill_ratings'; END IF;
   IF (item.value::text)::numeric NOT IN(1,2,3,4,5) THEN RAISE EXCEPTION 'invalid_skill_ratings'; END IF;
 END LOOP;
 -- Existing RPC enforces blocks, completion rules, immutable confirmation and token uniqueness.
 -- An insert failure rolls back the entire call, including confirmation and token changes.
 result:=public.submit_practice_confirmation_with_strengths(p_session_id,p_outcome,p_completed_own_round,p_completed_partner_round,p_no_show_of,p_suggestion_code,p_note,p_strength_skills);
 INSERT INTO public.practice_skill_ratings(session_id,author_user_id,recipient_user_id,ratings)
 VALUES(s.id,auth.uid(),other_user,p_skill_ratings);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_practice_confirmation_with_ratings(uuid,text,boolean,boolean,uuid,text,text,text[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_confirmation_with_ratings(uuid,text,boolean,boolean,uuid,text,text,text[],jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.practice_skill_ratings_supported()
RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.practice_skill_ratings_supported() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_skill_ratings_supported() TO authenticated;
-- Extend both persisted taxonomies before exposing Leadership in preferences.
ALTER TABLE public.practice_recommendation_preferences DROP CONSTRAINT IF EXISTS practice_rec_skills_known;
ALTER TABLE public.practice_recommendation_preferences ADD CONSTRAINT practice_rec_skills_known CHECK (
    array_position(support_skills, NULL) IS NULL AND array_position(focus_skills, NULL) IS NULL AND
    support_skills <@ ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','leadership','story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence']::text[] AND focus_skills <@ ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','leadership','story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence']::text[]);
ALTER TABLE public.practice_sessions DROP CONSTRAINT IF EXISTS ps_skill_matches_category;
ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_skill_matches_category
      CHECK (
        skill_focus IS NULL
        OR (interview_category = 'case' AND skill_focus IN (
              'problem_clarification','hypothesis_development','structuring',
              'quantitative_reasoning','exhibit_interpretation','synthesis',
              'final_recommendation','communication','leadership'))
        OR (interview_category = 'behavioural' AND skill_focus IN (
              'story_selection','situation_and_context','personal_actions',
              'results_and_impact','reflection_and_learning','concision',
              'follow_up_questions','executive_presence'))
      );

COMMIT;
