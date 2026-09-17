-- Founder runs manually in Supabase SQL Editor. No production data backfill.
-- Requires the existing practice reciprocal and browse/cooldown migrations.
-- Additive and rerunnable. Existing browse, identity, block and invitation rules remain authoritative.
BEGIN;
CREATE TABLE IF NOT EXISTS public.practice_recommendation_preferences (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  support_skills text[] NOT NULL DEFAULT '{}',
  focus_skills text[] NOT NULL DEFAULT '{}',
  share_response boolean NOT NULL DEFAULT false,
  PRIMARY KEY(user_id, community_id),
  CONSTRAINT practice_rec_skill_limits CHECK (cardinality(support_skills) <= 3 AND cardinality(focus_skills) <= 3),
  CONSTRAINT practice_rec_skills_known CHECK (
    array_position(support_skills, NULL) IS NULL AND array_position(focus_skills, NULL) IS NULL AND
    support_skills <@ ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence']::text[] AND focus_skills <@ ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication','story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence']::text[])
);
ALTER TABLE public.practice_recommendation_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_recommendation_preferences FROM PUBLIC, anon, authenticated;
-- No direct table access: even public skills are returned only through eligible anonymous browse rows.

CREATE OR REPLACE FUNCTION public.practice_recommendation_preferences_get(p_community_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.practice_is_community_eligible(auth.uid(), p_community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;
  RETURN coalesce((SELECT jsonb_build_object('support_skills', p.support_skills, 'focus_skills', p.focus_skills, 'share_response', p.share_response)
    FROM public.practice_recommendation_preferences p WHERE p.user_id = auth.uid() AND p.community_id = p_community_id),
    '{"support_skills":[],"focus_skills":[],"share_response":false}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.practice_recommendation_preferences_save(
  p_community_id uuid, p_support_skills text[], p_focus_skills text[], p_share_response boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.practice_is_community_eligible(auth.uid(), p_community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;
  INSERT INTO public.practice_recommendation_preferences(user_id,community_id,support_skills,focus_skills,share_response)
  VALUES(auth.uid(),p_community_id,p_support_skills,p_focus_skills,p_share_response)
  ON CONFLICT(user_id,community_id) DO UPDATE SET support_skills=EXCLUDED.support_skills,
    focus_skills=EXCLUDED.focus_skills, share_response=EXCLUDED.share_response;
END $$;

-- Internal evidence helper. Never callable by a client with arbitrary member IDs.
-- Use the latest invitation per sender in this community, last 90 days.
-- Only matured 48h windows count, so an unanswered new invitation cannot hurt the record.
-- Withdrawn invitations are excluded; accepting OR declining counts as answering.
CREATE OR REPLACE FUNCTION public.practice_response_evidence(p_user_id uuid,p_community_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH invitations AS (
    SELECT DISTINCT ON (p.requester_user_id) p.* FROM public.practice_pairings p
    WHERE p.addressee_user_id=p_user_id AND p.community_id=p_community_id
      AND p.invited_at >= now()-interval '90 days' AND p.invited_at <= now()-interval '48 hours'
      AND p.status <> 'withdrawn'
    ORDER BY p.requester_user_id,p.invited_at DESC,p.id
  ) SELECT CASE WHEN count(*) >= 3 THEN jsonb_build_object('total',count(*),
      'prompt',count(*) FILTER (WHERE coalesce(accepted_at,declined_at) BETWEEN invited_at AND invited_at+interval '48 hours'))
      ELSE NULL END FROM invitations;
$$;
REVOKE ALL ON FUNCTION public.practice_response_evidence(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Category lookup mirrors src/data/practiceModes.js. Old preferences cannot claim support
-- for a category removed from the member's current practice request.
CREATE OR REPLACE FUNCTION public.practice_recommendation_skill_category(p_skill text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_skill=ANY(ARRAY['problem_clarification','hypothesis_development','structuring','quantitative_reasoning','exhibit_interpretation','synthesis','final_recommendation','communication']::text[]) THEN 'case'
              WHEN p_skill=ANY(ARRAY['story_selection','situation_and_context','personal_actions','results_and_impact','reflection_and_learning','concision','follow_up_questions','executive_presence']::text[]) THEN 'behavioural' END;
$$;
REVOKE ALL ON FUNCTION public.practice_recommendation_skill_category(text) FROM PUBLIC,anon,authenticated;

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
      me.responses AS my_responses
    FROM public.browse_practice_requests(p_community_id) b
    JOIN public.practice_requests r ON r.id=b.request_id AND r.community_id=p_community_id
    LEFT JOIN public.practice_recommendation_preferences pref ON pref.user_id=r.user_id AND pref.community_id=p_community_id
    CROSS JOIN me WHERE b.mutual_fit IS TRUE
  ) SELECT card || jsonb_build_object('recommendation',jsonb_build_object(
      'support_skills',support,'relevant_skills',relevant,'response_record',responses,
      'similar_response',responses IS NOT NULL AND my_responses IS NOT NULL AND
        abs((responses->>'prompt')::numeric/(responses->>'total')::numeric-
            (my_responses->>'prompt')::numeric/(my_responses->>'total')::numeric)<=0.2))
    FROM candidates
    -- Fit first. Similar response habits are a tie breaker only. Unknown records are neutral.
    ORDER BY cardinality(relevant) DESC,
      CASE WHEN responses IS NOT NULL AND my_responses IS NOT NULL THEN
        abs((responses->>'prompt')::numeric/(responses->>'total')::numeric-
            (my_responses->>'prompt')::numeric/(my_responses->>'total')::numeric)
        ELSE 0.2 END ASC, request_id;
$$;
REVOKE ALL ON FUNCTION public.practice_recommendation_preferences_get(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.practice_recommendation_preferences_save(uuid,text[],text[],boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.browse_practice_recommendations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_recommendation_preferences_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.practice_recommendation_preferences_save(uuid,text[],text[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.browse_practice_recommendations(uuid) TO authenticated;
COMMIT;
-- Rollback: drop browse_practice_recommendations(uuid). Client falls back to existing browse.
-- No session, feedback, pairing, token or production profile records are changed.
