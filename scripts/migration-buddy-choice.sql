-- Founder runs after migration-buddy-program.sql and setup-buddy-program.sql.
-- Manual selection replaces automatic allocation. Existing records are retained.
BEGIN;
UPDATE public.buddy_programs SET automatic=false;
ALTER TABLE public.buddy_programs ADD COLUMN IF NOT EXISTS choice_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.buddy_programs ALTER COLUMN automatic SET DEFAULT false;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='buddy_choice_no_automatic' AND conrelid='public.buddy_programs'::regclass) THEN
 ALTER TABLE public.buddy_programs ADD CONSTRAINT buddy_choice_no_automatic CHECK(NOT(choice_enabled AND automatic));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.buddy_choice_members (
 program_id uuid REFERENCES public.buddy_programs(id), user_id uuid REFERENCES auth.users(id),
 role text NOT NULL CHECK(role IN ('first','upper')), active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(program_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.buddy_choice_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid REFERENCES public.buddy_programs(id),
 user_id uuid REFERENCES auth.users(id), payload jsonb NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.buddy_choice_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid REFERENCES public.buddy_programs(id),
 post_id uuid REFERENCES public.buddy_choice_posts(id), upper_id uuid REFERENCES auth.users(id),
 first_id uuid REFERENCES auth.users(id), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(post_id,upper_id), CHECK(upper_id<>first_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS buddy_choice_one_accepted ON public.buddy_choice_invites(program_id,first_id) WHERE status='accepted';
ALTER TABLE public.buddy_choice_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_choice_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_choice_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_choice_members,public.buddy_choice_posts,public.buddy_choice_invites FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.buddy_choice_member(p uuid,u uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT u IS NOT NULL AND EXISTS(SELECT 1 FROM buddy_programs bp JOIN community_members cm ON cm.community_id=bp.community_id WHERE bp.id=p AND cm.user_id=u AND cm.status='member');
$$;
CREATE OR REPLACE FUNCTION public.buddy_choice_allowed(p uuid,a uuid,b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT buddy_choice_member(p,a) AND buddy_choice_member(p,b) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=a AND blocked_user_id=b) OR (blocker_id=b AND blocked_user_id=a));
$$;
CREATE OR REPLACE FUNCTION public.buddy_choice_sweep(p uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p::text,11));
 UPDATE buddy_choice_invites i SET status='withdrawn' WHERE i.program_id=p AND i.status IN ('pending','accepted')
 AND (NOT buddy_choice_allowed(p,i.first_id,i.upper_id)
 OR NOT EXISTS(SELECT 1 FROM buddy_choice_members m WHERE m.program_id=p AND m.user_id=i.upper_id AND m.role='upper' AND m.active)
 OR NOT EXISTS(SELECT 1 FROM buddy_choice_posts s WHERE s.id=i.post_id AND s.active)
 OR (i.status='pending' AND EXISTS(SELECT 1 FROM buddy_choice_posts s WHERE s.id=i.post_id AND (s.payload->>'expiresAt')::timestamptz<=now())));
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_choice_state(p_program uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p buddy_programs; r text; posts jsonb; invites jsonb; people jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_program IS NULL THEN RETURN jsonb_build_object('programs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',bp.id,'name',bp.name)) FROM buddy_programs bp WHERE buddy_choice_member(bp.id,auth.uid()) OR buddy_is_coordinator(bp.id)),'[]'::jsonb)); END IF;
 SELECT * INTO p FROM buddy_programs WHERE id=p_program;
 IF p.id IS NULL OR (NOT buddy_choice_member(p.id,auth.uid()) AND NOT buddy_is_coordinator(p.id)) THEN RAISE EXCEPTION 'Program not available.'; END IF;
 PERFORM buddy_choice_sweep(p.id);
 SELECT role INTO r FROM buddy_choice_members WHERE program_id=p.id AND user_id=auth.uid() AND active;
 SELECT coalesce(jsonb_agg(s.payload||jsonb_build_object('id',s.id,'owner',CASE WHEN s.user_id=auth.uid() THEN 'me' ELSE NULL END,'name',CASE WHEN coalesce((s.payload->>'is_anonymous')::boolean,true)=false THEN pr.name ELSE NULL END) ORDER BY s.created_at DESC),'[]'::jsonb) INTO posts
 FROM buddy_choice_posts s LEFT JOIN profiles pr ON pr.id=s.user_id WHERE s.program_id=p.id AND s.active
 AND (s.user_id=auth.uid() OR (r='upper' AND p.choice_enabled AND buddy_choice_allowed(p.id,auth.uid(),s.user_id)
 AND EXISTS(SELECT 1 FROM buddy_choice_members m WHERE m.program_id=p.id AND m.user_id=s.user_id AND m.active AND m.role='first')
 AND ((s.payload->>'expiresAt') IS NULL OR (s.payload->>'expiresAt')::timestamptz>now() OR EXISTS(SELECT 1 FROM buddy_choice_invites i WHERE i.post_id=s.id AND i.upper_id=auth.uid() AND i.status='accepted'))
 AND (NOT EXISTS(SELECT 1 FROM buddy_choice_invites i WHERE i.program_id=p.id AND i.first_id=s.user_id AND i.status='accepted') OR EXISTS(SELECT 1 FROM buddy_choice_invites i WHERE i.post_id=s.id AND i.upper_id=auth.uid() AND i.status='accepted'))));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'post_id',i.post_id,'status',i.status,'name',CASE WHEN i.status='accepted' THEN pr.name ELSE NULL END) ORDER BY i.created_at DESC),'[]'::jsonb) INTO invites
 FROM buddy_choice_invites i LEFT JOIN profiles pr ON pr.id=CASE WHEN i.upper_id=auth.uid() THEN i.first_id ELSE i.upper_id END
 WHERE i.program_id=p.id AND auth.uid() IN (i.first_id,i.upper_id) AND buddy_choice_allowed(p.id,i.first_id,i.upper_id)
 AND EXISTS(SELECT 1 FROM buddy_choice_members m WHERE m.program_id=p.id AND m.user_id=i.upper_id AND m.role='upper' AND m.active);
 IF buddy_is_coordinator(p.id) THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(pr.name,'Student'),'active',m.active)),'[]'::jsonb) INTO people FROM buddy_choice_members m LEFT JOIN profiles pr ON pr.id=m.user_id WHERE m.program_id=p.id AND m.role='upper'; END IF;
 RETURN jsonb_build_object('role',r,'coordinator',buddy_is_coordinator(p.id),'enabled',p.choice_enabled,'capacity',least(p.max_mentees,3),'posts',posts,'invitations',invites,'upper_students',coalesce(people,'[]'::jsonb));
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_choice_join(p_program uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM buddy_programs WHERE id=p_program AND choice_enabled) THEN RAISE EXCEPTION 'Posting is paused.'; END IF;
 IF EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=p_program AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Your role is already registered. Contact the coordinator to change it.'; END IF;
 INSERT INTO buddy_choice_members VALUES(p_program,auth.uid(),'first',true);
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_choice_access(p_program uuid,p_email text,p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid;
BEGIN
 IF NOT buddy_is_coordinator(p_program) THEN RAISE EXCEPTION 'Coordinator access required.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,11));
 SELECT id INTO u FROM auth.users WHERE lower(email)=lower(trim(p_email));
 IF u IS NULL OR NOT buddy_choice_member(p_program,u) THEN RAISE EXCEPTION 'This account must join the student community first.'; END IF;
 IF EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=p_program AND user_id=u AND role='first') THEN RAISE EXCEPTION 'Account is registered as a first-year student. Verify the role before changing it.'; END IF;
 INSERT INTO buddy_choice_members VALUES(p_program,u,'upper',p_active) ON CONFLICT(program_id,user_id) DO UPDATE SET active=excluded.active;
 IF NOT p_active THEN UPDATE buddy_choice_invites SET status='withdrawn' WHERE program_id=p_program AND upper_id=u AND status IN ('pending','accepted'); END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_choice_publish(p_program uuid,p_post jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE clean jsonb; result uuid;
BEGIN
 IF NOT buddy_choice_member(p_program,auth.uid()) OR NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=p_program AND user_id=auth.uid() AND role='first' AND active) THEN RAISE EXCEPTION 'First-year student access required.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM buddy_programs WHERE id=p_program AND choice_enabled) THEN RAISE EXCEPTION 'Posting is paused.'; END IF;
 IF length(trim(coalesce(p_post->>'needs',''))) NOT BETWEEN 1 AND 300 OR length(coalesce(p_post->>'offers',''))>200 OR jsonb_typeof(p_post->'helpType') IS DISTINCT FROM 'array' OR jsonb_array_length(p_post->'helpType') NOT BETWEEN 1 AND 3 OR jsonb_typeof(p_post->'industry') IS DISTINCT FROM 'array' OR jsonb_array_length(p_post->'industry')>2 THEN RAISE EXCEPTION 'Please complete the post fields.'; END IF;
 IF p_post->>'expiresAt' IS NOT NULL AND (p_post->>'expiresAt')::timestamptz<=now() THEN RAISE EXCEPTION 'Choose a future expiry date.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements((p_post->'helpType')||(p_post->'industry')) e WHERE jsonb_typeof(e)<>'string' OR length(e::text)>100) OR length(coalesce(p_post->>'time',''))>30 THEN RAISE EXCEPTION 'Invalid post options.'; END IF;
 IF length(p_post::text)>4000 THEN RAISE EXCEPTION 'Post is too long.'; END IF;
 clean:=jsonb_build_object('needs',trim(p_post->>'needs'),'offers',coalesce(p_post->>'offers',''),'helpType',p_post->'helpType','industry',p_post->'industry','tags',(p_post->'helpType')||(p_post->'industry'),'time',coalesce(p_post->>'time','15 min'),'urgency',p_post->>'urgency','expiresAt',p_post->>'expiresAt','is_anonymous',coalesce((p_post->>'is_anonymous')::boolean,true));
 INSERT INTO buddy_choice_posts(program_id,user_id,payload) VALUES(p_program,auth.uid(),clean) RETURNING id INTO result;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_choice_select(p_post uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s buddy_choice_posts; cap integer;
BEGIN
 SELECT * INTO s FROM buddy_choice_posts WHERE id=p_post;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Post not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));
 PERFORM buddy_choice_sweep(s.program_id);
 SELECT * INTO s FROM buddy_choice_posts WHERE id=p_post;
 SELECT least(max_mentees,3) INTO cap FROM buddy_programs WHERE id=s.program_id AND choice_enabled;
 IF cap IS NULL OR NOT s.active OR s.user_id=auth.uid() OR NOT buddy_choice_allowed(s.program_id,auth.uid(),s.user_id) OR NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=s.program_id AND user_id=auth.uid() AND role='upper' AND active) THEN RAISE EXCEPTION 'Upper-year access required or post unavailable.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=s.program_id AND user_id=s.user_id AND role='first' AND active) OR (s.payload->>'expiresAt')::timestamptz<=now() THEN RAISE EXCEPTION 'Post not available.'; END IF;
 IF EXISTS(SELECT 1 FROM buddy_choice_invites WHERE program_id=s.program_id AND first_id=s.user_id AND (status='accepted' OR (upper_id=auth.uid() AND status IN ('pending','declined')))) THEN RAISE EXCEPTION 'This student already has a buddy or an invitation from you.'; END IF;
 IF (SELECT count(*) FROM buddy_choice_invites WHERE program_id=s.program_id AND upper_id=auth.uid() AND status IN ('pending','accepted'))>=cap THEN RAISE EXCEPTION 'All your buddy places are currently reserved.'; END IF;
 INSERT INTO buddy_choice_invites(program_id,post_id,upper_id,first_id) VALUES(s.program_id,s.id,auth.uid(),s.user_id) ON CONFLICT(post_id,upper_id) DO UPDATE SET status='pending',created_at=now();
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_choice_respond(p_invite uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i buddy_choice_invites;
BEGIN
 SELECT * INTO i FROM buddy_choice_invites WHERE id=p_invite;
 IF i.id IS NULL OR auth.uid() IS NULL OR auth.uid() NOT IN (i.first_id,i.upper_id) THEN RAISE EXCEPTION 'Invitation not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(i.program_id::text,11));
 SELECT * INTO i FROM buddy_choice_invites WHERE id=p_invite FOR UPDATE;
 IF p_action='withdraw' AND auth.uid()=i.upper_id AND i.status IN ('pending','accepted') THEN UPDATE buddy_choice_invites SET status='withdrawn' WHERE id=i.id; RETURN; END IF;
 IF auth.uid()<>i.first_id OR i.status<>'pending' OR p_action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invitation cannot be changed.'; END IF;
 IF p_action='accept' THEN
  IF NOT buddy_choice_allowed(i.program_id,i.first_id,i.upper_id) OR NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=i.program_id AND user_id=i.upper_id AND role='upper' AND active) OR NOT EXISTS(SELECT 1 FROM buddy_choice_posts WHERE id=i.post_id AND active AND ((payload->>'expiresAt') IS NULL OR (payload->>'expiresAt')::timestamptz>now())) THEN RAISE EXCEPTION 'Invitation no longer available.'; END IF;
  UPDATE buddy_choice_invites SET status='accepted' WHERE id=i.id;
  UPDATE buddy_choice_invites SET status='withdrawn' WHERE program_id=i.program_id AND first_id=i.first_id AND id<>i.id AND status='pending';
 ELSE UPDATE buddy_choice_invites SET status='declined' WHERE id=i.id;
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_choice_remove(p_post uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s buddy_choice_posts;
BEGIN
 SELECT * INTO s FROM buddy_choice_posts WHERE id=p_post AND user_id=auth.uid();
 IF s.id IS NULL THEN RAISE EXCEPTION 'Post not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));
 UPDATE buddy_choice_posts SET active=false WHERE id=s.id;
 UPDATE buddy_choice_invites SET status='withdrawn' WHERE post_id=s.id AND status IN ('pending','accepted');
END; $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'buddy_choice_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.buddy_choice_state(uuid),public.buddy_choice_join(uuid),public.buddy_choice_access(uuid,text,boolean),public.buddy_choice_publish(uuid,jsonb),public.buddy_choice_select(uuid),public.buddy_choice_respond(uuid,text),public.buddy_choice_remove(uuid) TO authenticated;
COMMIT;
