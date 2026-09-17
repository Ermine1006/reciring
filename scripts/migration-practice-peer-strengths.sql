-- Founder runs manually after migration-practice-feedback.sql and
-- migration-practice-recommendations.sql. No production backfill.
BEGIN;
CREATE TABLE IF NOT EXISTS public.practice_peer_strengths (
  session_id uuid NOT NULL REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  skills text[] NOT NULL CHECK(cardinality(skills) BETWEEN 1 AND 3),
  PRIMARY KEY(session_id,author_user_id),
  CHECK(author_user_id <> recipient_user_id)
);
ALTER TABLE public.practice_peer_strengths ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_peer_strengths FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.practice_peer_strengths TO authenticated;
DROP POLICY IF EXISTS peer_strengths_read ON public.practice_peer_strengths;
CREATE POLICY peer_strengths_read ON public.practice_peer_strengths FOR SELECT TO authenticated
  USING(auth.uid() IN (author_user_id,recipient_user_id));
ALTER TABLE public.practice_recommendation_preferences ADD COLUMN IF NOT EXISTS share_peer_strengths boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.practice_peer_strengths_sharing(p_community_id uuid,p_share boolean DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.practice_is_community_eligible(auth.uid(),p_community_id) THEN RAISE EXCEPTION 'not_eligible'; END IF;
  IF p_share IS NOT NULL THEN
    INSERT INTO public.practice_recommendation_preferences(user_id,community_id,share_peer_strengths)
    VALUES(auth.uid(),p_community_id,p_share)
    ON CONFLICT(user_id,community_id) DO UPDATE SET share_peer_strengths=EXCLUDED.share_peer_strengths;
  END IF;
  RETURN coalesce((SELECT share_peer_strengths FROM public.practice_recommendation_preferences WHERE user_id=auth.uid() AND community_id=p_community_id),false);
END $$;

-- Wrap the authoritative confirmation RPC. Any failure rolls back both writes,
-- including verification and token minting in the existing function.
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
  IF p_strength_skills IS NULL OR cardinality(p_strength_skills)>3 OR array_position(p_strength_skills,NULL) IS NOT NULL
    OR cardinality(p_strength_skills)<>(SELECT count(DISTINCT k) FROM unnest(p_strength_skills) k)
    OR EXISTS(SELECT 1 FROM unnest(p_strength_skills) k WHERE public.practice_recommendation_skill_category(k) IS NULL
      OR (s.interview_category IS NOT NULL AND public.practice_recommendation_skill_category(k)<>s.interview_category))
    THEN RAISE EXCEPTION 'invalid_strength_skills'; END IF;
  IF cardinality(p_strength_skills)>0 AND (p_outcome IS DISTINCT FROM 'completed' OR p_completed_own_round IS DISTINCT FROM true OR p_completed_partner_round IS DISTINCT FROM true) THEN RAISE EXCEPTION 'strengths_require_completed_rounds'; END IF;
  result := public.submit_practice_confirmation(p_session_id,p_outcome,p_completed_own_round,p_completed_partner_round,p_no_show_of,p_suggestion_code,p_note);
  IF cardinality(p_strength_skills)>0 THEN
    INSERT INTO public.practice_peer_strengths(session_id,author_user_id,recipient_user_id,community_id,skills)
    VALUES(s.id,auth.uid(),other_user,s.community_id,p_strength_skills);
  END IF;
  RETURN result;
END $$;

-- Internal aggregate only. Each distinct partner counts once per skill.
-- Disputed/unverified sessions and reported feedback never contribute.
CREATE OR REPLACE FUNCTION public.practice_peer_strength_evidence(p_user_id uuid,p_community_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('skill',skill,'partners',partners) ORDER BY partners DESC,skill),'[]'::jsonb)
 FROM (SELECT k AS skill,count(DISTINCT e.author_user_id)::integer AS partners
 FROM public.practice_peer_strengths e JOIN public.practice_sessions s ON s.id=e.session_id
 CROSS JOIN LATERAL unnest(e.skills) k
 WHERE e.recipient_user_id=p_user_id AND e.community_id=p_community_id AND s.community_id=p_community_id AND s.status='verified'
 AND EXISTS(SELECT 1 FROM public.practice_recommendation_preferences p WHERE p.user_id=p_user_id AND p.community_id=p_community_id AND p.share_peer_strengths)
 AND NOT EXISTS(SELECT 1 FROM public.practice_session_feedback f WHERE f.session_id=e.session_id AND f.author_user_id=e.author_user_id AND f.reported_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=e.author_user_id AND b.blocked_user_id=p_user_id) OR (b.blocker_id=p_user_id AND b.blocked_user_id=e.author_user_id))
 GROUP BY k) evidence;
$$;
REVOKE ALL ON FUNCTION public.practice_peer_strength_evidence(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.practice_peer_strengths_sharing(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_practice_confirmation_with_strengths(uuid,text,boolean,boolean,uuid,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_peer_strengths_sharing(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_practice_confirmation_with_strengths(uuid,text,boolean,boolean,uuid,text,text,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.browse_practice_recommendations(p_community_id uuid)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT ARRAY(SELECT k FROM unnest(coalesce(p.focus_skills,'{}'::text[])) k
        WHERE public.practice_recommendation_skill_category(k)=ANY(own.want_types)) AS focus,
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
      ARRAY(SELECT e->>'skill' FROM jsonb_array_elements(peer.evidence) e WHERE e->>'skill'=ANY(me.focus)) AS peer_relevant
    FROM public.browse_practice_requests(p_community_id) b
    JOIN public.practice_requests r ON r.id=b.request_id AND r.community_id=p_community_id
    LEFT JOIN public.practice_recommendation_preferences pref ON pref.user_id=r.user_id AND pref.community_id=p_community_id
    CROSS JOIN LATERAL (SELECT coalesce(jsonb_agg(e),'[]'::jsonb) AS evidence FROM jsonb_array_elements(public.practice_peer_strength_evidence(r.user_id,p_community_id)) e WHERE public.practice_recommendation_skill_category(e->>'skill')=ANY(r.help_types)) peer
    CROSS JOIN me WHERE b.mutual_fit IS TRUE
  ) SELECT card || jsonb_build_object('recommendation',jsonb_build_object(
      'peer_strengths',peer_strengths,'peer_relevant_skills',peer_relevant,'support_skills',support,'relevant_skills',relevant,'response_record',responses,
      'similar_response',responses IS NOT NULL AND my_responses IS NOT NULL AND
        abs((responses->>'prompt')::numeric/(responses->>'total')::numeric-
            (my_responses->>'prompt')::numeric/(my_responses->>'total')::numeric)<=0.2))
    FROM candidates
    -- Fit first. Similar response habits are a tie breaker only. Unknown records are neutral.
    ORDER BY cardinality(peer_relevant) DESC, cardinality(relevant) DESC,
      CASE WHEN responses IS NOT NULL AND my_responses IS NOT NULL THEN
        abs((responses->>'prompt')::numeric/(responses->>'total')::numeric-
            (my_responses->>'prompt')::numeric/(my_responses->>'total')::numeric)
        ELSE 0.2 END ASC, request_id;
$$;

COMMIT;
