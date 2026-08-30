-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — structured meeting details on a Practice session
--
-- Today a link is already stored in the existing structured columns
-- (location_type = 'virtual', location_detail = the URL), which carry
-- the participants-only RLS the session already has. That works, but
-- the PLATFORM is only inferable from the link's host and nothing
-- stops a malformed value being written.
--
-- This migration makes the meeting explicit:
--   meeting_method    teams | zoom | in_person | other_video
--   meeting_url       required for the online methods, https only
--   meeting_location  for in person, optional
--
-- NO OAUTH, NO MEETING CREATION, NO CALENDAR INVITATIONS. The sender
-- makes the meeting in Teams or Zoom and pastes the link.
--
-- PRIVACY: these columns live on practice_sessions, whose SELECT
-- policy is already "participants read". No new grant is added, and
-- browse_practice_requests (the anonymous community surface) does not
-- read the sessions table at all, so a link cannot leak through it.
--
-- HISTORY: existing rows get NULL and read "Meeting details not
-- recorded". Nothing is inferred from old chat messages. The
-- location_detail values already in place keep working through the
-- frontend's fallback, and are NOT copied into the new columns:
-- copying an unvalidated free-text field into a validated one would
-- be inventing structure that was never captured.
--
-- Idempotent. Rollback at the bottom.
-- Assertions: scripts/practice-assertions-meeting-links.sql
-- ============================================================

-- ── 1. The columns ───────────────────────────────────────────────
ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS meeting_method   text,
  ADD COLUMN IF NOT EXISTS meeting_url      text,
  ADD COLUMN IF NOT EXISTS meeting_location text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_meeting_method_valid') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_meeting_method_valid
      CHECK (meeting_method IS NULL
             OR meeting_method IN ('teams','zoom','in_person','other_video'));
  END IF;

  -- an online meeting must carry an https link, and never a
  -- javascript:, data:, file: or app protocol
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_meeting_url_shape') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_meeting_url_shape
      CHECK (meeting_url IS NULL
             OR (meeting_url ~ '^https://[^[:space:]/@]+\.[^[:space:]/@]+'
                 AND char_length(meeting_url) <= 500));
  END IF;

  -- online needs a url; in person must not carry one
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_meeting_url_required') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_meeting_url_required
      CHECK (meeting_method IS NULL
             OR (meeting_method = 'in_person' AND meeting_url IS NULL)
             OR (meeting_method <> 'in_person' AND meeting_url IS NOT NULL));
  END IF;

  -- the host must match the platform that was claimed
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_meeting_host_matches') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_meeting_host_matches
      CHECK (
        meeting_url IS NULL
        OR meeting_method = 'other_video'
        OR (meeting_method = 'teams' AND meeting_url ~* '^https://([a-z0-9-]+\.)*(teams\.microsoft\.com|teams\.live\.com|teams\.microsoft\.us)(/|$)')
        OR (meeting_method = 'zoom'  AND meeting_url ~* '^https://([a-z0-9-]+\.)*(zoom\.us|zoom\.com)(/|$)')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_meeting_location_shape') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_meeting_location_shape
      CHECK (meeting_location IS NULL
             OR (char_length(meeting_location) <= 300
                 AND (meeting_method IS NULL OR meeting_method = 'in_person')));
  END IF;
END $$;

-- No index: meeting details are read with the session row that the
-- participant already fetched by id or by participant, never searched.

-- ── 2. propose_practice_session records the meeting ──────────────
-- Same name, same existing parameters, three optional additions. The
-- 9-argument version is dropped first so no ambiguous overload exists.
DROP FUNCTION IF EXISTS public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.propose_practice_session(
  p_pairing_id       uuid,
  p_scheduled_start  timestamptz,
  p_duration_minutes integer  DEFAULT 60,
  p_timezone         text     DEFAULT 'America/Toronto',
  p_location_type    text     DEFAULT 'virtual',
  p_location_detail  text     DEFAULT '',
  p_session_mode       text   DEFAULT NULL,
  p_interview_category text   DEFAULT NULL,
  p_skill_focus        text   DEFAULT NULL,
  p_meeting_method     text   DEFAULT NULL,
  p_meeting_url        text   DEFAULT NULL,
  p_meeting_location   text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_session public.practice_sessions%ROWTYPE;
  v_other   uuid;
  v_minutes integer := p_duration_minutes;
  v_url     text := nullif(btrim(coalesce(p_meeting_url, '')), '');
  v_loc     text := nullif(btrim(coalesce(p_meeting_location, '')), '');
  v_type    text := p_location_type;
  v_detail  text := p_location_detail;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF auth.uid() NOT IN (v_pairing.requester_user_id, v_pairing.addressee_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_pairing.status <> 'accepted' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF NOT public.practice_is_community_eligible(auth.uid(), v_pairing.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;
  IF p_scheduled_start <= now() THEN RAISE EXCEPTION 'start_in_past'; END IF;

  IF p_session_mode IS NOT NULL THEN
    IF p_session_mode NOT IN ('full_mock_swap','quick_skill_drill') THEN
      RAISE EXCEPTION 'invalid_session_mode';
    END IF;
    IF p_interview_category IS NULL THEN RAISE EXCEPTION 'category_required'; END IF;
    IF p_interview_category NOT IN ('case','behavioural') THEN
      RAISE EXCEPTION 'invalid_interview_category';
    END IF;
    IF p_session_mode = 'quick_skill_drill' AND p_skill_focus IS NULL THEN
      RAISE EXCEPTION 'skill_focus_required';
    END IF;
    v_minutes := CASE p_session_mode WHEN 'full_mock_swap' THEN 75 ELSE 30 END;
  ELSIF p_interview_category IS NOT NULL OR p_skill_focus IS NOT NULL THEN
    RAISE EXCEPTION 'session_mode_required';
  END IF;

  -- the meeting, validated here as well as by the CHECK constraints
  IF p_meeting_method IS NOT NULL THEN
    IF p_meeting_method NOT IN ('teams','zoom','in_person','other_video') THEN
      RAISE EXCEPTION 'invalid_meeting_method';
    END IF;
    IF p_meeting_method = 'in_person' THEN
      IF v_url IS NOT NULL THEN RAISE EXCEPTION 'meeting_url_not_allowed'; END IF;
      v_type := 'in_person';
      v_detail := coalesce(v_loc, '');
    ELSE
      IF v_url IS NULL THEN RAISE EXCEPTION 'meeting_url_required'; END IF;
      IF v_url !~ '^https://' THEN RAISE EXCEPTION 'meeting_url_not_https'; END IF;
      -- credentials in the authority are a phishing shape
      IF split_part(split_part(v_url, '://', 2), '/', 1) LIKE '%@%' THEN
        RAISE EXCEPTION 'meeting_url_has_credentials';
      END IF;
      v_loc := NULL;
      v_type := 'virtual';
      -- the legacy column keeps mirroring the link, so a client that
      -- has not been updated still shows the right thing
      v_detail := v_url;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.practice_sessions
           (pairing_id, community_id,
            participant_a_user_id, participant_b_user_id, created_by_user_id,
            scheduled_start, duration_minutes, timezone,
            location_type, location_detail,
            session_mode, interview_category, skill_focus,
            meeting_method, meeting_url, meeting_location)
    VALUES (v_pairing.id, v_pairing.community_id,
            v_pairing.requester_user_id, v_pairing.addressee_user_id, auth.uid(),
            p_scheduled_start, v_minutes, p_timezone,
            v_type, v_detail,
            p_session_mode, p_interview_category, p_skill_focus,
            p_meeting_method, v_url, v_loc)
    RETURNING * INTO v_session;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'session_already_live';
    WHEN check_violation THEN RAISE EXCEPTION 'invalid_session_agreement';
  END;

  v_other := CASE WHEN auth.uid() = v_pairing.requester_user_id
                  THEN v_pairing.addressee_user_id ELSE v_pairing.requester_user_id END;
  -- the notification body never carries the link
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_other, 'practice_session_proposed',
          'Practice time proposed',
          'Your practice partner proposed a session time — confirm or suggest another',
          jsonb_build_object('pairing_id', p_pairing_id, 'session_id', v_session.id,
                             'community_id', v_pairing.community_id));

  RETURN to_jsonb(v_session);
END $$;

REVOKE ALL ON FUNCTION public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text, text, text, text) TO authenticated;

-- ── 3. Meeting details are immutable once accepted ───────────────
-- There is no update path in this version. To change a link before
-- acceptance the sender withdraws and proposes again; after
-- acceptance the pair cancels and reschedules, which both participants
-- already see.

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- ALTER TABLE public.practice_sessions
--   DROP CONSTRAINT IF EXISTS ps_meeting_location_shape,
--   DROP CONSTRAINT IF EXISTS ps_meeting_host_matches,
--   DROP CONSTRAINT IF EXISTS ps_meeting_url_required,
--   DROP CONSTRAINT IF EXISTS ps_meeting_url_shape,
--   DROP CONSTRAINT IF EXISTS ps_meeting_method_valid;
-- ALTER TABLE public.practice_sessions
--   DROP COLUMN IF EXISTS meeting_location,
--   DROP COLUMN IF EXISTS meeting_url,
--   DROP COLUMN IF EXISTS meeting_method;
-- DROP FUNCTION IF EXISTS public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text, text, text, text);
-- (then re-run the 9-argument propose_practice_session from
--  scripts/migration-practice-session-modes.sql)
-- ============================================================
