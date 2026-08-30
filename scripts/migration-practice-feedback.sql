-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — private practice feedback  (Step 4)
--
-- One private suggestion per person per session: "what is one thing
-- your partner should try next". Never a rating, a score or a public
-- signal.
--
-- WHY A SEPARATE TABLE
-- practice_session_confirmations is the verification primitive and is
-- immutable by design. Feedback is a different fact with a different
-- audience (author and recipient only), so it lives beside it and can
-- never influence whether a session verifies.
--
-- WHAT DOES NOT CHANGE
--   · submit_practice_confirmation keeps its outcomes, its reciprocity
--     CHECK, its verified/disputed settlement and its ONE token per
--     verified session (UNIQUE(session_id)). Feedback is written in
--     the same transaction, and cannot alter any of it.
--   · No feedback column is ever added to the token table.
--
-- ATOMICITY
--   The suggestion code is validated BEFORE anything is written, so a
--   bad code raises and nothing at all is stored. A valid one is
--   inserted in the same transaction as the confirmation: either both
--   land or neither does. Re-submitting is impossible (the
--   confirmation PK already rejects it), and the feedback insert is
--   ON CONFLICT DO NOTHING, so a retry can never duplicate a row or a
--   token. Feedback is never required for verification, and the
--   optional note can never block completion.
--
-- NO BACKFILL. Sessions verified before this migration simply have no
-- feedback, forever.
--
-- Idempotent. Rollback at the bottom.
-- Assertions: scripts/practice-assertions-feedback.sql
-- ============================================================

-- ── 1. The table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.practice_session_feedback (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL,
  community_id      uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- the CODE is the data; the label is only how the UI says it today
  suggestion_code   text NOT NULL,
  note              text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  reported_at       timestamptz,
  reported_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  CONSTRAINT psf_distinct_parties CHECK (author_user_id <> recipient_user_id),
  CONSTRAINT psf_note_length CHECK (char_length(note) <= 280),
  -- controlled taxonomy, mirroring src/data/practiceFeedback.js
  CONSTRAINT psf_suggestion_known CHECK (suggestion_code IN (
    -- case
    'clarify_objective_earlier','tailor_structure','explain_calculations',
    'connect_insight_to_question','recommendation_more_direct','communicate_concisely',
    -- behavioural
    'clearer_context','emphasise_personal_actions','add_evidence_of_impact',
    'sharper_reflection','answer_more_concisely','strengthen_delivery',
    -- shared
    'other')),
  -- feedback can only belong to a session in its own community
  CONSTRAINT psf_session_same_community
    FOREIGN KEY (session_id, community_id)
    REFERENCES public.practice_sessions (id, community_id) ON DELETE CASCADE
);

-- one piece of feedback per author per recipient per session
CREATE UNIQUE INDEX IF NOT EXISTS uq_psf_author_recipient
  ON public.practice_session_feedback (session_id, author_user_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_psf_recipient
  ON public.practice_session_feedback (recipient_user_id, created_at DESC);

-- Both people must actually be in the session. A CHECK cannot see
-- another table, so a trigger enforces it for every write path.
CREATE OR REPLACE FUNCTION public.tg_psf_participants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_s public.practice_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = NEW.session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF NEW.author_user_id NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id)
     OR NEW.recipient_user_id NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'not_session_participants';
  END IF;
  -- the author must have confirmed: feedback follows a confirmation
  IF NOT EXISTS (SELECT 1 FROM public.practice_session_confirmations c
                  WHERE c.session_id = NEW.session_id AND c.user_id = NEW.author_user_id) THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;
  -- blocked in either direction: no feedback passes
  IF EXISTS (SELECT 1 FROM public.blocks b
              WHERE (b.blocker_id = NEW.author_user_id AND b.blocked_user_id = NEW.recipient_user_id)
                 OR (b.blocker_id = NEW.recipient_user_id AND b.blocked_user_id = NEW.author_user_id)) THEN
    RAISE EXCEPTION 'blocked';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_psf_participants ON public.practice_session_feedback;
CREATE TRIGGER trg_psf_participants
  BEFORE INSERT ON public.practice_session_feedback
  FOR EACH ROW EXECUTE FUNCTION public.tg_psf_participants();

ALTER TABLE public.practice_session_feedback ENABLE ROW LEVEL SECURITY;

-- Read: the author and the recipient, nobody else. There is no
-- INSERT/UPDATE/DELETE policy, so feedback is immutable to clients and
-- can only be created by the SECURITY DEFINER RPC below.
DROP POLICY IF EXISTS "PracticeFeedback: author or recipient read" ON public.practice_session_feedback;
CREATE POLICY "PracticeFeedback: author or recipient read"
  ON public.practice_session_feedback FOR SELECT TO authenticated
  USING (auth.uid() IN (author_user_id, recipient_user_id));

REVOKE ALL ON public.practice_session_feedback FROM PUBLIC, anon;
GRANT SELECT ON public.practice_session_feedback TO authenticated;

-- ── 2. Confirmation and feedback, in one transaction ─────────────
-- Same function, same outcomes, same settlement, same single token.
-- Two optional arguments carry the private suggestion.
DROP FUNCTION IF EXISTS public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid);

CREATE OR REPLACE FUNCTION public.submit_practice_confirmation(
  p_session_id              uuid,
  p_outcome                 text,
  p_completed_own_round     boolean DEFAULT false,
  p_completed_partner_round boolean DEFAULT false,
  p_no_show_of              uuid    DEFAULT NULL,
  p_suggestion_code         text    DEFAULT NULL,
  p_note                    text    DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s       public.practice_sessions%ROWTYPE;
  v_pairing public.practice_pairings%ROWTYPE;
  v_other   uuid;
  v_count   integer;
  v_outcomes text[];
  v_new_status text;
  v_types   text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_outcome NOT IN ('completed','no_show','cancelled') THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;

  -- validate the suggestion BEFORE writing anything, so an invalid
  -- code can never leave a confirmation behind without its feedback
  IF p_suggestion_code IS NOT NULL THEN
    IF p_outcome <> 'completed' THEN RAISE EXCEPTION 'feedback_requires_completed'; END IF;
    IF char_length(coalesce(p_note, '')) > 280 THEN RAISE EXCEPTION 'note_too_long'; END IF;
    IF p_suggestion_code NOT IN (
         'clarify_objective_earlier','tailor_structure','explain_calculations',
         'connect_insight_to_question','recommendation_more_direct','communicate_concisely',
         'clearer_context','emphasise_personal_actions','add_evidence_of_impact',
         'sharper_reflection','answer_more_concisely','strengthen_delivery','other') THEN
      RAISE EXCEPTION 'invalid_suggestion_code';
    END IF;
  END IF;

  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  IF NOT ( v_s.status IN ('scheduled','completed_pending_confirmation')
        OR (v_s.status IN ('no_show','cancelled')
            AND v_s.cancelled_by IS NULL
            AND (SELECT count(*) FROM public.practice_session_confirmations c
                  WHERE c.session_id = p_session_id) = 1) ) THEN
    RAISE EXCEPTION 'invalid_state';
  END IF;
  IF now() < v_s.scheduled_start THEN RAISE EXCEPTION 'session_not_started'; END IF;
  IF p_no_show_of IS NOT NULL
     AND p_no_show_of NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'invalid_no_show_of';
  END IF;

  v_other := CASE WHEN auth.uid() = v_s.participant_a_user_id
                  THEN v_s.participant_b_user_id ELSE v_s.participant_a_user_id END;

  BEGIN
    INSERT INTO public.practice_session_confirmations
           (session_id, user_id, outcome,
            completed_own_round, completed_partner_round, no_show_of)
    VALUES (p_session_id, auth.uid(), p_outcome,
            p_completed_own_round, p_completed_partner_round, p_no_show_of);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_confirmed';
  END;

  -- the private suggestion, in the SAME transaction as the confirmation
  IF p_suggestion_code IS NOT NULL THEN
    INSERT INTO public.practice_session_feedback
           (session_id, community_id, author_user_id, recipient_user_id,
            suggestion_code, note)
    VALUES (p_session_id, v_s.community_id, auth.uid(), v_other,
            p_suggestion_code, coalesce(p_note, ''))
    ON CONFLICT (session_id, author_user_id, recipient_user_id) DO NOTHING;
  END IF;

  SELECT count(*), array_agg(outcome ORDER BY confirmed_at)
    INTO v_count, v_outcomes
    FROM public.practice_session_confirmations
   WHERE session_id = p_session_id;

  IF v_count = 1 THEN
    v_new_status := CASE p_outcome
                      WHEN 'completed' THEN 'completed_pending_confirmation'
                      WHEN 'no_show'   THEN 'no_show'
                      ELSE                  'cancelled'
                    END;
    UPDATE public.practice_sessions
       SET status = v_new_status,
           completed_at = CASE WHEN p_outcome = 'completed' THEN now() ELSE completed_at END
     WHERE id = p_session_id;

    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_other, 'practice_partner_confirmed',
            'Your practice partner confirmed',
            'Confirm your side to verify the session',
            jsonb_build_object('session_id', p_session_id, 'community_id', v_s.community_id));

  ELSE  -- second confirmation: settle the final state
    IF v_outcomes[1] = 'completed' AND v_outcomes[2] = 'completed' THEN
      v_new_status := 'verified';
    ELSIF v_outcomes[1] = v_outcomes[2] THEN
      v_new_status := v_outcomes[1];             -- both no_show / both cancelled
    ELSE
      v_new_status := 'disputed';                -- frozen for manual founder review
    END IF;

    UPDATE public.practice_sessions
       SET status = v_new_status,
           verified_at = CASE WHEN v_new_status = 'verified' THEN now() ELSE verified_at END
     WHERE id = p_session_id;

    IF v_new_status = 'verified' THEN
      -- MINT: unchanged. Exactly one shared token per verified
      -- session, idempotent via UNIQUE(session_id). Feedback plays no
      -- part in this decision.
      SELECT * INTO v_pairing FROM public.practice_pairings WHERE id = v_s.pairing_id;
      v_types := ARRAY(
        SELECT DISTINCT t FROM (
          SELECT jsonb_array_elements_text(v_pairing.requester_snapshot->'want_types') AS t
          UNION
          SELECT jsonb_array_elements_text(v_pairing.addressee_snapshot->'want_types')
        ) s ORDER BY t);

      INSERT INTO public.practice_exchange_tokens
             (session_id, community_id, pairing_id, user_lo, user_hi,
              exchange_types, verified_at)
      VALUES (p_session_id, v_s.community_id, v_s.pairing_id,
              LEAST(v_s.participant_a_user_id, v_s.participant_b_user_id),
              GREATEST(v_s.participant_a_user_id, v_s.participant_b_user_id),
              v_types, now())
      ON CONFLICT (session_id) DO NOTHING;

      INSERT INTO public.notifications (user_id, type, title, body, payload)
      SELECT u, 'practice_session_verified',
             'Session verified',
             'You both confirmed! You unlocked a shared Mutu Token',
             jsonb_build_object('session_id', p_session_id, 'community_id', v_s.community_id)
        FROM unnest(ARRAY[v_s.participant_a_user_id, v_s.participant_b_user_id]) AS u;
    END IF;
  END IF;

  RETURN jsonb_build_object('session_id', p_session_id, 'status',
           (SELECT status FROM public.practice_sessions WHERE id = p_session_id));
END $$;

REVOKE ALL ON FUNCTION public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid, text, text) TO authenticated;

-- ── 3. Reporting inappropriate feedback ──────────────────────────
-- The recipient flags it; nothing is deleted and nothing is scored.
CREATE OR REPLACE FUNCTION public.report_practice_feedback(p_feedback_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_f public.practice_session_feedback%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_f FROM public.practice_session_feedback WHERE id = p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'feedback_not_found'; END IF;
  IF auth.uid() <> v_f.recipient_user_id THEN RAISE EXCEPTION 'not_recipient'; END IF;

  UPDATE public.practice_session_feedback
     SET reported_at = coalesce(reported_at, now()),
         reported_by = coalesce(reported_by, auth.uid())
   WHERE id = p_feedback_id;

  RETURN jsonb_build_object('id', p_feedback_id, 'reported', true);
END $$;

REVOKE ALL ON FUNCTION public.report_practice_feedback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_practice_feedback(uuid) TO authenticated;

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.report_practice_feedback(uuid);
-- DROP FUNCTION IF EXISTS public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid, text, text);
-- DROP TRIGGER IF EXISTS trg_psf_participants ON public.practice_session_feedback;
-- DROP FUNCTION IF EXISTS public.tg_psf_participants();
-- DROP TABLE IF EXISTS public.practice_session_feedback;
-- (then re-run the 5-argument submit_practice_confirmation from
--  scripts/migration-practice-reciprocal.sql)
-- ============================================================
