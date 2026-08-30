-- ============================================================
-- Mutu — Exchange notification copy refresh (2026-08-27)
--
-- Copy-only change: the notification bodies written by three RPCs
-- still carried em dashes and stiff phrasing. This re-emits the
-- CURRENT function definitions verbatim with ONLY those strings
-- changed. No logic, permissions, or invariants are touched
-- (CREATE OR REPLACE preserves existing grants). Idempotent.
-- Run manually in the Supabase SQL Editor, after all previous
-- practice migrations. Existing notification rows keep their old
-- text; only new notifications get the new copy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_practice_pairing(p_pairing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_match_id uuid;
  v_session_id uuid;
  v_dur int;
  v_loc text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF v_pairing.addressee_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_addressee'; END IF;
  IF v_pairing.status <> 'invited' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF v_pairing.expires_at <= now() THEN RAISE EXCEPTION 'invitation_expired'; END IF;

  IF NOT public.practice_is_community_eligible(v_pairing.requester_user_id, v_pairing.community_id)
     OR NOT public.practice_is_community_eligible(v_pairing.addressee_user_id, v_pairing.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  -- One NEW Practice chat, born identity-revealed (contextual reveal).
  INSERT INTO public.matches
         (requester_user_id, helper_user_id, status, source,
          identity_reveal_status, identity_reveal_accepted_at)
  VALUES (v_pairing.requester_user_id, v_pairing.addressee_user_id,
          'active', 'practice', 'accepted', now())
  RETURNING id INTO v_match_id;

  UPDATE public.practice_pairings
     SET status = 'accepted', accepted_at = now(), match_id = v_match_id
   WHERE id = p_pairing_id;

  -- Slot-bound invitation: this one-time explicit acceptance IS the
  -- mutual time consent → book the slot as a SCHEDULED session now.
  -- (If the slot's start has passed while the invitation waited, fall
  -- back to a normal acceptance — the pair schedules in-app.)
  IF v_pairing.proposed_starts_at IS NOT NULL
     AND v_pairing.proposed_starts_at > now() THEN
    v_dur := LEAST(180, GREATEST(30,
               coalesce((v_pairing.addressee_snapshot->>'duration_minutes')::int, 60)));
    v_loc := CASE coalesce(v_pairing.addressee_snapshot->>'location_type', 'virtual')
               WHEN 'in_person' THEN 'in_person' ELSE 'virtual' END;
    BEGIN
      INSERT INTO public.practice_sessions
             (pairing_id, community_id,
              participant_a_user_id, participant_b_user_id, created_by_user_id,
              scheduled_start, duration_minutes, timezone,
              location_type, location_detail,
              status, confirmed_at, source_window_id)
      VALUES (v_pairing.id, v_pairing.community_id,
              v_pairing.requester_user_id, v_pairing.addressee_user_id,
              v_pairing.requester_user_id,           -- the inviter proposed this time
              v_pairing.proposed_starts_at, v_dur,
              coalesce(v_pairing.proposed_timezone, 'America/Toronto'),
              v_loc, '',
              'scheduled', now(),                    -- accepted = time confirmed
              v_pairing.proposed_window_id)
      RETURNING id INTO v_session_id;
    EXCEPTION WHEN unique_violation THEN
      -- uq_session_slot: this exact slot is already booked by another
      -- live session. The acceptance must not silently double-book.
      RAISE EXCEPTION 'slot_taken';
    END;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_pairing.requester_user_id, 'practice_invitation_accepted',
          'Practice invitation accepted',
          CASE WHEN v_session_id IS NULL
               THEN 'Your invitation was accepted! Say hi and pick a time'
               ELSE 'Your invitation was accepted! Your session time is booked' END,
          jsonb_build_object('pairing_id', p_pairing_id, 'match_id', v_match_id,
                             'session_id', v_session_id,
                             'community_id', v_pairing.community_id));

  RETURN jsonb_build_object('id', p_pairing_id, 'status', 'accepted',
                            'match_id', v_match_id, 'session_id', v_session_id,
                            'counterpart_user_id', v_pairing.requester_user_id,
                            'community_id', v_pairing.community_id);
END $$;

CREATE OR REPLACE FUNCTION public.propose_practice_session(
  p_pairing_id      uuid,
  p_scheduled_start timestamptz,
  p_duration_minutes integer  DEFAULT 60,
  p_timezone        text      DEFAULT 'America/Toronto',
  p_location_type   text      DEFAULT 'virtual',
  p_location_detail text      DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_session public.practice_sessions%ROWTYPE;
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
  IF NOT public.practice_is_community_eligible(auth.uid(), v_pairing.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;
  IF p_scheduled_start <= now() THEN RAISE EXCEPTION 'start_in_past'; END IF;

  BEGIN
    INSERT INTO public.practice_sessions
           (pairing_id, community_id,
            participant_a_user_id, participant_b_user_id, created_by_user_id,
            scheduled_start, duration_minutes, timezone,
            location_type, location_detail)
    VALUES (v_pairing.id, v_pairing.community_id,
            v_pairing.requester_user_id, v_pairing.addressee_user_id, auth.uid(),
            p_scheduled_start, p_duration_minutes, p_timezone,
            p_location_type, p_location_detail)
    RETURNING * INTO v_session;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'session_already_live';
  END;

  v_other := CASE WHEN auth.uid() = v_pairing.requester_user_id
                  THEN v_pairing.addressee_user_id ELSE v_pairing.requester_user_id END;
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_other, 'practice_session_proposed',
          'Practice time proposed',
          'Your partner proposed a session time. Confirm it or suggest another',
          jsonb_build_object('pairing_id', p_pairing_id, 'session_id', v_session.id,
                             'community_id', v_pairing.community_id));

  RETURN to_jsonb(v_session);
END $$;

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
            'Confirm your side to verify the exchange',
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
             'Practice exchange verified',
             'You both confirmed! You earned a shared exchange token',
             jsonb_build_object('session_id', p_session_id, 'community_id', v_s.community_id)
        FROM unnest(ARRAY[v_s.participant_a_user_id, v_s.participant_b_user_id]) AS u;
    END IF;
  END IF;

  RETURN jsonb_build_object('session_id', p_session_id, 'status',
           (SELECT status FROM public.practice_sessions WHERE id = p_session_id));
END $$;
