-- Founder runs manually in Supabase SQL Editor.
-- Apply AFTER:
--   migration-buddy-upper-approval.sql
--   migration-buddy-assigned.sql
--   migration-buddy-assigned-withdraw.sql
--
-- First year access is no longer self-declared. A first year student enters
-- the Rotman email of their assigned upper year Buddy. That exact Buddy,
-- once approved by the program admin, verifies the student. Verification
-- simultaneously opens first year access and confirms the school Buddy pair.
BEGIN;

CREATE TABLE IF NOT EXISTS public.buddy_first_year_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.buddy_programs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentor_email text NOT NULL,
  mentor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN (
      'waiting_mentor_approval',
      'pending_verification',
      'verified',
      'not_confirmed',
      'cancelled'
    )),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  notified_at timestamptz,
  UNIQUE(program_id,student_id),
  CHECK(student_id<>mentor_id)
);

ALTER TABLE public.buddy_first_year_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buddy_first_year_access_requests FROM PUBLIC,anon,authenticated;

CREATE INDEX IF NOT EXISTS idx_buddy_first_year_mentor_pending
  ON public.buddy_first_year_access_requests(program_id,mentor_id,status);

-- First year sends or updates the request. The mentor email must belong to
-- the same student community and to an upper year participant/application.
-- The error is intentionally generic so this RPC is not an account-enumeration tool.
CREATE OR REPLACE FUNCTION public.buddy_first_year_request(
  p_program uuid,
  p_mentor_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_mentor uuid;
  v_student_email text;
  v_email text;
  v_ready boolean;
  v_known_upper boolean;
  v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.buddy_programs WHERE id=p_program AND choice_enabled) THEN RAISE EXCEPTION 'Joining is paused by the program coordinator.'; END IF;

 IF EXISTS(
   SELECT 1 FROM public.buddy_choice_members
   WHERE program_id=p_program AND user_id=auth.uid()
 ) THEN
   RAISE EXCEPTION 'Your Buddy Program role is already registered.';
 END IF;

 IF EXISTS(
   SELECT 1 FROM public.buddy_upper_applications
   WHERE program_id=p_program AND user_id=auth.uid()
 ) THEN
   RAISE EXCEPTION 'This account is already on the upper year application track. Contact the program admin if your year needs correction.';
 END IF;

 SELECT lower(email) INTO v_student_email
 FROM auth.users WHERE id=auth.uid();

 v_email:=lower(trim(coalesce(p_mentor_email,'')));
 IF v_email='' OR length(v_email)>254 OR v_email=v_student_email THEN
   RAISE EXCEPTION 'Check your assigned Buddy email.';
 END IF;

 SELECT id INTO v_mentor
 FROM auth.users
 WHERE lower(email)=v_email
 LIMIT 1;

 IF v_mentor IS NULL
    OR NOT public.buddy_choice_member(p_program,v_mentor)
 THEN
   RAISE EXCEPTION 'We could not send this request yet. Check your Buddy''s Rotman email or ask your program admin.';
 END IF;

 SELECT EXISTS(
   SELECT 1 FROM public.buddy_upper_applications a
   WHERE a.program_id=p_program AND a.user_id=v_mentor
 )
 OR EXISTS(
   SELECT 1 FROM public.buddy_choice_members m
   WHERE m.program_id=p_program AND m.user_id=v_mentor AND m.role='upper'
 )
 INTO v_known_upper;

 IF NOT v_known_upper THEN
   RAISE EXCEPTION 'We could not send this request yet. Check your Buddy''s Rotman email or ask your program admin.';
 END IF;

 SELECT EXISTS(
   SELECT 1
   FROM public.buddy_choice_members m
   JOIN public.buddy_upper_applications a
     ON a.program_id=m.program_id AND a.user_id=m.user_id
   WHERE m.program_id=p_program
     AND m.user_id=v_mentor
     AND m.role='upper'
     AND m.active
     AND a.status='approved'
 ) INTO v_ready;

 -- Close any unread request notification for the previous mentor before
 -- changing the destination.
 SELECT id INTO v_id
 FROM public.buddy_first_year_access_requests
 WHERE program_id=p_program AND student_id=auth.uid();

 IF v_id IS NOT NULL THEN
   UPDATE public.notifications
   SET read_at=coalesce(read_at,now()),
       payload=payload||jsonb_build_object('resolved','updated')
   WHERE type='new_match'
     AND payload->>'kind'='buddy_first_year_verification'
     AND payload->>'request_id'=v_id::text
     AND read_at IS NULL;
 END IF;

 INSERT INTO public.buddy_first_year_access_requests(
   program_id,student_id,mentor_email,mentor_id,status,
   requested_at,reviewed_at,reviewed_by,notified_at
 )
 VALUES(
   p_program,auth.uid(),v_email,v_mentor,
   CASE WHEN v_ready THEN 'pending_verification' ELSE 'waiting_mentor_approval' END,
   now(),NULL,NULL,CASE WHEN v_ready THEN now() ELSE NULL END
 )
 ON CONFLICT(program_id,student_id) DO UPDATE SET
   mentor_email=excluded.mentor_email,
   mentor_id=excluded.mentor_id,
   status=excluded.status,
   requested_at=now(),
   reviewed_at=NULL,
   reviewed_by=NULL,
   notified_at=excluded.notified_at
 RETURNING id INTO v_id;

 IF v_ready THEN
   INSERT INTO public.notifications(user_id,type,title,body,payload)
   VALUES(
     v_mentor,
     'new_match',
     'Buddy verification request',
     'A first year student says you are their assigned Buddy.',
     jsonb_build_object(
       'kind','buddy_first_year_verification',
       'request_id',v_id,
       'program_id',p_program
     )
   );
 END IF;

 RETURN v_id;
END;
$$;

-- Privacy-safe state for the current student plus the approved mentor's own queue.
CREATE OR REPLACE FUNCTION public.buddy_first_year_access_state(p_program uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_request jsonb;
  v_incoming jsonb;
  v_is_approved_upper boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;

 SELECT jsonb_build_object(
   'id',r.id,
   'status',r.status,
   'mentor_email',r.mentor_email,
   'requested_at',r.requested_at,
   'reviewed_at',r.reviewed_at
 )
 INTO v_request
 FROM public.buddy_first_year_access_requests r
 WHERE r.program_id=p_program AND r.student_id=auth.uid();

 SELECT EXISTS(
   SELECT 1
   FROM public.buddy_choice_members m
   JOIN public.buddy_upper_applications a
     ON a.program_id=m.program_id AND a.user_id=m.user_id
   WHERE m.program_id=p_program
     AND m.user_id=auth.uid()
     AND m.role='upper'
     AND m.active
     AND a.status='approved'
 ) INTO v_is_approved_upper;

 IF v_is_approved_upper THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',r.id,
     'name',coalesce(nullif(pr.name,''),'First year student'),
     'email',coalesce(u.email,''),
     'requested_at',r.requested_at
   ) ORDER BY r.requested_at),'[]'::jsonb)
   INTO v_incoming
   FROM public.buddy_first_year_access_requests r
   LEFT JOIN public.profiles pr ON pr.id=r.student_id
   LEFT JOIN auth.users u ON u.id=r.student_id
   WHERE r.program_id=p_program
     AND r.mentor_id=auth.uid()
     AND r.status='pending_verification';
 END IF;

 RETURN jsonb_build_object(
   'request',v_request,
   'incoming',coalesce(v_incoming,'[]'::jsonb)
 );
END;
$$;

-- Only the exact requested mentor can verify. Accepting is both sides'
-- consent: the student chose this mentor email and the mentor confirms the assignment.
CREATE OR REPLACE FUNCTION public.buddy_first_year_verify(
  p_request uuid,
  p_accept boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  r public.buddy_first_year_access_requests;
  v_student_email text;
  v_student_name text;
  v_existing_role text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_accept IS NULL THEN RAISE EXCEPTION 'Choose a verification action.'; END IF;

 SELECT * INTO r
 FROM public.buddy_first_year_access_requests
 WHERE id=p_request
 FOR UPDATE;

 IF NOT FOUND
    OR r.mentor_id<>auth.uid()
    OR r.status<>'pending_verification'
 THEN
   RAISE EXCEPTION 'Verification request is not available.';
 END IF;

 IF NOT EXISTS(
   SELECT 1
   FROM public.buddy_choice_members m
   JOIN public.buddy_upper_applications a
     ON a.program_id=m.program_id AND a.user_id=m.user_id
   WHERE m.program_id=r.program_id
     AND m.user_id=auth.uid()
     AND m.role='upper'
     AND m.active
     AND a.status='approved'
 ) THEN
   RAISE EXCEPTION 'Approved upper year access is required.';
 END IF;

 IF p_accept THEN
   IF NOT public.buddy_choice_allowed(r.program_id,r.student_id,r.mentor_id) THEN
     RAISE EXCEPTION 'This Buddy pairing is not available.';
   END IF;

   IF EXISTS(
     SELECT 1 FROM public.buddy_upper_applications
     WHERE program_id=r.program_id AND user_id=r.student_id
   ) THEN
     RAISE EXCEPTION 'This student account is on the upper year application track. Ask the program admin to correct the year.';
   END IF;

   SELECT role INTO v_existing_role
   FROM public.buddy_choice_members
   WHERE program_id=r.program_id AND user_id=r.student_id
   FOR UPDATE;

   IF v_existing_role IS NOT NULL AND v_existing_role<>'first' THEN
     RAISE EXCEPTION 'This account already has a different Buddy Program role.';
   END IF;

   IF EXISTS(
     SELECT 1 FROM public.buddy_assigned_pairs
     WHERE program_id=r.program_id
       AND student_id=r.student_id
       AND status='confirmed'
       AND mentor_id<>r.mentor_id
   ) THEN
     RAISE EXCEPTION 'This student already has a different confirmed school Buddy.';
   END IF;

   INSERT INTO public.buddy_choice_members(program_id,user_id,role,active)
   VALUES(r.program_id,r.student_id,'first',true)
   ON CONFLICT(program_id,user_id) DO UPDATE SET role='first',active=true;

   SELECT lower(email) INTO v_student_email FROM auth.users WHERE id=r.student_id;
   SELECT coalesce(nullif(name,''),v_student_email) INTO v_student_name
   FROM public.profiles WHERE id=r.student_id;
   v_student_name:=coalesce(v_student_name,v_student_email);

   INSERT INTO public.buddy_assigned_pairs(
     program_id,mentor_id,student_email,student_label,student_id,status
   )
   VALUES(
     r.program_id,r.mentor_id,v_student_email,v_student_name,r.student_id,'confirmed'
   )
   ON CONFLICT(program_id,mentor_id,student_email) DO UPDATE SET
     student_label=excluded.student_label,
     student_id=excluded.student_id,
     status='confirmed';

   UPDATE public.buddy_first_year_access_requests
   SET status='verified',reviewed_at=now(),reviewed_by=auth.uid()
   WHERE id=r.id;

   INSERT INTO public.notifications(user_id,type,title,body,payload)
   VALUES(
     r.student_id,
     'new_match',
     'Buddy Program access verified',
     'Your assigned Buddy confirmed you. Buddy Program is now open.',
     jsonb_build_object(
       'kind','buddy_first_year_status',
       'status','verified',
       'request_id',r.id,
       'program_id',r.program_id
     )
   );
 ELSE
   UPDATE public.buddy_first_year_access_requests
   SET status='not_confirmed',reviewed_at=now(),reviewed_by=auth.uid()
   WHERE id=r.id;

   INSERT INTO public.notifications(user_id,type,title,body,payload)
   VALUES(
     r.student_id,
     'new_match',
     'Buddy verification needs an update',
     'Check the Buddy email you entered or ask your program admin for help.',
     jsonb_build_object(
       'kind','buddy_first_year_status',
       'status','not_confirmed',
       'request_id',r.id,
       'program_id',r.program_id
     )
   );
 END IF;

 UPDATE public.notifications
 SET read_at=coalesce(read_at,now()),
     payload=payload||jsonb_build_object(
       'resolved',CASE WHEN p_accept THEN 'verified' ELSE 'not_confirmed' END
     )
 WHERE user_id=r.mentor_id
   AND type='new_match'
   AND payload->>'kind'='buddy_first_year_verification'
   AND payload->>'request_id'=r.id::text
   AND read_at IS NULL;
END;
$$;

-- When an admin approves/restores an upper year mentor, waiting first year
-- requests automatically become actionable and the mentor receives one notification.
CREATE OR REPLACE FUNCTION public.buddy_first_year_wake_mentor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
   WITH moved AS (
     UPDATE public.buddy_first_year_access_requests
     SET status='pending_verification',notified_at=now()
     WHERE program_id=NEW.program_id
       AND mentor_id=NEW.user_id
       AND status='waiting_mentor_approval'
     RETURNING id,program_id,mentor_id
   )
   INSERT INTO public.notifications(user_id,type,title,body,payload)
   SELECT mentor_id,'new_match','Buddy verification request',
          'A first year student says you are their assigned Buddy.',
          jsonb_build_object(
            'kind','buddy_first_year_verification',
            'request_id',id,
            'program_id',program_id
          )
   FROM moved;
 END IF;
 RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buddy_first_year_wake_mentor
  ON public.buddy_upper_applications;

CREATE TRIGGER trg_buddy_first_year_wake_mentor
AFTER UPDATE OF status ON public.buddy_upper_applications
FOR EACH ROW
EXECUTE FUNCTION public.buddy_first_year_wake_mentor();

-- Old clients may still call direct first year join. Never allow self-declaration.
CREATE OR REPLACE FUNCTION public.buddy_choice_join(p_program uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;
 IF EXISTS(
   SELECT 1 FROM public.buddy_upper_applications
   WHERE program_id=p_program AND user_id=auth.uid()
 ) THEN
   RAISE EXCEPTION 'This account is already on the upper year application track. Contact the program admin if your year needs correction.';
 END IF;
 RAISE EXCEPTION 'First year access requires verification by your assigned upper year Buddy.';
END;
$$;

-- Existing members cannot self-switch from upper to first and bypass mentor verification.
CREATE OR REPLACE FUNCTION public.buddy_choice_change_year(p_program uuid,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.buddy_choice_members;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('first','upper') THEN RAISE EXCEPTION 'Choose first year or upper year.'; END IF;
 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,11));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,12));

 SELECT * INTO existing
 FROM public.buddy_choice_members
 WHERE program_id=p_program AND user_id=auth.uid()
 FOR UPDATE;

 IF NOT FOUND THEN RAISE EXCEPTION 'Join the Buddy Program first.'; END IF;
 IF NOT existing.active THEN RAISE EXCEPTION 'Your participation is paused. Contact the coordinator for help.'; END IF;
 IF existing.role=p_role THEN RETURN; END IF;

 IF p_role='first' THEN
   RAISE EXCEPTION 'First year access requires verification by your assigned upper year Buddy. Ask the program admin to correct your year if needed.';
 END IF;

 IF NOT EXISTS(
   SELECT 1 FROM public.buddy_programs
   WHERE id=p_program AND choice_enabled
 ) THEN RAISE EXCEPTION 'Year changes are paused by the program coordinator.'; END IF;

 IF NOT EXISTS(
   SELECT 1 FROM public.buddy_upper_applications
   WHERE program_id=p_program
     AND user_id=auth.uid()
     AND status='approved'
 ) THEN
   RAISE EXCEPTION 'Upper year access requires program admin approval.';
 END IF;

 IF EXISTS(
   SELECT 1 FROM public.buddy_assigned_pairs
   WHERE program_id=p_program
     AND student_id=auth.uid()
     AND status IN ('pending','confirmed')
 ) THEN
   RAISE EXCEPTION 'You have a school Buddy pairing. Ask your coordinator to correct your year and keep your conversations together.';
 END IF;

 IF EXISTS(
   SELECT 1 FROM public.buddy_choice_invites
   WHERE program_id=p_program
     AND auth.uid() IN (upper_id,first_id)
     AND status IN ('pending','accepted')
 ) THEN
   RAISE EXCEPTION 'You have a Buddy invitation or connection. Resolve it in Community or ask your coordinator to help correct your year.';
 END IF;

 IF EXISTS(
   SELECT 1 FROM public.buddy_choice_posts
   WHERE program_id=p_program
     AND user_id=auth.uid()
     AND active
 ) THEN
   RAISE EXCEPTION 'You have a published Buddy post. Remove it in My posts before changing your year.';
 END IF;

 UPDATE public.buddy_choice_members
 SET role='upper'
 WHERE program_id=p_program AND user_id=auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_first_year_request(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_first_year_access_state(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_first_year_verify(uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_choice_join(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_choice_change_year(uuid,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.buddy_first_year_request(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_first_year_access_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_first_year_verify(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_join(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_change_year(uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
