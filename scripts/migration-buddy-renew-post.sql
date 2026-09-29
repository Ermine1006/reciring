-- Founder runs manually in Supabase SQL Editor.
-- Adds a narrow renewal action for an expired first year Buddy post.
-- The post body, audience, anonymity, tags and invitation history stay unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.buddy_choice_renew_post(p_post uuid,p_days integer DEFAULT 7)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE s public.buddy_choice_posts;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Choose a renewal between 1 and 30 days.'; END IF;

 SELECT * INTO s
 FROM public.buddy_choice_posts
 WHERE id=p_post AND user_id=auth.uid()
 FOR UPDATE;

 IF NOT FOUND OR NOT s.active THEN RAISE EXCEPTION 'Post not available.'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.buddy_choice_members m
   WHERE m.program_id=s.program_id AND m.user_id=auth.uid()
     AND m.role='first' AND m.active
 ) THEN RAISE EXCEPTION 'First year student access required.'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.buddy_programs bp
   WHERE bp.id=s.program_id AND bp.choice_enabled
 ) THEN RAISE EXCEPTION 'Posting is paused.'; END IF;
 IF EXISTS(
   SELECT 1 FROM public.buddy_choice_invites i
   WHERE i.program_id=s.program_id AND i.first_id=auth.uid()
     AND i.status='accepted'
 ) THEN RAISE EXCEPTION 'This post already has an accepted buddy.'; END IF;

 UPDATE public.buddy_choice_posts
 SET payload=jsonb_set(
   payload,
   '{expiresAt}',
   to_jsonb((now()+make_interval(days=>p_days))::timestamptz),
   true
 )
 WHERE id=s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_choice_renew_post(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buddy_choice_renew_post(uuid,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
