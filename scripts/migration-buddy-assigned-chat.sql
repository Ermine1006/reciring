-- Run manually in Supabase SQL Editor after migration-buddy-assigned.sql
-- and the existing matches / identity reveal migrations. Rerunnable.
BEGIN;

ALTER TABLE public.buddy_assigned_pairs
 ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.buddy_assigned_open_chat(p_pair uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p buddy_assigned_pairs; chat_id uuid;
BEGIN
 SELECT * INTO p FROM buddy_assigned_pairs WHERE id=p_pair FOR UPDATE;
 IF p.id IS NULL OR NOT buddy_assigned_access(p_pair) THEN
  RAISE EXCEPTION 'Confirm your Buddy pairing before opening this chat.';
 END IF;

 -- Serialize both participants opening the same confirmed pairing.
 -- A saved chat is never silently replaced or revived after an unmatch.
 IF p.match_id IS NOT NULL THEN
  SELECT id INTO chat_id FROM matches
  WHERE id=p.match_id AND status IN ('active','completed')
   AND identity_reveal_status='accepted'
   AND ((requester_user_id=p.mentor_id AND helper_user_id=p.student_id)
     OR (requester_user_id=p.student_id AND helper_user_id=p.mentor_id));
  IF chat_id IS NULL THEN
   RAISE EXCEPTION 'This conversation has ended. Your Buddy questions are still available.';
  END IF;
 ELSE
  -- Reuse a conversation where these two people have already shared their
  -- identities. Never reveal an anonymous conversation through this shortcut.
  SELECT id INTO chat_id FROM matches
  WHERE status IN ('active','completed') AND identity_reveal_status='accepted'
   AND ((requester_user_id=p.mentor_id AND helper_user_id=p.student_id)
     OR (requester_user_id=p.student_id AND helper_user_id=p.mentor_id))
  ORDER BY created_at DESC,id LIMIT 1;

  IF chat_id IS NULL THEN
   INSERT INTO matches(requester_user_id,helper_user_id,status,source,
    identity_reveal_status,identity_reveal_accepted_at)
   VALUES(p.student_id,p.mentor_id,'active','buddy','accepted',now())
   RETURNING id INTO chat_id;
  END IF;
  UPDATE buddy_assigned_pairs SET match_id=chat_id WHERE id=p.id;
 END IF;
 RETURN jsonb_build_object('match_id',chat_id);
END; $$;

REVOKE ALL ON FUNCTION public.buddy_assigned_open_chat(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_assigned_open_chat(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
