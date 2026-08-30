-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — Practice session modes  (Step 2)
--
-- Two reciprocal modes, agreed when the session is scheduled:
--   full_mock_swap     one full mock round each, then feedback
--   quick_skill_drill  one selected skill, practised by both
--
-- WHY SESSION-LEVEL, NOT A ROUNDS TABLE
-- Mode, interview category and skill focus describe the SHARED
-- agreement, not one person's round. The existing confirmations
-- already prove each participant completed both reciprocal roles
-- (practice_session_confirmations.completed_own_round and
-- .completed_partner_round, with psc_completed_is_reciprocal), so a
-- rounds table would add rows without adding a single fact. This
-- migration REPLACES the earlier scripts/migration-practice-rounds.sql
-- proposal, which was never run.
--
-- WHAT DOES NOT CHANGE
--   · verification: submit_practice_confirmation is untouched. First
--     confirmation still leaves the session pending; two compatible
--     'completed' confirmations still verify; a conflict is still
--     'disputed'; a verified session still mints exactly ONE shared
--     Token via UNIQUE(session_id). No second completion system.
--   · scheduling: the same propose → confirm flow and the same
--     timestamptz columns. No second datetime implementation.
--
-- OLD ROWS
-- Existing sessions get NULL mode / category / focus and read
-- "Not recorded" in the Passport forever. There is NO backfill:
-- want_types on a practice_request is matching intent, never proof
-- of what two people actually did.
--
-- Idempotent. Rollback at the bottom.
-- Assertions: scripts/practice-assertions-session-modes.sql
-- ============================================================

-- ── 1. The agreement, on the session ─────────────────────────────
ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS session_mode       text,
  ADD COLUMN IF NOT EXISTS interview_category text,
  ADD COLUMN IF NOT EXISTS skill_focus        text,
  -- optional, private to the two participants, never shown publicly
  ADD COLUMN IF NOT EXISTS session_note       text NOT NULL DEFAULT '';

DO $$
BEGIN
  -- vocabularies mirror src/data/practiceModes.js EXACTLY
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_session_mode_valid') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_session_mode_valid
      CHECK (session_mode IS NULL OR session_mode IN ('full_mock_swap','quick_skill_drill'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_interview_category_valid') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_interview_category_valid
      CHECK (interview_category IS NULL OR interview_category IN ('case','behavioural'));
  END IF;

  -- A mode and a category travel together: a session either carries a
  -- complete agreement or none at all. Half a record is not a record.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_agreement_complete') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_agreement_complete
      CHECK ((session_mode IS NULL AND interview_category IS NULL AND skill_focus IS NULL)
             OR (session_mode IS NOT NULL AND interview_category IS NOT NULL));
  END IF;

  -- A Quick Skill Drill without a focus is just a short interview.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_drill_needs_focus') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_drill_needs_focus
      CHECK (session_mode IS DISTINCT FROM 'quick_skill_drill' OR skill_focus IS NOT NULL);
  END IF;

  -- THE rubric guard: a skill must belong to the chosen category. The
  -- two lists are never merged, in the database or in the UI.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_skill_matches_category') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_skill_matches_category
      CHECK (
        skill_focus IS NULL
        OR (interview_category = 'case' AND skill_focus IN (
              'problem_clarification','hypothesis_development','structuring',
              'quantitative_reasoning','exhibit_interpretation','synthesis',
              'final_recommendation','communication'))
        OR (interview_category = 'behavioural' AND skill_focus IN (
              'story_selection','situation_and_context','personal_actions',
              'results_and_impact','reflection_and_learning','concision',
              'follow_up_questions','executive_presence'))
      );
  END IF;

  -- Duration must match the mode it claims, so no session can promise
  -- a misleading length. Historical rows (mode NULL) keep theirs.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ps_duration_matches_mode') THEN
    ALTER TABLE public.practice_sessions ADD CONSTRAINT ps_duration_matches_mode
      CHECK (
        session_mode IS NULL
        OR (session_mode = 'full_mock_swap'    AND duration_minutes BETWEEN 60 AND 120)
        OR (session_mode = 'quick_skill_drill' AND duration_minutes BETWEEN 30 AND 45)
      );
  END IF;
END $$;

-- Passport reads: "my verified sessions, by mode / category / skill".
CREATE INDEX IF NOT EXISTS idx_ps_agreement
  ON public.practice_sessions (community_id, session_mode, interview_category)
  WHERE session_mode IS NOT NULL;

-- ── 2. propose_practice_session learns the agreement ─────────────
-- Same name, same existing parameters, three optional additions — so
-- a client that sends no agreement keeps working and one that does
-- records it. Validation lives in the database, not only in React.
--
-- The 6-argument version MUST be dropped first: adding parameters
-- creates a SECOND overload, and every existing 2-to-6 argument call
-- would then fail with "function is not unique". Dropping it leaves
-- exactly one function, whose defaults still serve the old call.
DROP FUNCTION IF EXISTS public.propose_practice_session(uuid, timestamptz, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.propose_practice_session(
  p_pairing_id       uuid,
  p_scheduled_start  timestamptz,
  p_duration_minutes integer  DEFAULT 60,
  p_timezone         text     DEFAULT 'America/Toronto',
  p_location_type    text     DEFAULT 'virtual',
  p_location_detail  text     DEFAULT '',
  p_session_mode       text   DEFAULT NULL,
  p_interview_category text   DEFAULT NULL,
  p_skill_focus        text   DEFAULT NULL
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

  -- the agreement is all-or-nothing, and validated here
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
    -- the length people are shown comes from the mode, never the caller
    v_minutes := CASE p_session_mode WHEN 'full_mock_swap' THEN 75 ELSE 30 END;
  ELSIF p_interview_category IS NOT NULL OR p_skill_focus IS NOT NULL THEN
    RAISE EXCEPTION 'session_mode_required';
  END IF;

  BEGIN
    INSERT INTO public.practice_sessions
           (pairing_id, community_id,
            participant_a_user_id, participant_b_user_id, created_by_user_id,
            scheduled_start, duration_minutes, timezone,
            location_type, location_detail,
            session_mode, interview_category, skill_focus)
    VALUES (v_pairing.id, v_pairing.community_id,
            v_pairing.requester_user_id, v_pairing.addressee_user_id, auth.uid(),
            p_scheduled_start, v_minutes, p_timezone,
            p_location_type, p_location_detail,
            p_session_mode, p_interview_category, p_skill_focus)
    RETURNING * INTO v_session;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'session_already_live';
    WHEN check_violation THEN RAISE EXCEPTION 'invalid_session_agreement';
  END;

  -- notification and return shape are UNCHANGED from the original RPC
  v_other := CASE WHEN auth.uid() = v_pairing.requester_user_id
                  THEN v_pairing.addressee_user_id ELSE v_pairing.requester_user_id END;
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_other, 'practice_session_proposed',
          'Practice time proposed',
          'Your practice partner proposed a session time — confirm or suggest another',
          jsonb_build_object('pairing_id', p_pairing_id, 'session_id', v_session.id,
                             'community_id', v_pairing.community_id));

  RETURN to_jsonb(v_session);
END $$;

REVOKE ALL ON FUNCTION public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text) TO authenticated;

-- ── 3. confirm_practice_session refuses a broken agreement ───────
-- A participant must never be able to accept an invitation whose
-- structured details are missing or invalid.
CREATE OR REPLACE FUNCTION public.confirm_practice_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.practice_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_s.created_by_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_confirm_own_proposal'; END IF;
  IF v_s.status <> 'proposed' THEN RAISE EXCEPTION 'invalid_state'; END IF;

  -- an incomplete agreement cannot be accepted
  IF v_s.session_mode IS NOT NULL THEN
    IF v_s.interview_category IS NULL
       OR (v_s.session_mode = 'quick_skill_drill' AND v_s.skill_focus IS NULL) THEN
      RAISE EXCEPTION 'incomplete_session_agreement';
    END IF;
  END IF;

  UPDATE public.practice_sessions
     SET status = 'scheduled', confirmed_at = now()
   WHERE id = p_session_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_s.created_by_user_id, 'practice_session_scheduled',
          'Practice session scheduled',
          'Your proposed practice time was confirmed',
          jsonb_build_object('session_id', p_session_id, 'community_id', v_s.community_id));

  RETURN jsonb_build_object('id', p_session_id, 'status', 'scheduled');
END $$;

REVOKE ALL ON FUNCTION public.confirm_practice_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_practice_session(uuid) TO authenticated;

-- ── 4. Reads ─────────────────────────────────────────────────────
-- practice_sessions already carries a participants-only SELECT policy
-- ("PracticeSess: participants read"), so the three new columns are
-- visible to exactly the two people in the session and nobody else.
-- No new grants are required, and none are given.
--
-- submit_practice_confirmation, decline/withdraw/cancel and
-- browse_practice_requests are deliberately NOT modified: none of
-- them reads or writes the agreement, and verification must stay
-- exactly where it is.

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- ALTER TABLE public.practice_sessions
--   DROP CONSTRAINT IF EXISTS ps_duration_matches_mode,
--   DROP CONSTRAINT IF EXISTS ps_skill_matches_category,
--   DROP CONSTRAINT IF EXISTS ps_drill_needs_focus,
--   DROP CONSTRAINT IF EXISTS ps_agreement_complete,
--   DROP CONSTRAINT IF EXISTS ps_interview_category_valid,
--   DROP CONSTRAINT IF EXISTS ps_session_mode_valid;
-- DROP INDEX IF EXISTS public.idx_ps_agreement;
-- ALTER TABLE public.practice_sessions
--   DROP COLUMN IF EXISTS session_note,
--   DROP COLUMN IF EXISTS skill_focus,
--   DROP COLUMN IF EXISTS interview_category,
--   DROP COLUMN IF EXISTS session_mode;
-- DROP FUNCTION IF EXISTS public.propose_practice_session(uuid, timestamptz, integer, text, text, text, text, text, text);
-- (then re-run the 6-argument propose_practice_session and the
--  original confirm_practice_session from
--  scripts/migration-practice-reciprocal.sql)
-- ============================================================
