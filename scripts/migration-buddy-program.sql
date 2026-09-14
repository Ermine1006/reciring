-- Founder runs this manually in Supabase SQL Editor. Safe to rerun.
-- No program is enabled and no students are enrolled by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.buddy_programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL REFERENCES public.communities(id),
 name text NOT NULL, enabled boolean NOT NULL DEFAULT false, automatic boolean NOT NULL DEFAULT true,
 max_mentees integer NOT NULL DEFAULT 3 CHECK(max_mentees BETWEEN 1 AND 10),
 reply_days integer NOT NULL DEFAULT 5 CHECK(reply_days BETWEEN 2 AND 30), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.buddy_coordinators (
 program_id uuid REFERENCES public.buddy_programs(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, PRIMARY KEY(program_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.buddy_roster (
 program_id uuid REFERENCES public.buddy_programs(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('mentor','mentee')), PRIMARY KEY(program_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.buddy_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL, user_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('mentor','mentee')), need text NOT NULL CHECK(length(need) BETWEEN 1 AND 2000),
 offer text NOT NULL DEFAULT '' CHECK(length(offer)<=2000), experience text NOT NULL DEFAULT '' CHECK(length(experience)<=1500),
 need_topics text[] NOT NULL DEFAULT '{}', offer_topics text[] NOT NULL DEFAULT '{}', profile_topics text[] NOT NULL DEFAULT '{}',
 windows jsonb NOT NULL, meeting_format text NOT NULL CHECK(meeting_format IN ('online','campus','either')),
 capacity integer NOT NULL DEFAULT 1 CHECK(capacity BETWEEN 1 AND 10), contact text NOT NULL CHECK(length(contact) BETWEEN 1 AND 250),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(program_id,user_id), FOREIGN KEY(program_id,user_id) REFERENCES public.buddy_roster(program_id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.buddy_pairings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES public.buddy_programs(id) ON DELETE CASCADE,
 mentee_id uuid NOT NULL REFERENCES public.buddy_posts(id) ON DELETE CASCADE,
 mentor_id uuid NOT NULL REFERENCES public.buddy_posts(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','accepted','declined','expired','ended')),
 mentee_accepted boolean NOT NULL DEFAULT false, mentor_accepted boolean NOT NULL DEFAULT false,
 mentee_met boolean NOT NULL DEFAULT false, mentor_met boolean NOT NULL DEFAULT false,
 common_topics text[] NOT NULL, reciprocal_topics text[] NOT NULL DEFAULT '{}', profile_topics text[] NOT NULL DEFAULT '{}',
 suggested_start timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), CHECK(mentee_id<>mentor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS buddy_one_live_mentee ON public.buddy_pairings(mentee_id) WHERE status IN ('suggested','accepted');
CREATE INDEX IF NOT EXISTS buddy_mentor_live ON public.buddy_pairings(mentor_id,status);
CREATE TABLE IF NOT EXISTS public.buddy_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 pairing_id uuid NOT NULL REFERENCES public.buddy_pairings(id) ON DELETE CASCADE, kind text NOT NULL,
 body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,pairing_id,kind)
);
ALTER TABLE public.buddy_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_coordinators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_notices ENABLE ROW LEVEL SECURITY;
-- All access goes through narrow RPCs. No direct client table access.
REVOKE ALL ON public.buddy_programs, public.buddy_coordinators, public.buddy_roster, public.buddy_posts, public.buddy_pairings, public.buddy_notices FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.buddy_is_coordinator(p_program uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM buddy_coordinators WHERE program_id=p_program AND user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.buddy_is_member(p_program uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM buddy_roster r JOIN buddy_programs p ON p.id=r.program_id
 JOIN community_members m ON m.community_id=p.community_id AND m.user_id=r.user_id AND m.status='member'
 WHERE r.program_id=p_program AND r.user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.buddy_intersection(a text[],b text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT ARRAY(SELECT DISTINCT x FROM unnest(a) x WHERE x=ANY(b) ORDER BY x); $$;
CREATE OR REPLACE FUNCTION public.buddy_overlap(a jsonb,b jsonb) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT min(greatest((x->>'start')::timestamptz,(y->>'start')::timestamptz))
 FROM jsonb_array_elements(a) x CROSS JOIN jsonb_array_elements(b) y
 WHERE greatest((x->>'start')::timestamptz,(y->>'start')::timestamptz)>now()
 AND least((x->>'end')::timestamptz,(y->>'end')::timestamptz)-greatest((x->>'start')::timestamptz,(y->>'start')::timestamptz)>=interval '30 minutes';
$$;
-- Internal matcher. Serializes all program mutations, reserves mentor capacity,
-- prioritizes constrained mentees and never repeats a rejected pairing.
CREATE OR REPLACE FUNCTION public.buddy_match(p_program uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p buddy_programs; student buddy_posts; chosen record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,0));
 SELECT * INTO p FROM buddy_programs WHERE id=p_program;
 IF NOT p.enabled OR NOT p.automatic THEN RETURN; END IF;
 UPDATE buddy_pairings x SET status='ended',updated_at=now()
 FROM buddy_posts a,buddy_posts b WHERE x.program_id=p_program AND x.status IN ('suggested','accepted') AND a.id=x.mentee_id AND b.id=x.mentor_id
 AND (NOT a.active OR NOT b.active OR EXISTS(SELECT 1 FROM blocks z WHERE (z.blocker_id=a.user_id AND z.blocked_user_id=b.user_id) OR (z.blocker_id=b.user_id AND z.blocked_user_id=a.user_id))
 OR NOT EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id=p.community_id AND cm.user_id=a.user_id AND cm.status='member')
 OR NOT EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id=p.community_id AND cm.user_id=b.user_id AND cm.status='member'));
 UPDATE buddy_pairings SET status='expired',updated_at=now() WHERE program_id=p_program AND status='suggested' AND expires_at<=now();
 FOR student IN SELECT s.* FROM buddy_posts s WHERE s.program_id=p_program AND s.role='mentee' AND s.active
 AND EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id=p.community_id AND cm.user_id=s.user_id AND cm.status='member')
 AND NOT EXISTS(SELECT 1 FROM buddy_pairings x WHERE x.mentee_id=s.id AND x.status IN ('suggested','accepted'))
 ORDER BY (SELECT count(*) FROM buddy_posts m WHERE m.program_id=p_program AND m.role='mentor' AND m.active
 AND s.need_topics && m.offer_topics AND buddy_overlap(s.windows,m.windows) IS NOT NULL),s.created_at,s.id
 LOOP
  SELECT m.*,buddy_intersection(student.need_topics,m.offer_topics) AS common,
   buddy_intersection(student.offer_topics,m.need_topics) AS reverse_fit,
   buddy_intersection(student.profile_topics,m.profile_topics) AS profile_fit,
   buddy_overlap(student.windows,m.windows) AS starts
  INTO chosen FROM buddy_posts m
  WHERE m.program_id=p_program AND m.role='mentor' AND m.active AND m.user_id<>student.user_id
  AND EXISTS(SELECT 1 FROM community_members cm WHERE cm.community_id=p.community_id AND cm.user_id=m.user_id AND cm.status='member')
  AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=student.user_id AND b.blocked_user_id=m.user_id) OR (b.blocker_id=m.user_id AND b.blocked_user_id=student.user_id))
  AND cardinality(buddy_intersection(student.need_topics,m.offer_topics))*2>=greatest(cardinality(student.need_topics),1)
  AND (student.meeting_format='either' OR m.meeting_format='either' OR student.meeting_format=m.meeting_format)
  AND buddy_overlap(student.windows,m.windows) IS NOT NULL
  AND (SELECT count(*) FROM buddy_pairings x WHERE x.mentor_id=m.id AND x.status IN ('suggested','accepted'))<least(m.capacity,p.max_mentees)
  AND NOT EXISTS(SELECT 1 FROM buddy_pairings x WHERE x.mentor_id=m.id AND x.mentee_id=student.id AND (x.status IN ('declined','accepted','suggested') OR x.created_at>now()-interval '7 days'))
  ORDER BY cardinality(buddy_intersection(student.need_topics,m.offer_topics))::numeric/greatest(cardinality(student.need_topics),1) DESC,
   cardinality(buddy_intersection(student.offer_topics,m.need_topics)) DESC,
   cardinality(buddy_intersection(student.profile_topics,m.profile_topics)) DESC,
   (SELECT count(*) FROM buddy_pairings x WHERE x.mentor_id=m.id AND x.status IN ('suggested','accepted')),m.created_at,m.id LIMIT 1;
  IF FOUND THEN
   INSERT INTO buddy_pairings(program_id,mentee_id,mentor_id,common_topics,reciprocal_topics,profile_topics,suggested_start,expires_at)
   VALUES(p_program,student.id,chosen.id,chosen.common,chosen.reverse_fit,chosen.profile_fit,chosen.starts,least(now()+make_interval(days=>p.reply_days),chosen.starts));
  END IF;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_publish(p_program uuid,p_post jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p buddy_programs; r text; existing buddy_posts; result uuid; w jsonb; k text;
BEGIN
 IF NOT buddy_is_member(p_program) THEN RAISE EXCEPTION 'Join the program roster before posting.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,0));
 SELECT * INTO p FROM buddy_programs WHERE id=p_program;
 IF NOT p.enabled THEN RAISE EXCEPTION 'This program is not open yet.'; END IF;
 SELECT role INTO r FROM buddy_roster WHERE program_id=p_program AND user_id=auth.uid();
 SELECT * INTO existing FROM buddy_posts WHERE program_id=p_program AND user_id=auth.uid();
 IF EXISTS(SELECT 1 FROM buddy_pairings WHERE (mentee_id=existing.id OR mentor_id=existing.id) AND status='accepted') THEN
 RAISE EXCEPTION 'End your current pairing before changing your buddy post.'; END IF;
 IF coalesce(p_post->>'consent','')<>'true' THEN RAISE EXCEPTION 'Please agree to share your buddy post within this program.'; END IF;
 IF jsonb_typeof(p_post->'windows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_post->'windows') NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Add one to five availability windows.'; END IF;
 FOR w IN SELECT value FROM jsonb_array_elements(p_post->'windows') LOOP
  IF w->>'start' IS NULL OR w->>'end' IS NULL OR (w->>'start')::timestamptz<=now() OR (w->>'end')::timestamptz-(w->>'start')::timestamptz<interval '30 minutes' OR (w->>'end')::timestamptz-(w->>'start')::timestamptz>interval '12 hours' THEN RAISE EXCEPTION 'Choose future windows of 30 minutes to 12 hours.'; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['need_topics','offer_topics','profile_topics'] LOOP
  IF jsonb_typeof(p_post->k) IS DISTINCT FROM 'array' OR jsonb_array_length(p_post->k)>8 THEN RAISE EXCEPTION 'Choose up to eight topics per section.'; END IF;
 END LOOP;
 IF length(trim(coalesce(p_post->>'offer','')))=0 THEN p_post:=jsonb_set(p_post,'{offer_topics}','[]'::jsonb); END IF;
 IF r='mentee' AND jsonb_array_length(p_post->'need_topics')=0 THEN RAISE EXCEPTION 'Select what you need help with.'; END IF;
 IF r='mentor' AND (length(trim(coalesce(p_post->>'offer','')))=0 OR jsonb_array_length(p_post->'offer_topics')=0) THEN RAISE EXCEPTION 'Tell students what you can help with.'; END IF;
 UPDATE buddy_pairings SET status='ended',updated_at=now() WHERE (mentee_id=existing.id OR mentor_id=existing.id) AND status='suggested';
 INSERT INTO buddy_posts(program_id,user_id,role,need,offer,experience,need_topics,offer_topics,profile_topics,windows,meeting_format,capacity,contact)
 VALUES(p_program,auth.uid(),r,trim(p_post->>'need'),trim(coalesce(p_post->>'offer','')),coalesce(p_post->>'experience',''),
 ARRAY(SELECT jsonb_array_elements_text(p_post->'need_topics')),ARRAY(SELECT jsonb_array_elements_text(p_post->'offer_topics')),ARRAY(SELECT jsonb_array_elements_text(p_post->'profile_topics')),
 p_post->'windows',p_post->>'meeting_format',least(coalesce((p_post->>'capacity')::int,1),p.max_mentees),trim(p_post->>'contact'))
 ON CONFLICT(program_id,user_id) DO UPDATE SET need=excluded.need,offer=excluded.offer,experience=excluded.experience,need_topics=excluded.need_topics,offer_topics=excluded.offer_topics,
 profile_topics=excluded.profile_topics,windows=excluded.windows,meeting_format=excluded.meeting_format,capacity=excluded.capacity,contact=excluded.contact,active=true,updated_at=now()
 RETURNING id INTO result;
 PERFORM buddy_match(p_program); RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_respond(p_pairing uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE x buddy_pairings; mine uuid; is_student boolean;
BEGIN
 SELECT * INTO x FROM buddy_pairings WHERE id=p_pairing;
 IF NOT FOUND OR NOT buddy_is_member(x.program_id) THEN RAISE EXCEPTION 'Pairing not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(x.program_id::text,0));
 SELECT * INTO x FROM buddy_pairings WHERE id=p_pairing FOR UPDATE;
 SELECT id INTO mine FROM buddy_posts WHERE program_id=x.program_id AND user_id=auth.uid();
 IF mine NOT IN (x.mentee_id,x.mentor_id) OR mine IS NULL THEN RAISE EXCEPTION 'Pairing not available.'; END IF;
 is_student:=mine=x.mentee_id;
 IF p_action='accept' AND EXISTS(SELECT 1 FROM buddy_posts a JOIN buddy_posts b ON b.id=x.mentor_id JOIN blocks z ON (z.blocker_id=a.user_id AND z.blocked_user_id=b.user_id) OR (z.blocker_id=b.user_id AND z.blocked_user_id=a.user_id) WHERE a.id=x.mentee_id) THEN RAISE EXCEPTION 'This pairing is no longer available.'; END IF;
 IF p_action='accept' THEN
  IF NOT EXISTS(SELECT 1 FROM buddy_posts other JOIN buddy_programs p ON p.id=other.program_id JOIN community_members cm ON cm.community_id=p.community_id AND cm.user_id=other.user_id AND cm.status='member' WHERE other.id=CASE WHEN is_student THEN x.mentor_id ELSE x.mentee_id END AND other.active) THEN RAISE EXCEPTION 'This pairing is no longer available.'; END IF;
  IF x.status<>'suggested' OR x.expires_at<=now() THEN RAISE EXCEPTION 'This suggestion has expired. Refresh to see your current options.'; END IF;
  UPDATE buddy_pairings SET mentee_accepted=mentee_accepted OR is_student,mentor_accepted=mentor_accepted OR NOT is_student,updated_at=now() WHERE id=x.id;
  UPDATE buddy_pairings SET status='accepted' WHERE id=x.id AND mentee_accepted AND mentor_accepted;
 ELSIF p_action='rematch' THEN
  IF x.status NOT IN ('suggested','accepted') THEN RAISE EXCEPTION 'This pairing is already closed.'; END IF;
  UPDATE buddy_pairings SET status='declined',updated_at=now() WHERE id=x.id;
 ELSIF p_action='met' THEN
  IF x.status<>'accepted' THEN RAISE EXCEPTION 'Both people must accept first.'; END IF;
  UPDATE buddy_pairings SET mentee_met=mentee_met OR is_student,mentor_met=mentor_met OR NOT is_student,updated_at=now() WHERE id=x.id;
 ELSE RAISE EXCEPTION 'Unknown action.'; END IF;
 PERFORM buddy_match(x.program_id);
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_withdraw(p_program uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mine uuid;
BEGIN
 IF NOT buddy_is_member(p_program) THEN RAISE EXCEPTION 'Program not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,0));
 UPDATE buddy_posts SET active=false,updated_at=now() WHERE program_id=p_program AND user_id=auth.uid() RETURNING id INTO mine;
 UPDATE buddy_pairings SET status='ended',updated_at=now() WHERE (mentee_id=mine OR mentor_id=mine) AND status IN ('suggested','accepted');
 PERFORM buddy_match(p_program);
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_state(p_program uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p uuid; mine buddy_posts; pairs jsonb; notices jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to join Buddy Program.'; END IF;
 IF p_program IS NULL THEN
  RETURN jsonb_build_object('programs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'enabled',x.enabled,'coordinator',buddy_is_coordinator(x.id),'role',r.role))
   FROM buddy_programs x LEFT JOIN buddy_roster r ON r.program_id=x.id AND r.user_id=auth.uid()
   WHERE buddy_is_member(x.id) OR buddy_is_coordinator(x.id)),'[]'::jsonb));
 END IF;
 p:=p_program;
 IF NOT buddy_is_member(p) AND NOT buddy_is_coordinator(p) THEN RAISE EXCEPTION 'Program not available.'; END IF;
 SELECT * INTO mine FROM buddy_posts WHERE program_id=p AND user_id=auth.uid();
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'status',x.status,'expires_at',x.expires_at,'created_at',x.created_at,
 'you_accepted',CASE WHEN mine.id=x.mentee_id THEN x.mentee_accepted ELSE x.mentor_accepted END,
 'you_met',CASE WHEN mine.id=x.mentee_id THEN x.mentee_met ELSE x.mentor_met END,'both_met',x.mentee_met AND x.mentor_met,
 'common_topics',x.common_topics,'reciprocal_topics',x.reciprocal_topics,'profile_topics',x.profile_topics,'suggested_start',x.suggested_start,
 'peer',jsonb_build_object('role',other.role,'need',other.need,'offer',other.offer,'experience',other.experience,'meeting_format',other.meeting_format,
 'name',CASE WHEN x.status='accepted' THEN coalesce(pr.name,'Your buddy') ELSE CASE WHEN other.role='mentor' THEN 'Upper-year mentor' ELSE 'New student' END END,
 'contact',CASE WHEN x.status='accepted' THEN other.contact ELSE NULL END)) ORDER BY x.created_at DESC),'[]'::jsonb) INTO pairs
 FROM buddy_pairings x JOIN buddy_posts other ON other.id=CASE WHEN mine.id=x.mentee_id THEN x.mentor_id ELSE x.mentee_id END
 LEFT JOIN profiles pr ON pr.id=other.user_id
 WHERE EXISTS(SELECT 1 FROM buddy_programs bp JOIN community_members cm ON cm.community_id=bp.community_id AND cm.user_id=other.user_id AND cm.status='member' WHERE bp.id=p)
 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=mine.user_id AND b.blocked_user_id=other.user_id) OR (b.blocker_id=other.user_id AND b.blocked_user_id=mine.user_id))
 AND x.program_id=p AND mine.id IN (x.mentee_id,x.mentor_id) AND x.status IN ('suggested','accepted');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'created_at',n.created_at) ORDER BY n.created_at DESC),'[]'::jsonb) INTO notices
 FROM buddy_notices n JOIN buddy_pairings x ON x.id=n.pairing_id WHERE n.user_id=auth.uid() AND x.program_id=p AND x.status IN ('suggested','accepted') AND n.created_at>now()-interval '14 days';
 RETURN jsonb_build_object('post',CASE WHEN mine.id IS NULL THEN NULL ELSE to_jsonb(mine) END,'pairings',pairs,'notices',notices);
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_dashboard(p_program uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE stats jsonb; exceptions jsonb; roster jsonb;
BEGIN
 IF NOT buddy_is_coordinator(p_program) THEN RAISE EXCEPTION 'Coordinator access required.'; END IF;
 SELECT jsonb_build_object('confirmed',count(*) FILTER(WHERE status='accepted'),'awaiting',count(*) FILTER(WHERE status='suggested'),
 'met',count(*) FILTER(WHERE status='accepted' AND mentee_met AND mentor_met)) INTO stats FROM buddy_pairings WHERE program_id=p_program;
 SELECT coalesce(jsonb_agg(jsonb_build_object('post_id',s.id,'name',coalesce(pr.name,'Student'),'reason',
 CASE WHEN EXISTS(SELECT 1 FROM buddy_pairings x WHERE x.mentee_id=s.id AND x.status='declined') THEN 'Rematch requested'
 WHEN NOT EXISTS(SELECT 1 FROM buddy_posts m WHERE m.program_id=p_program AND m.role='mentor' AND m.active AND cardinality(buddy_intersection(s.need_topics,m.offer_topics))*2>=greatest(cardinality(s.need_topics),1)) THEN 'No suitable mentor'
 WHEN NOT EXISTS(SELECT 1 FROM buddy_posts m WHERE m.program_id=p_program AND m.role='mentor' AND m.active AND cardinality(buddy_intersection(s.need_topics,m.offer_topics))*2>=greatest(cardinality(s.need_topics),1) AND buddy_overlap(s.windows,m.windows) IS NOT NULL) THEN 'No shared time'
 ELSE 'Capacity or meeting preferences' END)),'[]'::jsonb) INTO exceptions
 FROM buddy_posts s LEFT JOIN profiles pr ON pr.id=s.user_id WHERE s.program_id=p_program AND s.role='mentee' AND s.active
 AND NOT EXISTS(SELECT 1 FROM buddy_pairings x WHERE x.mentee_id=s.id AND x.status IN ('suggested','accepted'));
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',coalesce(pr.name,'Student'),'role',r.role,'posted',s.id IS NOT NULL,'active',coalesce(s.active,false))),'[]'::jsonb) INTO roster
 FROM buddy_roster r LEFT JOIN profiles pr ON pr.id=r.user_id LEFT JOIN buddy_posts s ON s.program_id=r.program_id AND s.user_id=r.user_id WHERE r.program_id=p_program;
 RETURN jsonb_build_object('stats',stats,'exceptions',exceptions,'roster',roster,'settings',(SELECT to_jsonb(p) FROM buddy_programs p WHERE id=p_program));
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_settings(p_program uuid,p_enabled boolean,p_automatic boolean,p_capacity integer,p_reply_days integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT buddy_is_coordinator(p_program) THEN RAISE EXCEPTION 'Coordinator access required.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,0));
 UPDATE buddy_programs SET enabled=p_enabled,automatic=p_automatic,max_mentees=p_capacity,reply_days=p_reply_days WHERE id=p_program;
 PERFORM buddy_match(p_program);
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_add_member(p_program uuid,p_email text,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE member_id uuid;
BEGIN
 IF NOT buddy_is_coordinator(p_program) THEN RAISE EXCEPTION 'Coordinator access required.'; END IF;
 SELECT u.id INTO member_id FROM auth.users u JOIN buddy_programs p ON p.id=p_program
 JOIN community_members cm ON cm.user_id=u.id AND cm.community_id=p.community_id AND cm.status='member'
 WHERE lower(u.email)=lower(trim(p_email));
 IF member_id IS NULL THEN RAISE EXCEPTION 'Ask this student to join the Rotman community in Mutu first.'; END IF;
 INSERT INTO buddy_roster(program_id,user_id,role) VALUES(p_program,member_id,p_role) ON CONFLICT DO NOTHING;
END; $$;
-- Daily internal reminders only. No email, private-message access, or token minting.
CREATE OR REPLACE FUNCTION public.buddy_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p uuid;
BEGIN
 FOR p IN SELECT id FROM buddy_programs WHERE enabled LOOP
  PERFORM buddy_match(p);
  INSERT INTO buddy_notices(user_id,pairing_id,kind,body)
  SELECT s.user_id,x.id,'reply','Your buddy suggestion is waiting. Accept when it feels right, or request another match.'
  FROM buddy_pairings x JOIN buddy_posts s ON s.id IN (x.mentee_id,x.mentor_id)
  WHERE x.program_id=p AND x.status='suggested' AND x.created_at<now()-interval '2 days'
   AND NOT CASE WHEN s.id=x.mentee_id THEN x.mentee_accepted ELSE x.mentor_accepted END ON CONFLICT DO NOTHING;
  INSERT INTO buddy_notices(user_id,pairing_id,kind,body)
  SELECT s.user_id,x.id,'meet','Have you connected with your buddy? Reach out when you are ready and confirm after you meet.'
  FROM buddy_pairings x JOIN buddy_posts s ON s.id IN (x.mentee_id,x.mentor_id)
  WHERE x.program_id=p AND x.status='accepted' AND x.updated_at<now()-interval '7 days'
   AND NOT CASE WHEN s.id=x.mentee_id THEN x.mentee_met ELSE x.mentor_met END ON CONFLICT DO NOTHING;
 END LOOP;
END; $$;
-- Lock down default PUBLIC execute permissions, including internal helpers.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'buddy\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.buddy_state(uuid),public.buddy_publish(uuid,jsonb),public.buddy_respond(uuid,text),public.buddy_withdraw(uuid),public.buddy_dashboard(uuid),public.buddy_settings(uuid,boolean,boolean,integer,integer),public.buddy_add_member(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_tick() TO service_role;
COMMIT;
