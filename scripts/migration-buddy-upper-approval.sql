-- Founder runs manually in Supabase SQL Editor.
-- Apply AFTER migration-buddy-choice.sql, migration-buddy-recommendations.sql,
-- migration-buddy-open-access.sql and migration-buddy-change-year.sql.
-- Upper year Community access becomes application based and admin approved.
-- Existing upper year participants are grandfathered as approved.
BEGIN;

CREATE TABLE IF NOT EXISTS public.buddy_upper_applications (
  program_id uuid NOT NULL REFERENCES public.buddy_programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  help_topics text[] NOT NULL DEFAULT '{}',
  career_focus text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','paused')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  PRIMARY KEY(program_id,user_id),
  CHECK (cardinality(help_topics) BETWEEN 1 AND 3),
  CHECK (cardinality(career_focus) <= 2),
  CHECK (array_position(help_topics,NULL) IS NULL),
  CHECK (array_position(career_focus,NULL) IS NULL)
);
ALTER TABLE public.buddy_upper_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_upper_applications FROM PUBLIC,anon,authenticated;

INSERT INTO public.buddy_upper_applications(program_id,user_id,help_topics,career_focus,status,submitted_at,reviewed_at)
SELECT m.program_id,m.user_id,
  CASE WHEN cardinality(coalesce(c.help_types,'{}'::text[]))>0 THEN c.help_types ELSE ARRAY['Advice']::text[] END,
  coalesce(c.career_focus,'{}'::text[]),
  CASE WHEN m.active THEN 'approved' ELSE 'paused' END,now(),now()
FROM public.buddy_choice_members m
LEFT JOIN public.buddy_upper_cards c ON c.program_id=m.program_id AND c.user_id=m.user_id
WHERE m.role='upper'
ON CONFLICT(program_id,user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.buddy_upper_apply(p_program uuid,p_help text[],p_focus text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing_role text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.buddy_programs WHERE id=p_program AND choice_enabled) THEN RAISE EXCEPTION 'Applications are paused by the program coordinator.'; END IF;
 IF p_help IS NULL OR cardinality(p_help) NOT BETWEEN 1 AND 3 OR p_focus IS NULL OR cardinality(p_focus)>2
 OR EXISTS(SELECT 1 FROM unnest(p_help||p_focus) x WHERE x IS NULL OR length(trim(x))=0 OR length(x)>80)
 THEN RAISE EXCEPTION 'Choose 1 to 3 help topics and up to 2 career focus areas.'; END IF;
 SELECT role INTO existing_role FROM public.buddy_choice_members WHERE program_id=p_program AND user_id=auth.uid();
 IF existing_role='upper' AND EXISTS(SELECT 1 FROM public.buddy_choice_members WHERE program_id=p_program AND user_id=auth.uid() AND active) THEN RAISE EXCEPTION 'Your upper year access is already approved.'; END IF;
 IF existing_role='first' THEN RAISE EXCEPTION 'Your account is currently registered as first year. Ask the program admin to correct your year before applying.'; END IF;
 INSERT INTO public.buddy_upper_applications(program_id,user_id,help_topics,career_focus,status,submitted_at,reviewed_at,reviewed_by)
 VALUES(p_program,auth.uid(),p_help,p_focus,'pending',now(),NULL,NULL)
 ON CONFLICT(program_id,user_id) DO UPDATE SET help_topics=excluded.help_topics,career_focus=excluded.career_focus,status='pending',submitted_at=now(),reviewed_at=NULL,reviewed_by=NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_upper_application_decide(p_program uuid,p_user uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE app public.buddy_upper_applications; existing_role text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF NOT public.buddy_is_coordinator(p_program) THEN RAISE EXCEPTION 'Coordinator access required.'; END IF;
 IF p_action NOT IN ('approve','decline','pause','restore') THEN RAISE EXCEPTION 'Choose approve, decline, pause or restore.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,11));
 SELECT * INTO app FROM public.buddy_upper_applications WHERE program_id=p_program AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application not found.'; END IF;
 SELECT role INTO existing_role FROM public.buddy_choice_members WHERE program_id=p_program AND user_id=p_user;
 IF p_action='approve' THEN
  IF app.status NOT IN ('pending','declined') THEN RAISE EXCEPTION 'This application is not waiting for approval.'; END IF;
  IF existing_role='first' THEN RAISE EXCEPTION 'This student is still registered as first year. Correct their year before approval.'; END IF;
  INSERT INTO public.buddy_choice_members(program_id,user_id,role,active) VALUES(p_program,p_user,'upper',true)
  ON CONFLICT(program_id,user_id) DO UPDATE SET role='upper',active=true;
  UPDATE public.buddy_upper_applications SET status='approved',reviewed_at=now(),reviewed_by=auth.uid() WHERE program_id=p_program AND user_id=p_user;
  INSERT INTO public.buddy_upper_cards(program_id,user_id,help_types,career_focus,discoverable) VALUES(p_program,p_user,app.help_topics,app.career_focus,false)
  ON CONFLICT(program_id,user_id) DO UPDATE SET help_types=excluded.help_types,career_focus=excluded.career_focus;
 ELSIF p_action='decline' THEN
  IF app.status<>'pending' THEN RAISE EXCEPTION 'Only a pending application can be declined.'; END IF;
  UPDATE public.buddy_upper_applications SET status='declined',reviewed_at=now(),reviewed_by=auth.uid() WHERE program_id=p_program AND user_id=p_user;
 ELSIF p_action='pause' THEN
  IF app.status<>'approved' OR existing_role IS DISTINCT FROM 'upper' THEN RAISE EXCEPTION 'Only approved upper year access can be paused.'; END IF;
  UPDATE public.buddy_choice_members SET active=false WHERE program_id=p_program AND user_id=p_user AND role='upper';
  UPDATE public.buddy_upper_applications SET status='paused',reviewed_at=now(),reviewed_by=auth.uid() WHERE program_id=p_program AND user_id=p_user;
  UPDATE public.buddy_choice_invites SET status='withdrawn' WHERE program_id=p_program AND upper_id=p_user AND status IN ('pending','accepted');
 ELSE
  IF app.status<>'paused' OR existing_role IS DISTINCT FROM 'upper' THEN RAISE EXCEPTION 'Only paused upper year access can be restored.'; END IF;
  UPDATE public.buddy_choice_members SET active=true WHERE program_id=p_program AND user_id=p_user AND role='upper';
  UPDATE public.buddy_upper_applications SET status='approved',reviewed_at=now(),reviewed_by=auth.uid() WHERE program_id=p_program AND user_id=p_user;
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_choice_join_upper(p_program uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;
 RAISE EXCEPTION 'Upper year access requires an application and program admin approval.';
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_choice_access(p_program uuid,p_email text,p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid; status_now text;
BEGIN
 IF NOT public.buddy_is_coordinator(p_program) THEN RAISE EXCEPTION 'Coordinator access required.'; END IF;
 SELECT id INTO u FROM auth.users WHERE lower(email)=lower(trim(p_email));
 IF u IS NULL THEN RAISE EXCEPTION 'Application not found.'; END IF;
 SELECT status INTO status_now FROM public.buddy_upper_applications WHERE program_id=p_program AND user_id=u;
 IF status_now IS NULL THEN RAISE EXCEPTION 'This student must apply before upper year access can be granted.'; END IF;
 IF p_active THEN
  IF status_now='paused' THEN PERFORM public.buddy_upper_application_decide(p_program,u,'restore');
  ELSIF status_now<>'approved' THEN RAISE EXCEPTION 'Review the application before granting access.'; END IF;
 ELSE
  IF status_now='approved' THEN PERFORM public.buddy_upper_application_decide(p_program,u,'pause'); END IF;
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_choice_change_year(p_program uuid,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.buddy_choice_members;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('first','upper') THEN RAISE EXCEPTION 'Choose first year or upper year.'; END IF;
 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,11)); PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,12));
 SELECT * INTO existing FROM public.buddy_choice_members WHERE program_id=p_program AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Join the Buddy Program first.'; END IF;
 IF NOT existing.active THEN RAISE EXCEPTION 'Your participation is paused. Contact the coordinator for help.'; END IF;
 IF existing.role=p_role THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.buddy_programs WHERE id=p_program AND choice_enabled) THEN RAISE EXCEPTION 'Year changes are paused by the program coordinator.'; END IF;
 IF p_role='upper' AND NOT EXISTS(SELECT 1 FROM public.buddy_upper_applications WHERE program_id=p_program AND user_id=auth.uid() AND status='approved') THEN RAISE EXCEPTION 'Upper year access requires program admin approval.'; END IF;
 IF EXISTS(SELECT 1 FROM public.buddy_assigned_pairs WHERE program_id=p_program AND ((p_role='first' AND mentor_id=auth.uid()) OR (p_role='upper' AND student_id=auth.uid())) AND status IN ('pending','confirmed')) THEN RAISE EXCEPTION 'You have a school Buddy pairing. Ask your coordinator to correct your year and keep your conversations together.'; END IF;
 IF EXISTS(SELECT 1 FROM public.buddy_choice_invites WHERE program_id=p_program AND auth.uid() IN (upper_id,first_id) AND status IN ('pending','accepted')) THEN RAISE EXCEPTION 'You have a Buddy invitation or connection. Resolve it in Community or ask your coordinator to help correct your year.'; END IF;
 IF EXISTS(SELECT 1 FROM public.buddy_choice_posts WHERE program_id=p_program AND user_id=auth.uid() AND active) THEN RAISE EXCEPTION 'You have a published Buddy post. Remove it in My posts before changing your year.'; END IF;
 UPDATE public.buddy_choice_members SET role=p_role WHERE program_id=p_program AND user_id=auth.uid();
 IF existing.role='upper' AND p_role='first' THEN UPDATE public.buddy_upper_applications SET status='paused',reviewed_at=now(),reviewed_by=auth.uid() WHERE program_id=p_program AND user_id=auth.uid() AND status='approved'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_choice_state(p_program uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.buddy_programs; r text; posts jsonb; invites jsonb; people jsonb; application jsonb; applications jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_program IS NULL THEN RETURN jsonb_build_object('programs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',bp.id,'name',bp.name)) FROM public.buddy_programs bp WHERE public.buddy_choice_member(bp.id,auth.uid()) OR public.buddy_is_coordinator(bp.id)),'[]'::jsonb)); END IF;
 SELECT * INTO p FROM public.buddy_programs WHERE id=p_program;
 IF p.id IS NULL OR (NOT public.buddy_choice_member(p.id,auth.uid()) AND NOT public.buddy_is_coordinator(p.id)) THEN RAISE EXCEPTION 'Program not available.'; END IF;
 PERFORM public.buddy_choice_sweep(p.id);
 SELECT role INTO r FROM public.buddy_choice_members WHERE program_id=p.id AND user_id=auth.uid() AND active;
 SELECT jsonb_build_object('status',a.status,'help_topics',a.help_topics,'career_focus',a.career_focus,'submitted_at',a.submitted_at,'reviewed_at',a.reviewed_at) INTO application FROM public.buddy_upper_applications a WHERE a.program_id=p.id AND a.user_id=auth.uid();
 SELECT coalesce(jsonb_agg(s.payload||jsonb_build_object('id',s.id,'owner',CASE WHEN s.user_id=auth.uid() THEN 'me' ELSE NULL END,'name',CASE WHEN coalesce((s.payload->>'is_anonymous')::boolean,true)=false THEN pr.name ELSE NULL END) ORDER BY s.created_at DESC),'[]'::jsonb) INTO posts
 FROM public.buddy_choice_posts s LEFT JOIN public.profiles pr ON pr.id=s.user_id WHERE s.program_id=p.id AND s.active
 AND (s.user_id=auth.uid() OR (r='upper' AND p.choice_enabled AND public.buddy_choice_allowed(p.id,auth.uid(),s.user_id)
 AND EXISTS(SELECT 1 FROM public.buddy_choice_members m WHERE m.program_id=p.id AND m.user_id=s.user_id AND m.active AND m.role='first')
 AND ((s.payload->>'expiresAt') IS NULL OR (s.payload->>'expiresAt')::timestamptz>now() OR EXISTS(SELECT 1 FROM public.buddy_choice_invites i WHERE i.post_id=s.id AND i.upper_id=auth.uid() AND i.status='accepted'))
 AND (NOT EXISTS(SELECT 1 FROM public.buddy_choice_invites i WHERE i.program_id=p.id AND i.first_id=s.user_id AND i.status='accepted') OR EXISTS(SELECT 1 FROM public.buddy_choice_invites i WHERE i.post_id=s.id AND i.upper_id=auth.uid() AND i.status='accepted'))));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'post_id',i.post_id,'status',i.status,'name',CASE WHEN i.status='accepted' THEN pr.name ELSE NULL END) ORDER BY i.created_at DESC),'[]'::jsonb) INTO invites
 FROM public.buddy_choice_invites i LEFT JOIN public.profiles pr ON pr.id=CASE WHEN i.upper_id=auth.uid() THEN i.first_id ELSE i.upper_id END
 WHERE i.program_id=p.id AND auth.uid() IN (i.first_id,i.upper_id) AND public.buddy_choice_allowed(p.id,i.first_id,i.upper_id)
 AND EXISTS(SELECT 1 FROM public.buddy_choice_members m WHERE m.program_id=p.id AND m.user_id=i.upper_id AND m.role='upper' AND m.active);
 IF public.buddy_is_coordinator(p.id) THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(pr.name,'Student'),'active',m.active)),'[]'::jsonb) INTO people FROM public.buddy_choice_members m LEFT JOIN public.profiles pr ON pr.id=m.user_id WHERE m.program_id=p.id AND m.role='upper';
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',coalesce(pr.name,'Student'),'email',coalesce(u.email,''),'status',a.status,'help_topics',a.help_topics,'career_focus',a.career_focus,'submitted_at',a.submitted_at,'reviewed_at',a.reviewed_at) ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,a.submitted_at DESC),'[]'::jsonb) INTO applications
  FROM public.buddy_upper_applications a LEFT JOIN public.profiles pr ON pr.id=a.user_id LEFT JOIN auth.users u ON u.id=a.user_id WHERE a.program_id=p.id;
 END IF;
 RETURN jsonb_build_object('role',r,'coordinator',public.buddy_is_coordinator(p.id),'enabled',p.choice_enabled,'capacity',least(p.max_mentees,3),'posts',posts,'invitations',invites,'upper_students',coalesce(people,'[]'::jsonb),'upper_application',application,'upper_applications',coalesce(applications,'[]'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.buddy_upper_apply(uuid,text[],text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.buddy_upper_application_decide(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.buddy_choice_join_upper(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.buddy_choice_access(uuid,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.buddy_choice_change_year(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.buddy_choice_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buddy_upper_apply(uuid,text[],text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_upper_application_decide(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_join_upper(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_access(uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_change_year(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_state(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
