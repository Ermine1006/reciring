-- Founder runs after migration-buddy-choice.sql. No profiles are opted in automatically.
BEGIN;
CREATE TABLE IF NOT EXISTS public.buddy_upper_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.buddy_programs(id),
 user_id uuid NOT NULL REFERENCES auth.users(id), help_types text[] NOT NULL DEFAULT '{}',
 career_focus text[] NOT NULL DEFAULT '{}', discoverable boolean NOT NULL DEFAULT false,
 UNIQUE(program_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.buddy_recommendation_actions (
 post_id uuid NOT NULL REFERENCES public.buddy_choice_posts(id), card_id uuid NOT NULL REFERENCES public.buddy_upper_cards(id),
 status text NOT NULL CHECK(status IN ('interested','skipped')), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(post_id,card_id)
);
ALTER TABLE public.buddy_upper_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_recommendation_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_upper_cards,public.buddy_recommendation_actions FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.buddy_upper_card_save(p_program uuid,p_help text[],p_focus text[],p_discoverable boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT buddy_choice_member(p_program,auth.uid()) OR NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=p_program AND user_id=auth.uid() AND role='upper' AND active) THEN RAISE EXCEPTION 'Approved upper-year access required.'; END IF;
 IF p_help IS NULL OR p_focus IS NULL OR cardinality(p_help)>3 OR cardinality(p_focus)>2 OR EXISTS(SELECT 1 FROM unnest(p_help||p_focus) x WHERE x IS NULL OR length(x)>80 OR length(trim(x))=0) OR (p_discoverable AND cardinality(p_help)=0) THEN RAISE EXCEPTION 'Choose up to 3 help types and 2 career focus areas.'; END IF;
 INSERT INTO buddy_upper_cards(program_id,user_id,help_types,career_focus,discoverable) VALUES(p_program,auth.uid(),p_help,p_focus,coalesce(p_discoverable,false))
 ON CONFLICT(program_id,user_id) DO UPDATE SET help_types=excluded.help_types,career_focus=excluded.career_focus,discoverable=excluded.discoverable;
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_recommendations(p_program uuid,p_post uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE role_name text; s buddy_choice_posts; result jsonb; mine jsonb; incoming jsonb;
BEGIN
 IF NOT buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Program not available.'; END IF;
 SELECT role INTO role_name FROM buddy_choice_members WHERE program_id=p_program AND user_id=auth.uid() AND active;
 IF role_name='upper' THEN
  SELECT jsonb_build_object('help_types',help_types,'career_focus',career_focus,'discoverable',discoverable) INTO mine FROM buddy_upper_cards WHERE program_id=p_program AND user_id=auth.uid();
  SELECT coalesce(jsonb_agg(incoming_post.id),'[]'::jsonb) INTO incoming FROM buddy_recommendation_actions a JOIN buddy_upper_cards c ON c.id=a.card_id JOIN buddy_choice_posts incoming_post ON incoming_post.id=a.post_id
  WHERE c.program_id=p_program AND c.user_id=auth.uid() AND c.discoverable AND a.status='interested' AND incoming_post.active AND incoming_post.program_id=p_program
  AND buddy_choice_allowed(p_program,auth.uid(),incoming_post.user_id) AND ((incoming_post.payload->>'expiresAt') IS NULL OR (incoming_post.payload->>'expiresAt')::timestamptz>now())
  AND NOT EXISTS(SELECT 1 FROM buddy_choice_invites i WHERE i.program_id=p_program AND i.first_id=incoming_post.user_id AND i.status='accepted');
  RETURN jsonb_build_object('profile',mine,'incoming_post_ids',incoming,'items','[]'::jsonb);
 END IF;
 IF role_name IS DISTINCT FROM 'first' THEN RAISE EXCEPTION 'Join Buddy Program first.'; END IF;
 SELECT * INTO s FROM buddy_choice_posts WHERE id=p_post AND program_id=p_program AND user_id=auth.uid() AND active;
 IF s.id IS NULL THEN RETURN jsonb_build_object('items','[]'::jsonb); END IF;
 IF NOT EXISTS(SELECT 1 FROM buddy_programs WHERE id=p_program AND choice_enabled) OR (s.payload->>'expiresAt')::timestamptz<=now() OR EXISTS(SELECT 1 FROM buddy_choice_invites WHERE program_id=p_program AND first_id=auth.uid() AND status='accepted') THEN RETURN jsonb_build_object('items','[]'::jsonb); END IF;
 PERFORM buddy_choice_sweep(p_program);
 SELECT coalesce(jsonb_agg(q.item ORDER BY q.relevance DESC,q.card_id),'[]'::jsonb) INTO result FROM (
 SELECT c.id AS card_id,cardinality(h.common_help)*2+cardinality(f.common_focus) AS relevance,
 jsonb_build_object('id',c.id,'help_types',c.help_types,'career_focus',c.career_focus,'common_help',h.common_help,'common_focus',f.common_focus,'status',a.status) AS item
 FROM buddy_upper_cards c JOIN buddy_choice_members m ON m.program_id=c.program_id AND m.user_id=c.user_id AND m.role='upper' AND m.active
 JOIN buddy_programs bp ON bp.id=c.program_id
 LEFT JOIN buddy_recommendation_actions a ON a.card_id=c.id AND a.post_id=s.id
 CROSS JOIN LATERAL (SELECT ARRAY(SELECT x FROM unnest(c.help_types) x WHERE s.payload->'helpType' ? x) AS common_help) h
 CROSS JOIN LATERAL (SELECT ARRAY(SELECT x FROM unnest(c.career_focus) x WHERE s.payload->'industry' ? x) AS common_focus) f
 WHERE c.program_id=p_program AND c.discoverable AND c.user_id<>auth.uid() AND buddy_choice_allowed(p_program,auth.uid(),c.user_id)
 AND a.status IS DISTINCT FROM 'skipped'
 AND cardinality(h.common_help)+cardinality(f.common_focus)>0
 AND (SELECT count(*) FROM buddy_choice_invites i WHERE i.program_id=p_program AND i.upper_id=c.user_id AND i.status IN ('pending','accepted'))<least(bp.max_mentees,3)
 AND NOT EXISTS(SELECT 1 FROM buddy_choice_invites i WHERE i.program_id=p_program AND i.upper_id=c.user_id AND i.first_id=auth.uid() AND i.status IN ('pending','accepted','declined'))
 ORDER BY relevance DESC,c.id LIMIT 3
 ) q;
 RETURN jsonb_build_object('items',result);
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_recommendation_act(p_post uuid,p_card uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s buddy_choice_posts; c buddy_upper_cards; options jsonb;
BEGIN
 IF p_status NOT IN ('interested','skipped') OR p_status IS NULL THEN RAISE EXCEPTION 'Choose Interested or Skip.'; END IF;
 SELECT * INTO s FROM buddy_choice_posts WHERE id=p_post AND user_id=auth.uid() AND active;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Post not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));
 options:=buddy_recommendations(s.program_id,s.id);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options->'items') x WHERE x->>'id'=p_card::text) THEN RAISE EXCEPTION 'This recommendation is no longer available. Please refresh.'; END IF;
 INSERT INTO buddy_recommendation_actions(post_id,card_id,status) VALUES(p_post,p_card,p_status) ON CONFLICT(post_id,card_id) DO UPDATE SET status=excluded.status,updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.buddy_upper_card_save(uuid,text[],text[],boolean),public.buddy_recommendations(uuid,uuid),public.buddy_recommendation_act(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_upper_card_save(uuid,text[],text[],boolean),public.buddy_recommendations(uuid,uuid),public.buddy_recommendation_act(uuid,uuid,text) TO authenticated;
COMMIT;
