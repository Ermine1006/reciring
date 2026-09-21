-- Founder runs manually after migration-buddy-assigned.sql.
-- Rerunnable. Preserves posts, invitations, pairings and private conversations.
BEGIN;

CREATE OR REPLACE FUNCTION public.buddy_choice_change_year(p_program uuid,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.buddy_choice_members;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('first','upper') THEN RAISE EXCEPTION 'Choose first year or upper year.'; END IF;
 IF NOT buddy_choice_member(p_program,auth.uid()) THEN RAISE EXCEPTION 'Join your student community first.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,11));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,12));
 SELECT * INTO existing FROM buddy_choice_members
 WHERE program_id=p_program AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Join the Buddy Program first.'; END IF;
 IF NOT existing.active THEN RAISE EXCEPTION 'Your participation is paused. Contact the coordinator for help.'; END IF;
 IF existing.role=p_role THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM buddy_programs WHERE id=p_program AND choice_enabled) THEN
  RAISE EXCEPTION 'Year changes are paused by the program coordinator.';
 END IF;
 IF EXISTS(SELECT 1 FROM buddy_assigned_pairs WHERE program_id=p_program
  AND ((p_role='first' AND mentor_id=auth.uid()) OR (p_role='upper' AND student_id=auth.uid()))
  AND status IN ('pending','confirmed')) THEN
  RAISE EXCEPTION 'You have a school Buddy pairing. Ask your coordinator to correct your year and keep your conversations together.';
 END IF;
 IF EXISTS(SELECT 1 FROM buddy_choice_invites WHERE program_id=p_program
  AND auth.uid() IN (upper_id,first_id) AND status IN ('pending','accepted')) THEN
  RAISE EXCEPTION 'You have a Buddy invitation or connection. Resolve it in Community or ask your coordinator to help correct your year.';
 END IF;
 IF EXISTS(SELECT 1 FROM buddy_choice_posts WHERE program_id=p_program AND user_id=auth.uid() AND active) THEN
  RAISE EXCEPTION 'You have a published Buddy post. Remove it in My posts before changing your year.';
 END IF;
 UPDATE buddy_choice_members SET role=p_role WHERE program_id=p_program AND user_id=auth.uid();
END; $$;

REVOKE ALL ON FUNCTION public.buddy_choice_change_year(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_change_year(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
