-- Founder runs manually in Supabase SQL Editor.
-- Apply AFTER migration-buddy-upper-approval.sql.
--
-- Security fix: once a user has submitted an upper year application,
-- they cannot self-enrol as first year to bypass admin approval.
-- The UI also locks them to the upper year application track, but this
-- database guard protects against stale clients and direct RPC calls.
BEGIN;

CREATE OR REPLACE FUNCTION public.buddy_choice_join(p_program uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Please sign in.';
 END IF;

 IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN
   RAISE EXCEPTION 'Join your student community first.';
 END IF;

 IF NOT EXISTS(
   SELECT 1
   FROM public.buddy_programs
   WHERE id=p_program
     AND choice_enabled
 ) THEN
   RAISE EXCEPTION 'Posting is paused.';
 END IF;

 -- An upper year application is a prior explicit declaration of year.
 -- Do not let the same account switch itself into the first year path
 -- while that application remains on record, regardless of review status.
 IF EXISTS(
   SELECT 1
   FROM public.buddy_upper_applications
   WHERE program_id=p_program
     AND user_id=auth.uid()
 ) THEN
   RAISE EXCEPTION 'This account is already on the upper year application track. Contact the program admin if your year needs correction.';
 END IF;

 IF EXISTS(
   SELECT 1
   FROM public.buddy_choice_members
   WHERE program_id=p_program
     AND user_id=auth.uid()
 ) THEN
   RAISE EXCEPTION 'Your role is already registered. Contact the coordinator to change it.';
 END IF;

 INSERT INTO public.buddy_choice_members(
   program_id,
   user_id,
   role,
   active
 )
 VALUES(
   p_program,
   auth.uid(),
   'first',
   true
 );
END;
$$;

REVOKE ALL
ON FUNCTION public.buddy_choice_join(uuid)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE
ON FUNCTION public.buddy_choice_join(uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
