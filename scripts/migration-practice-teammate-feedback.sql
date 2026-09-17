-- Founder runs manually AFTER migration-practice-peer-strengths.sql.
-- Adds optional teammate recognition. Existing opt-in applies to all peer recognition.
BEGIN;
ALTER TABLE public.practice_peer_strengths DROP CONSTRAINT IF EXISTS practice_peer_strengths_skills_check;
ALTER TABLE public.practice_peer_strengths ADD CONSTRAINT practice_peer_strengths_skills_check CHECK(cardinality(skills) BETWEEN 1 AND 7);
CREATE OR REPLACE FUNCTION public.practice_teammate_feedback_supported()
RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.practice_teammate_feedback_supported() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_teammate_feedback_supported() TO authenticated;
CREATE OR REPLACE FUNCTION public.submit_practice_confirmation_with_strengths(
  p_session_id uuid,p_outcome text,p_completed_own_round boolean DEFAULT false,
  p_completed_partner_round boolean DEFAULT false,p_no_show_of uuid DEFAULT NULL,
  p_suggestion_code text DEFAULT NULL,p_note text DEFAULT '',p_strength_skills text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.practice_sessions%ROWTYPE; result jsonb; other_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN(s.participant_a_user_id,s.participant_b_user_id) THEN RAISE EXCEPTION 'not_participant'; END IF;
  other_user := CASE WHEN auth.uid()=s.participant_a_user_id THEN s.participant_b_user_id ELSE s.participant_a_user_id END;
  IF EXISTS(SELECT 1 FROM public.blocks WHERE (blocker_id=auth.uid() AND blocked_user_id=other_user) OR (blocker_id=other_user AND blocked_user_id=auth.uid())) THEN RAISE EXCEPTION 'not_participant'; END IF;
  IF p_strength_skills IS NULL OR cardinality(p_strength_skills)>7
    OR (SELECT count(*) FROM unnest(p_strength_skills) k WHERE k NOT IN ('responsive','reliable','well_prepared','helpful_feedback'))>3 OR array_position(p_strength_skills,NULL) IS NOT NULL
    OR cardinality(p_strength_skills)<>(SELECT count(DISTINCT k) FROM unnest(p_strength_skills) k)
    OR EXISTS(SELECT 1 FROM unnest(p_strength_skills) k WHERE k NOT IN ('responsive','reliable','well_prepared','helpful_feedback') AND (public.practice_recommendation_skill_category(k) IS NULL
      OR (s.interview_category IS NOT NULL AND public.practice_recommendation_skill_category(k)<>s.interview_category)))
    THEN RAISE EXCEPTION 'invalid_strength_skills'; END IF;
  IF cardinality(p_strength_skills)>0 AND (p_outcome IS DISTINCT FROM 'completed' OR p_completed_own_round IS DISTINCT FROM true OR p_completed_partner_round IS DISTINCT FROM true) THEN RAISE EXCEPTION 'strengths_require_completed_rounds'; END IF;
  result := public.submit_practice_confirmation(p_session_id,p_outcome,p_completed_own_round,p_completed_partner_round,p_no_show_of,p_suggestion_code,p_note);
  IF cardinality(p_strength_skills)>0 THEN
    INSERT INTO public.practice_peer_strengths(session_id,author_user_id,recipient_user_id,community_id,skills)
    VALUES(s.id,auth.uid(),other_user,s.community_id,p_strength_skills);
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.browse_practice_recommendations(p_community_id uuid)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT ARRAY(SELECT k FROM unnest(coalesce(p.focus_skills,'{}'::text[])) k
        WHERE public.practice_recommendation_skill_category(k)=ANY(own.want_types)) AS focus,
      public.practice_peer_strength_evidence(auth.uid(),p_community_id) AS own_evidence,
      CASE WHEN p.share_response THEN public.practice_response_evidence(auth.uid(),p_community_id) END AS responses
    FROM (SELECT 1) seed LEFT JOIN public.practice_recommendation_preferences p
      ON p.user_id=auth.uid() AND p.community_id=p_community_id
    LEFT JOIN public.practice_requests own ON own.user_id=auth.uid() AND own.community_id=p_community_id AND own.status='active'
  ), candidates AS (
    SELECT to_jsonb(b) AS card, b.request_id,
      ARRAY(SELECT k FROM unnest(coalesce(pref.support_skills,'{}'::text[])) k WHERE public.practice_recommendation_skill_category(k)=ANY(r.help_types)) AS support,
      ARRAY(SELECT DISTINCT k FROM unnest(coalesce(pref.support_skills,'{}'::text[])) k WHERE k=ANY(me.focus) AND public.practice_recommendation_skill_category(k)=ANY(r.help_types) ORDER BY k) AS relevant,
      CASE WHEN pref.share_response THEN public.practice_response_evidence(r.user_id,p_community_id) END AS responses,
      me.responses AS my_responses,
      peer.evidence AS peer_strengths,
      ARRAY(SELECT e->>'skill' FROM jsonb_array_elements(peer.evidence) e WHERE e->>'skill' IN ('responsive','reliable','well_prepared','helpful_feedback') AND EXISTS(SELECT 1 FROM jsonb_array_elements(me.own_evidence) mine WHERE mine->>'skill'=e->>'skill')) AS shared_traits,
      ARRAY(SELECT e->>'skill' FROM jsonb_array_elements(peer.evidence) e WHERE e->>'skill'=ANY(me.focus)) AS peer_relevant
    FROM public.browse_practice_requests(p_community_id) b
    JOIN public.practice_requests r ON r.id=b.request_id AND r.community_id=p_community_id
    LEFT JOIN public.practice_recommendation_preferences pref ON pref.user_id=r.user_id AND pref.community_id=p_community_id
    CROSS JOIN LATERAL (SELECT coalesce(jsonb_agg(e),'[]'::jsonb) AS evidence FROM jsonb_array_elements(public.practice_peer_strength_evidence(r.user_id,p_community_id)) e WHERE public.practice_recommendation_skill_category(e->>'skill')=ANY(r.help_types) OR e->>'skill' IN ('responsive','reliable','well_prepared','helpful_feedback')) peer
    CROSS JOIN me WHERE b.mutual_fit IS TRUE
  ) SELECT card || jsonb_build_object('recommendation',jsonb_build_object(
      'shared_teammate_traits',shared_traits,'peer_strengths',peer_strengths,'peer_relevant_skills',peer_relevant,'support_skills',support,'relevant_skills',relevant,'response_record',responses,
      'similar_response',responses IS NOT NULL AND my_responses IS NOT NULL AND
        abs((responses->>'prompt')::numeric/(responses->>'total')::numeric-
            (my_responses->>'prompt')::numeric/(my_responses->>'total')::numeric)<=0.2))
    FROM candidates
    -- Fit first. Similar response habits are a tie breaker only. Unknown records are neutral.
    ORDER BY cardinality(peer_relevant) DESC, cardinality(relevant) DESC,
      CASE WHEN responses IS NOT NULL AND my_responses IS NOT NULL THEN
        abs((responses->>'prompt')::numeric/(responses->>'total')::numeric-
            (my_responses->>'prompt')::numeric/(my_responses->>'total')::numeric)
        ELSE 0.2 END ASC, cardinality(shared_traits) DESC, request_id;
$$;

COMMIT;
