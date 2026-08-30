-- ============================================================
-- Mutu — Together notification copy (2026-08-27)
--
-- Copy-only change: three notification strings written by two RPCs
-- still said "exchange" after the user-facing rename to Together.
-- This re-emits the CURRENT function definitions verbatim with ONLY
-- those strings changed, then updates the already-delivered
-- notification rows to match. No logic, permissions, or invariants
-- change (CREATE OR REPLACE preserves existing grants). Idempotent.
-- Run manually in the Supabase SQL Editor, after all previous
-- practice migrations (it refuses to run if end-pairing is missing).
--
--   'Confirm your side to verify the exchange'
--     -> 'Confirm your side to verify the session'
--   'Practice exchange verified' / '...shared exchange token'
--     -> 'Session verified' / 'You both confirmed! You unlocked a
--        shared Mutu Token'
--   'Your exchange partner ended your partnership...'
--     -> 'Your practice partner ended your partnership...'
-- ============================================================

-- Guard: the end-pairing migration must already be live, because the
-- function re-issued below references ended_at/ended_by.
DO $g$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'practice_pairings'
       AND column_name = 'ended_at') THEN
    RAISE EXCEPTION 'Run migration-practice-end-pairing.sql first.';
  END IF;
END $g$;

-- ── 1. submit_practice_confirmation (latest body; copy updated) ──
CREATE OR REPLACE FUNCTION public.submit_practice_confirmation(
  p_session_id              uuid,
  p_outcome                 text,
  p_completed_own_round     boolean DEFAULT false,
  p_completed_partner_round boolean DEFAULT false,
  p_no_show_of              uuid    DEFAULT NULL
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

  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  -- Confirmable states: a scheduled/first-confirmed session, or a
  -- session whose no_show/cancelled status came from the FIRST
  -- confirmation (cancelled_by IS NULL distinguishes it from a
  -- pre-emptive cancel; the partner may still disagree → disputed).
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

  BEGIN
    INSERT INTO public.practice_session_confirmations
           (session_id, user_id, outcome,
            completed_own_round, completed_partner_round, no_show_of)
    VALUES (p_session_id, auth.uid(), p_outcome,
            p_completed_own_round, p_completed_partner_round, p_no_show_of);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_confirmed';
  END;

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

    v_other := CASE WHEN auth.uid() = v_s.participant_a_user_id
                    THEN v_s.participant_b_user_id ELSE v_s.participant_a_user_id END;
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
      -- MINT: exactly one shared token per verified session, in the
      -- session's community. Idempotent via UNIQUE(session_id).
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

REVOKE ALL ON FUNCTION public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid) TO authenticated;

-- ── 2. end_practice_pairing (latest body; copy updated) ─────────
CREATE OR REPLACE FUNCTION public.end_practice_pairing(p_pairing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_other uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF auth.uid() NOT IN (v_pairing.requester_user_id, v_pairing.addressee_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_pairing.status <> 'accepted' THEN RAISE EXCEPTION 'invalid_state'; END IF;

  -- Cancel a live proposal/scheduled session. A session that is
  -- already awaiting confirmations is deliberately untouched.
  UPDATE public.practice_sessions
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = 'partnership_ended'
   WHERE pairing_id = p_pairing_id
     AND status IN ('proposed','scheduled');

  UPDATE public.practice_pairings
     SET status = 'ended', ended_at = now(), ended_by = auth.uid()
   WHERE id = p_pairing_id;

  v_other := CASE WHEN auth.uid() = v_pairing.requester_user_id
                  THEN v_pairing.addressee_user_id ELSE v_pairing.requester_user_id END;
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_other, 'practice_partnership_ended',
          'Partnership ended',
          'Your practice partner ended your partnership. Your verified history and chat are safe, and you can match again anytime.',
          jsonb_build_object('pairing_id', p_pairing_id,
                             'community_id', v_pairing.community_id));

  RETURN jsonb_build_object('id', p_pairing_id, 'status', 'ended');
END $$;

REVOKE ALL ON FUNCTION public.end_practice_pairing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_practice_pairing(uuid) TO authenticated;

-- ── 3. Align notifications already delivered ────────────────────
-- Matches both the notification-copy era strings and the original
-- reciprocal-era strings, so it works whichever copy is live.
UPDATE public.notifications
   SET body = 'Confirm your side to verify the session'
 WHERE type = 'practice_partner_confirmed'
   AND body = 'Confirm your side to verify the exchange';

UPDATE public.notifications
   SET title = 'Session verified',
       body  = 'You both confirmed! You unlocked a shared Mutu Token'
 WHERE type = 'practice_session_verified'
   AND (title = 'Practice exchange verified'
        OR body LIKE '%shared exchange token%');

UPDATE public.notifications
   SET body = replace(body, 'Your exchange partner', 'Your practice partner')
 WHERE type = 'practice_partnership_ended'
   AND body LIKE 'Your exchange partner%';

-- ============================================================
-- ROLLBACK (manual): re-run the copy strings from
-- migration-practice-notification-copy.sql §submit_practice_confirmation
-- and migration-practice-end-pairing.sql §3 (the two functions there
-- carry the previous strings verbatim). The three UPDATEs above are
-- cosmetic and need no reversal.
-- ============================================================
