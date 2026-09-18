-- Founder runs manually AFTER migration-practice-teammate-feedback.sql.
-- Counts stay hidden until each member explicitly opts in. No profile identities exposed.
BEGIN;
ALTER TABLE public.practice_recommendation_preferences ADD COLUMN IF NOT EXISTS share_practice_history boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.practice_history_sharing(p_community_id uuid,p_share boolean DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.practice_is_community_eligible(auth.uid(),p_community_id) THEN RAISE EXCEPTION 'not_eligible'; END IF;
  IF p_share IS NOT NULL THEN
    INSERT INTO public.practice_recommendation_preferences(user_id,community_id,share_practice_history) VALUES(auth.uid(),p_community_id,p_share)
    ON CONFLICT(user_id,community_id) DO UPDATE SET share_practice_history=EXCLUDED.share_practice_history;
  END IF;
  RETURN coalesce((SELECT share_practice_history FROM public.practice_recommendation_preferences WHERE user_id=auth.uid() AND community_id=p_community_id),false);
END $$;
REVOKE ALL ON FUNCTION public.practice_history_sharing(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_history_sharing(uuid,boolean) TO authenticated;
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
      CASE WHEN pref.share_practice_history THEN (SELECT jsonb_build_object('sessions',count(*),'partners',count(DISTINCT CASE WHEN s.participant_a_user_id=r.user_id THEN s.participant_b_user_id ELSE s.participant_a_user_id END)) FROM public.practice_sessions s WHERE s.community_id=p_community_id AND s.status='verified' AND r.user_id IN(s.participant_a_user_id,s.participant_b_user_id)) END AS practice_history,
      ARRAY(SELECT e->>'skill' FROM jsonb_array_elements(peer.evidence) e WHERE e->>'skill' IN ('responsive','reliable','well_prepared','helpful_feedback') AND EXISTS(SELECT 1 FROM jsonb_array_elements(me.own_evidence) mine WHERE mine->>'skill'=e->>'skill')) AS shared_traits,
      ARRAY(SELECT e->>'skill' FROM jsonb_array_elements(peer.evidence) e WHERE e->>'skill'=ANY(me.focus)) AS peer_relevant
    FROM public.browse_practice_requests(p_community_id) b
    JOIN public.practice_requests r ON r.id=b.request_id AND r.community_id=p_community_id
    LEFT JOIN public.practice_recommendation_preferences pref ON pref.user_id=r.user_id AND pref.community_id=p_community_id
    CROSS JOIN LATERAL (SELECT coalesce(jsonb_agg(e),'[]'::jsonb) AS evidence FROM jsonb_array_elements(public.practice_peer_strength_evidence(r.user_id,p_community_id)) e WHERE public.practice_recommendation_skill_category(e->>'skill')=ANY(r.help_types) OR e->>'skill' IN ('responsive','reliable','well_prepared','helpful_feedback')) peer
    CROSS JOIN me WHERE b.mutual_fit IS TRUE
  ) SELECT card || jsonb_build_object('recommendation',jsonb_build_object(
      'practice_history',practice_history,'shared_teammate_traits',shared_traits,'peer_strengths',peer_strengths,'peer_relevant_skills',peer_relevant,'support_skills',support,'relevant_skills',relevant,'response_record',responses,
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
