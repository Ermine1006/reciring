-- Founder runs manually. Add a participant-only editor for scheduled virtual sessions.
-- Compatible with both legacy location fields and optional structured meeting columns.
BEGIN;
CREATE OR REPLACE FUNCTION public.update_practice_meeting_link(p_session_id uuid,p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.practice_sessions%ROWTYPE; v_url text:=btrim(p_url); v_method text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN(s.participant_a_user_id,s.participant_b_user_id) THEN RAISE EXCEPTION 'not_participant'; END IF;
  PERFORM 1 FROM public.practice_pairings WHERE id=s.pairing_id AND status='accepted' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_state'; END IF;
  SELECT * INTO s FROM public.practice_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR s.status<>'scheduled' OR s.location_type<>'virtual' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF EXISTS(SELECT 1 FROM public.blocks WHERE
    (blocker_id=s.participant_a_user_id AND blocked_user_id=s.participant_b_user_id) OR
    (blocker_id=s.participant_b_user_id AND blocked_user_id=s.participant_a_user_id)) THEN RAISE EXCEPTION 'not_participant'; END IF;
  IF v_url IS NULL OR length(v_url)>500 OR v_url ~ '[[:space:][:cntrl:]]' OR
    v_url !~* '^https://(([a-z0-9-]+\.)*(zoom\.us|zoom\.com)|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|teams\.cloud\.microsoft)/[^/?#][^[:space:]]*$'
    THEN RAISE EXCEPTION 'invalid_meeting_link'; END IF;
  v_method:=CASE WHEN v_url ~* '^https://([a-z0-9-]+\.)*(zoom\.us|zoom\.com)/' THEN 'zoom'
    WHEN v_url ~* '^https://(teams\.microsoft\.com|teams\.live\.com)/' THEN 'teams' ELSE 'other_video' END;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='practice_sessions'
      AND column_name IN('meeting_method','meeting_url','meeting_location'))=3 THEN
    EXECUTE 'UPDATE public.practice_sessions SET location_detail=$1,meeting_method=$2,meeting_url=$1,meeting_location=NULL WHERE id=$3'
      USING v_url,v_method,p_session_id;
  ELSE
    UPDATE public.practice_sessions SET location_detail=v_url WHERE id=p_session_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_practice_meeting_link(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_practice_meeting_link(uuid,text) TO authenticated;
COMMIT;
