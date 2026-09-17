-- Founder runs manually. Pending changes never overwrite a confirmed time until the other person accepts.
BEGIN;
ALTER TABLE public.practice_sessions ADD COLUMN IF NOT EXISTS time_change_id uuid,
 ADD COLUMN IF NOT EXISTS time_change_start timestamptz,
 ADD COLUMN IF NOT EXISTS time_change_by uuid REFERENCES public.profiles(id);
CREATE OR REPLACE FUNCTION public.propose_practice_time_change(p_session_id uuid,p_start timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.practice_sessions%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
 IF auth.uid() NOT IN(s.participant_a_user_id,s.participant_b_user_id) THEN RAISE EXCEPTION 'not_participant'; END IF;
 PERFORM 1 FROM public.practice_pairings WHERE id=s.pairing_id AND status='accepted' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_state'; END IF;
 SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id FOR UPDATE;
 IF s.status<>'scheduled' OR s.scheduled_start<=now() THEN RAISE EXCEPTION 'invalid_state'; END IF;
 IF s.time_change_id IS NOT NULL THEN RAISE EXCEPTION 'pending_change_exists'; END IF;
 IF p_start IS NULL OR NOT isfinite(p_start) OR p_start<=now() OR p_start=s.scheduled_start THEN RAISE EXCEPTION 'invalid_time'; END IF;
 IF EXISTS(SELECT 1 FROM public.blocks WHERE (blocker_id=s.participant_a_user_id AND blocked_user_id=s.participant_b_user_id) OR (blocker_id=s.participant_b_user_id AND blocked_user_id=s.participant_a_user_id)) THEN RAISE EXCEPTION 'not_participant'; END IF;
 UPDATE public.practice_sessions SET time_change_id=gen_random_uuid(),time_change_start=p_start,time_change_by=auth.uid() WHERE id=p_session_id;
END $$;
CREATE OR REPLACE FUNCTION public.respond_practice_time_change(p_session_id uuid,p_change_id uuid,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.practice_sessions%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
 IF auth.uid() NOT IN(s.participant_a_user_id,s.participant_b_user_id) THEN RAISE EXCEPTION 'not_participant'; END IF;
 PERFORM 1 FROM public.practice_pairings WHERE id=s.pairing_id AND status='accepted' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_state'; END IF;
 SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id FOR UPDATE;
 IF s.status<>'scheduled' OR p_change_id IS NULL OR s.time_change_id IS DISTINCT FROM p_change_id OR p_accept IS NULL THEN RAISE EXCEPTION 'invalid_state'; END IF;
 IF p_accept AND (s.time_change_by=auth.uid() OR s.time_change_start<=now() OR s.scheduled_start<=now()) THEN RAISE EXCEPTION 'cannot_accept_change'; END IF;
 IF EXISTS(SELECT 1 FROM public.blocks WHERE (blocker_id=s.participant_a_user_id AND blocked_user_id=s.participant_b_user_id) OR (blocker_id=s.participant_b_user_id AND blocked_user_id=s.participant_a_user_id)) THEN RAISE EXCEPTION 'not_participant'; END IF;
 UPDATE public.practice_sessions SET scheduled_start=CASE WHEN p_accept THEN time_change_start ELSE scheduled_start END,
 confirmed_at=CASE WHEN p_accept THEN now() ELSE confirmed_at END,time_change_id=NULL,time_change_start=NULL,time_change_by=NULL WHERE id=p_session_id;
END $$;
REVOKE ALL ON FUNCTION public.propose_practice_time_change(uuid,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.respond_practice_time_change(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.propose_practice_time_change(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_practice_time_change(uuid,uuid,boolean) TO authenticated;
COMMIT;
