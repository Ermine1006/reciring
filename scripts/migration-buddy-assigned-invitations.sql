-- Founder runs manually after migration-buddy-first-year-mentor-verification.sql
-- and migration-buddy-assigned-withdraw.sql. Safe to rerun.
-- Discover existing invitations by the signed-in account's verified email.
-- Reading an invitation does not enrol the student or confirm the pairing.
BEGIN;

CREATE OR REPLACE FUNCTION public.buddy_assigned_invitations(p_program uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'program_id',p.program_id,'program_name',bp.name,
  'mentor_name',coalesce(nullif(pr.name,''),'Your upper year Buddy'),
  'can_accept',reason.message IS NULL,'unavailable_reason',reason.message
 ) ORDER BY p.created_at,p.id),'[]'::jsonb) INTO result
 FROM buddy_assigned_pairs p
 JOIN auth.users u ON u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
  AND lower(u.email)=lower(p.student_email)
 JOIN buddy_programs bp ON bp.id=p.program_id AND bp.choice_enabled
 JOIN buddy_choice_members mentor ON mentor.program_id=p.program_id
  AND mentor.user_id=p.mentor_id AND mentor.role='upper' AND mentor.active
 JOIN buddy_upper_applications approval ON approval.program_id=p.program_id
  AND approval.user_id=p.mentor_id AND approval.status='approved'
 LEFT JOIN profiles pr ON pr.id=p.mentor_id
 LEFT JOIN buddy_choice_members own ON own.program_id=p.program_id AND own.user_id=auth.uid()
 CROSS JOIN LATERAL (SELECT CASE
  WHEN EXISTS(SELECT 1 FROM buddy_upper_applications a WHERE a.program_id=p.program_id AND a.user_id=auth.uid())
    OR own.role='upper' THEN 'Your account is on the upper year track. Ask the program admin to correct your year before accepting.'
  WHEN own.active=false THEN 'Your Buddy Program access is paused. Ask the program admin for help.'
  WHEN EXISTS(SELECT 1 FROM buddy_assigned_pairs other WHERE other.program_id=p.program_id AND other.student_id=auth.uid() AND other.status='confirmed')
    THEN 'You already have a confirmed Buddy. Ask the program admin to correct the pairing.'
  ELSE NULL END AS message) reason
 WHERE p.status='pending' AND (p_program IS NULL OR p.program_id=p_program)
  AND (p.student_id IS NULL OR p.student_id=auth.uid())
  AND p.mentor_id<>auth.uid()
  AND buddy_choice_allowed(p.program_id,p.mentor_id,auth.uid());
 RETURN jsonb_build_object('invitations',result);
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_respond(p_pair uuid,p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p buddy_assigned_pairs; verified_email text; existing_role text; existing_active boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_accept IS NULL THEN RAISE EXCEPTION 'Choose whether to accept this invitation.'; END IF;
 SELECT lower(email) INTO verified_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 SELECT * INTO p FROM buddy_assigned_pairs WHERE id=p_pair FOR UPDATE;
 IF p.id IS NULL OR p.status<>'pending' OR verified_email IS NULL
  OR lower(p.student_email) IS DISTINCT FROM verified_email
  OR (p.student_id IS NOT NULL AND p.student_id<>auth.uid()) OR p.mentor_id=auth.uid() THEN
  RAISE EXCEPTION 'This Buddy invitation is no longer available.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p.program_id::text,12));
 IF NOT buddy_choice_allowed(p.program_id,p.mentor_id,auth.uid())
  OR NOT EXISTS(SELECT 1 FROM buddy_programs WHERE id=p.program_id AND choice_enabled)
  OR NOT EXISTS(SELECT 1 FROM buddy_choice_members m JOIN buddy_upper_applications a
   ON a.program_id=m.program_id AND a.user_id=m.user_id
   WHERE m.program_id=p.program_id AND m.user_id=p.mentor_id AND m.role='upper' AND m.active AND a.status='approved') THEN
  RAISE EXCEPTION 'This Buddy invitation is no longer available.';
 END IF;
 IF NOT p_accept THEN
  UPDATE buddy_assigned_pairs SET status='declined',student_id=auth.uid() WHERE id=p.id;
  RETURN jsonb_build_object('program_id',p.program_id,'pair_id',p.id,'status','declined');
 END IF;
 SELECT role,active INTO existing_role,existing_active FROM buddy_choice_members
 WHERE program_id=p.program_id AND user_id=auth.uid() FOR UPDATE;
 IF existing_role='upper' OR EXISTS(SELECT 1 FROM buddy_upper_applications WHERE program_id=p.program_id AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Your account is on the upper year track. Ask the program admin to correct your year before accepting.';
 END IF;
 IF existing_active=false THEN RAISE EXCEPTION 'Your Buddy Program access is paused. Ask the program admin for help.'; END IF;
 IF EXISTS(SELECT 1 FROM buddy_assigned_pairs WHERE program_id=p.program_id AND student_id=auth.uid() AND status='confirmed') THEN
  RAISE EXCEPTION 'You already have a confirmed Buddy. Ask the program admin to correct the pairing.';
 END IF;
 INSERT INTO buddy_choice_members(program_id,user_id,role,active)
 VALUES(p.program_id,auth.uid(),'first',true) ON CONFLICT(program_id,user_id) DO NOTHING;
 UPDATE buddy_assigned_pairs SET status='confirmed',student_id=auth.uid() WHERE id=p.id;

 -- Close a redundant student-initiated access request in the same transaction.
 UPDATE buddy_first_year_access_requests
 SET status=CASE WHEN mentor_id=p.mentor_id THEN 'verified' ELSE 'cancelled' END,
  reviewed_at=now(),reviewed_by=CASE WHEN mentor_id=p.mentor_id THEN p.mentor_id ELSE NULL END
 WHERE program_id=p.program_id AND student_id=auth.uid()
  AND status IN ('pending_verification','waiting_mentor_approval');
 UPDATE notifications n SET read_at=coalesce(n.read_at,now()),
  payload=n.payload||jsonb_build_object('resolved','assigned_pairing_accepted')
 WHERE n.payload->>'kind'='buddy_first_year_verification'
  AND n.payload->>'request_id' IN (SELECT id::text FROM buddy_first_year_access_requests
   WHERE program_id=p.program_id AND student_id=auth.uid() AND status IN ('verified','cancelled'));
 RETURN jsonb_build_object('program_id',p.program_id,'pair_id',p.id,'status','confirmed');
END; $$;
REVOKE ALL ON FUNCTION public.buddy_assigned_invitations(uuid),public.buddy_assigned_respond(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_assigned_invitations(uuid),public.buddy_assigned_respond(uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
