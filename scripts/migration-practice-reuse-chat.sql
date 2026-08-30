-- ============================================================
-- Mutu — Exchange chat reuse on re-match (2026-08-27)
--
-- Ending a partnership and matching again with the same person used
-- to create a SECOND Exchange chat (duplicate "Sara" rows in
-- Messages). This re-emits accept_practice_pairing so it reuses the
-- pair's existing practice chat when one exists, creating a new one
-- only for a first-ever match. Only source='practice' matches are
-- considered; ordinary and anonymous chats stay untouched. All other
-- logic (slot booking, notifications, eligibility) is verbatim from
-- the previous version. Idempotent; grants preserved by
-- CREATE OR REPLACE. Run manually after all previous migrations.
-- Existing duplicate chats are left as they are (users can unmatch
-- the stale one from the chat menu).
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

  -- The Practice chat: REUSE the pair's existing Exchange chat when
  -- one exists (e.g. after ending and re-matching), so the same two
  -- people never accumulate duplicate conversations. Only matches
  -- with source='practice' are ever considered: ordinary or anonymous
  -- chats between the pair are untouched, as always.
  SELECT m.id INTO v_match_id
    FROM public.matches m
   WHERE m.source = 'practice'
     AND m.status <> 'unmatched'
     AND ((m.requester_user_id = v_pairing.requester_user_id AND m.helper_user_id = v_pairing.addressee_user_id)
       OR (m.requester_user_id = v_pairing.addressee_user_id AND m.helper_user_id = v_pairing.requester_user_id))
   ORDER BY m.created_at DESC
   LIMIT 1;

  IF v_match_id IS NULL THEN
    INSERT INTO public.matches
           (requester_user_id, helper_user_id, status, source,
            identity_reveal_status, identity_reveal_accepted_at)
    VALUES (v_pairing.requester_user_id, v_pairing.addressee_user_id,
            'active', 'practice', 'accepted', now())
    RETURNING id INTO v_match_id;
  END IF;

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
