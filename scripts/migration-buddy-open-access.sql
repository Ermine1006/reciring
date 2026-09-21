-- Founder: run in Supabase SQL Editor after migration-buddy-choice.sql.
-- Additive and safe to rerun. Existing posts, memberships and invitations stay intact.
BEGIN;

CREATE OR REPLACE FUNCTION public.buddy_choice_join_upper(p_program uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.buddy_choice_members;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF NOT buddy_choice_member(p_program,auth.uid()) THEN
  RAISE EXCEPTION 'Join your student community first.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_program::text,11));
 IF NOT EXISTS(SELECT 1 FROM buddy_programs WHERE id=p_program AND choice_enabled) THEN
  RAISE EXCEPTION 'Joining is paused by the program coordinator.';
 END IF;
 SELECT * INTO existing FROM buddy_choice_members
  WHERE program_id=p_program AND user_id=auth.uid() FOR UPDATE;
 IF FOUND THEN
  -- A signup retry must not bypass a suspension or silently change a student's role.
  IF NOT existing.active THEN
   RAISE EXCEPTION 'Your participation is paused. Contact the coordinator for help.';
  END IF;
  IF existing.role='upper' THEN RETURN; END IF;
  RAISE EXCEPTION 'You are already registered as a first year student. Contact the coordinator to correct your year.';
 END IF;
 -- Year is self declared. No coordinator approval is required.
 INSERT INTO buddy_choice_members(program_id,user_id,role,active)
 VALUES(p_program,auth.uid(),'upper',true);
END; $$;

REVOKE ALL ON FUNCTION public.buddy_choice_join_upper(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_join_upper(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
