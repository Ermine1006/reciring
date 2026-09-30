-- Founder runs manually in Supabase SQL Editor.
-- Adds a reversible history state for pending school-assigned Buddy pairings.
-- Upper year mentors may withdraw only their own pending pairing requests.
-- Withdrawn rows are retained for admin/history but hidden from both users.
BEGIN;

-- Expand the status check without deleting any pairing history.
ALTER TABLE public.buddy_assigned_pairs
  DROP CONSTRAINT IF EXISTS buddy_assigned_pairs_status_check;

ALTER TABLE public.buddy_assigned_pairs
  ADD CONSTRAINT buddy_assigned_pairs_status_check
  CHECK (status IN ('pending','confirmed','declined','withdrawn'));

-- A withdrawn pairing should disappear from both participants' normal state.
-- Also avoid claiming a verified student account onto a withdrawn row.
CREATE OR REPLACE FUNCTION public.buddy_assigned_state(p_program uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; verified_email text;
BEGIN
 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;

 SELECT lower(email) INTO verified_email
 FROM auth.users
 WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;

 UPDATE buddy_assigned_pairs
 SET student_id=auth.uid()
 WHERE program_id=p_program
   AND student_email=verified_email
   AND student_id IS NULL
   AND mentor_id<>auth.uid()
   AND status<>'withdrawn';

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'status',p.status,
  'name',CASE WHEN p.mentor_id=auth.uid()
    THEN CASE WHEN p.status='confirmed'
      THEN coalesce(nullif(pr.name,''),nullif(p.student_label,''),p.student_email)
      ELSE coalesce(nullif(p.student_label,''),p.student_email)
    END
    ELSE coalesce(nullif(pr.name,''),'Your Buddy')
  END,
  'email',CASE WHEN p.mentor_id=auth.uid() THEN p.student_email ELSE NULL END,
  'requests',CASE WHEN public.buddy_assigned_access(p.id) THEN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'body',r.body,'resolved',r.resolved,'created_at',r.created_at,
      'replied',EXISTS(
        SELECT 1 FROM buddy_assigned_replies a
        WHERE a.request_id=r.id AND a.author_id=p.mentor_id
      ),
      'replies',coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id',a.id,'body',a.body,'mine',a.author_id=auth.uid(),
          'name',coalesce(ap.name,'Buddy'),'created_at',a.created_at
        ) ORDER BY a.created_at,a.id)
        FROM buddy_assigned_replies a
        LEFT JOIN profiles ap ON ap.id=a.author_id
        WHERE a.request_id=r.id
      ),'[]'::jsonb)
    ) ORDER BY r.created_at DESC,r.id)
    FROM buddy_assigned_requests r
    WHERE r.pair_id=p.id
  ),'[]'::jsonb) ELSE '[]'::jsonb END
 ) ORDER BY p.created_at,p.id),'[]'::jsonb)
 INTO result
 FROM buddy_assigned_pairs p
 LEFT JOIN profiles pr
   ON pr.id=CASE WHEN p.mentor_id=auth.uid() THEN p.student_id ELSE p.mentor_id END
 WHERE p.program_id=p_program
   AND p.status<>'withdrawn'
   AND auth.uid() IN(p.mentor_id,p.student_id)
   AND EXISTS(
     SELECT 1 FROM buddy_choice_members m
     WHERE m.program_id=p.program_id
       AND m.user_id=p.mentor_id
       AND m.role='upper'
       AND m.active
   )
   AND EXISTS(
     SELECT 1 FROM buddy_choice_members m
     WHERE m.program_id=p.program_id
       AND m.user_id=auth.uid()
       AND m.active
   )
   AND (p.student_id IS NULL OR public.buddy_choice_allowed(p.program_id,p.mentor_id,p.student_id));

 RETURN jsonb_build_object('pairs',result);
END; $$;

-- Re-adding the same school email after a withdrawal creates a fresh pending
-- request on the retained row instead of silently doing nothing.
CREATE OR REPLACE FUNCTION public.buddy_assigned_add(p_program uuid,p_students jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; email_address text; own_email text;
BEGIN
 IF NOT public.buddy_choice_member(p_program,auth.uid())
 OR NOT EXISTS(
   SELECT 1 FROM buddy_choice_members
   WHERE program_id=p_program AND user_id=auth.uid() AND role='upper' AND active
 ) THEN RAISE EXCEPTION 'Join as an upper year student first.'; END IF;

 IF NOT EXISTS(
   SELECT 1 FROM buddy_programs
   WHERE id=p_program AND choice_enabled
 ) THEN RAISE EXCEPTION 'The program is paused.'; END IF;

 IF jsonb_typeof(p_students) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Add your students first.';
 END IF;

 IF jsonb_array_length(p_students) NOT BETWEEN 1 AND 10 OR length(p_students::text)>6000 THEN
   RAISE EXCEPTION 'Add up to ten school emails at a time.';
 END IF;

 SELECT lower(email) INTO own_email FROM auth.users WHERE id=auth.uid();
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,12));

 FOR item IN SELECT * FROM jsonb_array_elements(p_students) LOOP
  email_address:=lower(trim(item->>'email'));

  IF email_address IS NULL
    OR length(email_address)>254
    OR email_address !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
    OR email_address=own_email
    OR length(coalesce(item->>'name',''))>100
  THEN RAISE EXCEPTION 'Check each student name and email.'; END IF;

  INSERT INTO buddy_assigned_pairs(
    program_id,mentor_id,student_email,student_label,status
  )
  VALUES(
    p_program,auth.uid(),email_address,trim(coalesce(item->>'name','')),'pending'
  )
  ON CONFLICT(program_id,mentor_id,student_email) DO UPDATE SET
    student_label=excluded.student_label,
    status=CASE
      WHEN buddy_assigned_pairs.status='withdrawn' THEN 'pending'
      ELSE buddy_assigned_pairs.status
    END;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_withdraw(p_pair uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.buddy_assigned_pairs;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;

 SELECT * INTO p
 FROM public.buddy_assigned_pairs
 WHERE id=p_pair
 FOR UPDATE;

 IF NOT FOUND
   OR p.mentor_id<>auth.uid()
   OR p.status<>'pending'
 THEN
   RAISE EXCEPTION 'Only your pending pairing request can be withdrawn.';
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(p.program_id::text,12));

 UPDATE public.buddy_assigned_pairs
 SET status='withdrawn'
 WHERE id=p.id;
END; $$;

REVOKE ALL ON FUNCTION public.buddy_assigned_withdraw(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_assigned_withdraw(uuid) TO authenticated;

-- Reassert replaced RPC grants.
REVOKE ALL ON FUNCTION public.buddy_assigned_state(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_assigned_add(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_assigned_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_assigned_add(uuid,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
