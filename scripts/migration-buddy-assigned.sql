-- Founder runs manually after migration-buddy-choice.sql and migration-buddy-open-access.sql.
-- Additive, rerunnable. No demo data, emails, notifications or existing-post changes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.buddy_assigned_pairs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 program_id uuid NOT NULL REFERENCES public.buddy_programs(id),
 mentor_id uuid NOT NULL REFERENCES auth.users(id),
 student_email text NOT NULL, student_label text NOT NULL DEFAULT '',
 student_id uuid REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','declined')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(program_id,mentor_id,student_email), CHECK(student_id IS DISTINCT FROM mentor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS buddy_assigned_one_mentor ON public.buddy_assigned_pairs(program_id,student_id) WHERE status='confirmed';
CREATE TABLE IF NOT EXISTS public.buddy_assigned_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pair_id uuid NOT NULL REFERENCES public.buddy_assigned_pairs(id),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 1000),
 resolved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.buddy_assigned_replies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.buddy_assigned_requests(id),
 author_id uuid NOT NULL REFERENCES auth.users(id),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.buddy_assigned_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_assigned_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_assigned_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_assigned_pairs,public.buddy_assigned_requests,public.buddy_assigned_replies FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.buddy_assigned_access(p_pair uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM buddy_assigned_pairs p
 WHERE p.id=p_pair AND p.status='confirmed' AND auth.uid() IN(p.mentor_id,p.student_id)
 AND buddy_choice_allowed(p.program_id,p.mentor_id,p.student_id)
 AND EXISTS(SELECT 1 FROM buddy_choice_members m WHERE m.program_id=p.program_id AND m.user_id=p.mentor_id AND m.role='upper' AND m.active)
 AND EXISTS(SELECT 1 FROM buddy_choice_members m WHERE m.program_id=p.program_id AND m.user_id=p.student_id AND m.role='first' AND m.active));
$$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_add(p_program uuid,p_students jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; email_address text; own_email text;
BEGIN
 IF NOT buddy_choice_member(p_program,auth.uid()) OR NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=p_program AND user_id=auth.uid() AND role='upper' AND active) THEN RAISE EXCEPTION 'Join as an upper year student first.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM buddy_programs WHERE id=p_program AND choice_enabled) THEN RAISE EXCEPTION 'The program is paused.'; END IF;
 IF jsonb_typeof(p_students) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Add your students first.'; END IF;
 IF jsonb_array_length(p_students) NOT BETWEEN 1 AND 10 OR length(p_students::text)>6000 THEN RAISE EXCEPTION 'Add up to ten school emails at a time.'; END IF;
 SELECT lower(email) INTO own_email FROM auth.users WHERE id=auth.uid();
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,12));
 FOR item IN SELECT * FROM jsonb_array_elements(p_students) LOOP
  email_address:=lower(trim(item->>'email'));
  IF email_address IS NULL OR length(email_address)>254 OR email_address !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' OR email_address=own_email OR length(coalesce(item->>'name',''))>100 THEN RAISE EXCEPTION 'Check each student name and email.'; END IF;
  -- Do not expose whether an email has an account. Its verified owner claims it on sign-in.
  INSERT INTO buddy_assigned_pairs(program_id,mentor_id,student_email,student_label)
  VALUES(p_program,auth.uid(),email_address,trim(coalesce(item->>'name','')))
  ON CONFLICT(program_id,mentor_id,student_email) DO NOTHING;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_state(p_program uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; verified_email text;
BEGIN
 IF NOT buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;
 SELECT lower(email) INTO verified_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 UPDATE buddy_assigned_pairs SET student_id=auth.uid()
 WHERE program_id=p_program AND student_email=verified_email AND student_id IS NULL AND mentor_id<>auth.uid();
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'status',p.status,
  'name',CASE WHEN p.mentor_id=auth.uid() THEN CASE WHEN p.status='confirmed' THEN coalesce(nullif(pr.name,''),nullif(p.student_label,''),p.student_email) ELSE coalesce(nullif(p.student_label,''),p.student_email) END ELSE coalesce(nullif(pr.name,''),'Your Buddy') END,
  'email',CASE WHEN p.mentor_id=auth.uid() THEN p.student_email ELSE NULL END,
  'requests',CASE WHEN buddy_assigned_access(p.id) THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',r.id,'body',r.body,'resolved',r.resolved,'created_at',r.created_at,
   'replied',EXISTS(SELECT 1 FROM buddy_assigned_replies a WHERE a.request_id=r.id AND a.author_id=p.mentor_id),
   'replies',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'body',a.body,'mine',a.author_id=auth.uid(),'name',coalesce(ap.name,'Buddy'),'created_at',a.created_at) ORDER BY a.created_at,a.id) FROM buddy_assigned_replies a LEFT JOIN profiles ap ON ap.id=a.author_id WHERE a.request_id=r.id),'[]'::jsonb)
  ) ORDER BY r.created_at DESC,r.id) FROM buddy_assigned_requests r WHERE r.pair_id=p.id),'[]'::jsonb) ELSE '[]'::jsonb END
 ) ORDER BY p.created_at,p.id),'[]'::jsonb) INTO result
 FROM buddy_assigned_pairs p LEFT JOIN profiles pr ON pr.id=CASE WHEN p.mentor_id=auth.uid() THEN p.student_id ELSE p.mentor_id END
 WHERE p.program_id=p_program AND auth.uid() IN(p.mentor_id,p.student_id)
 AND EXISTS(SELECT 1 FROM buddy_choice_members m WHERE m.program_id=p.program_id AND m.user_id=p.mentor_id AND m.role='upper' AND m.active)
 AND EXISTS(SELECT 1 FROM buddy_choice_members m WHERE m.program_id=p.program_id AND m.user_id=auth.uid() AND m.active)
 AND (p.student_id IS NULL OR buddy_choice_allowed(p.program_id,p.mentor_id,p.student_id));
 RETURN jsonb_build_object('pairs',result);
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_confirm(p_pair uuid,p_accept boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p buddy_assigned_pairs;
BEGIN
 SELECT * INTO p FROM buddy_assigned_pairs WHERE id=p_pair FOR UPDATE;
 IF p.id IS NULL OR auth.uid() IS NULL OR p.student_id IS DISTINCT FROM auth.uid() OR p.status<>'pending' OR p_accept IS NULL THEN RAISE EXCEPTION 'Pairing is not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p.program_id::text,12));
 IF NOT buddy_choice_allowed(p.program_id,p.mentor_id,p.student_id)
 OR NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=p.program_id AND user_id=p.student_id AND role='first' AND active)
 OR NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=p.program_id AND user_id=p.mentor_id AND role='upper' AND active) THEN RAISE EXCEPTION 'Pairing is not available.'; END IF;
 IF p_accept AND EXISTS(SELECT 1 FROM buddy_assigned_pairs WHERE program_id=p.program_id AND student_id=p.student_id AND status='confirmed') THEN RAISE EXCEPTION 'You already have a school Buddy. Ask your coordinator to correct the pairing.'; END IF;
 UPDATE buddy_assigned_pairs SET status=CASE WHEN p_accept THEN 'confirmed' ELSE 'declined' END WHERE id=p.id;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_ask(p_pair uuid,p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
 PERFORM 1 FROM buddy_assigned_pairs WHERE id=p_pair FOR UPDATE;
 IF NOT buddy_assigned_access(p_pair) OR NOT EXISTS(SELECT 1 FROM buddy_assigned_pairs WHERE id=p_pair AND student_id=auth.uid()) THEN RAISE EXCEPTION 'Only the assigned student can ask here.'; END IF;
 IF p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Write a question of up to 1000 characters.'; END IF;
 INSERT INTO buddy_assigned_requests(pair_id,body) VALUES(p_pair,trim(p_body)) RETURNING id INTO result;
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_reply(p_request uuid,p_body text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r buddy_assigned_requests;
BEGIN
 SELECT * INTO r FROM buddy_assigned_requests WHERE id=p_request FOR UPDATE;
 IF r.id IS NULL OR NOT buddy_assigned_access(r.pair_id) THEN RAISE EXCEPTION 'Conversation is not available.'; END IF;
 IF r.resolved THEN RAISE EXCEPTION 'Reopen this request before replying.'; END IF;
 IF p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Write a reply of up to 2000 characters.'; END IF;
 INSERT INTO buddy_assigned_replies(request_id,author_id,body) VALUES(r.id,auth.uid(),trim(p_body));
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_resolve(p_request uuid,p_resolved boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r buddy_assigned_requests;
BEGIN
 SELECT * INTO r FROM buddy_assigned_requests WHERE id=p_request FOR UPDATE;
 IF r.id IS NULL OR NOT buddy_assigned_access(r.pair_id) OR NOT EXISTS(SELECT 1 FROM buddy_assigned_pairs WHERE id=r.pair_id AND student_id=auth.uid()) THEN RAISE EXCEPTION 'Only the student can mark this resolved.'; END IF;
 IF p_resolved IS NULL THEN RAISE EXCEPTION 'Choose a request status.'; END IF;
 UPDATE buddy_assigned_requests SET resolved=p_resolved WHERE id=r.id;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_summary(p_program uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT buddy_is_coordinator(p_program) THEN RAISE EXCEPTION 'Coordinator access required.'; END IF;
 RETURN jsonb_build_object(
 'assigned',(SELECT count(*) FROM buddy_assigned_pairs WHERE program_id=p_program AND status='confirmed'),
 'pending',(SELECT count(*) FROM buddy_assigned_pairs WHERE program_id=p_program AND status='pending'),
 'requests',(SELECT count(*) FROM buddy_assigned_requests r JOIN buddy_assigned_pairs p ON p.id=r.pair_id WHERE p.program_id=p_program),
 'answered',(SELECT count(*) FROM buddy_assigned_requests r JOIN buddy_assigned_pairs p ON p.id=r.pair_id WHERE p.program_id=p_program AND EXISTS(SELECT 1 FROM buddy_assigned_replies a WHERE a.request_id=r.id AND a.author_id=p.mentor_id)),
 'resolved',(SELECT count(*) FROM buddy_assigned_requests r JOIN buddy_assigned_pairs p ON p.id=r.pair_id WHERE p.program_id=p_program AND r.resolved));
END; $$;
REVOKE ALL ON FUNCTION public.buddy_assigned_access(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_assigned_add(uuid,jsonb),public.buddy_assigned_state(uuid),public.buddy_assigned_confirm(uuid,boolean),public.buddy_assigned_ask(uuid,text),public.buddy_assigned_reply(uuid,text),public.buddy_assigned_resolve(uuid,boolean),public.buddy_assigned_summary(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_assigned_add(uuid,jsonb),public.buddy_assigned_state(uuid),public.buddy_assigned_confirm(uuid,boolean),public.buddy_assigned_ask(uuid,text),public.buddy_assigned_reply(uuid,text),public.buddy_assigned_resolve(uuid,boolean),public.buddy_assigned_summary(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
