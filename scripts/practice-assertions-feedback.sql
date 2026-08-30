-- ============================================================
-- Mutu — private practice feedback assertions  (F1..F12)
--
-- Run AFTER scripts/migration-practice-feedback.sql, in the Supabase
-- SQL Editor. Self-rolling-back: nothing it creates survives.
--
-- Proves feedback is private, immutable, one per pair per session,
-- and that it can never change whether a practice verifies or how
-- many tokens exist.
-- ============================================================

BEGIN;

CREATE FUNCTION pg_temp.impersonate(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.god() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

DO $$
DECLARE
  cid uuid := 'eeeeeeee-0000-0000-0000-00000000c001';
  uA uuid := 'eeeeeeee-0000-0000-0000-0000000000a1';
  uB uuid := 'eeeeeeee-0000-0000-0000-0000000000b2';
  uX uuid := 'eeeeeeee-0000-0000-0000-0000000000c3';   -- outsider
  p1 uuid; s1 uuid; s2 uuid; fid uuid;
  n int; v_status text;
BEGIN
  PERFORM pg_temp.god();
  DELETE FROM public.communities WHERE id = cid;
  DELETE FROM public.profiles WHERE id IN (uA,uB,uX);
  DELETE FROM auth.users      WHERE id IN (uA,uB,uX);

  INSERT INTO auth.users (id, email) VALUES
    (uA,'fb-a@test.local'),(uB,'fb-b@test.local'),(uX,'fb-x@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, name, access_status) VALUES
    (uA,'fb-a@test.local','Ada Feedback','active'),
    (uB,'fb-b@test.local','Bo Feedback','active'),
    (uX,'fb-x@test.local','Xu Outsider','active')
  ON CONFLICT (id) DO UPDATE SET access_status = EXCLUDED.access_status;
  INSERT INTO public.communities (id, slug, name) VALUES (cid,'fb-test','FB Test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.community_members (community_id, user_id, status, source) VALUES
    (cid,uA,'member','admin'),(cid,uB,'member','admin'),(cid,uX,'member','admin')
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status;
  INSERT INTO public.practice_pairings
         (community_id, requester_user_id, addressee_user_id,
          requester_snapshot, addressee_snapshot, status, accepted_at)
  VALUES (cid, uA, uB, '{"want_types":["case"]}'::jsonb, '{"want_types":["case"]}'::jsonb,
          'accepted', now() - interval '5 days')
  RETURNING id INTO p1;
  INSERT INTO public.practice_sessions
         (pairing_id, community_id, participant_a_user_id, participant_b_user_id,
          created_by_user_id, scheduled_start, status)
  VALUES (p1, cid, uA, uB, uA, now() - interval '2 hours', 'scheduled')
  RETURNING id INTO s1;

  -- ── F1: an invalid suggestion writes NOTHING at all ─────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.submit_practice_confirmation(s1, 'completed', true, true, NULL,
              'you_seem_nervous', 'not a real code');
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'F1 FAIL: an unknown suggestion code was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%invalid_suggestion_code%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  SELECT count(*) INTO n FROM public.practice_session_confirmations WHERE session_id = s1;
  IF n <> 0 THEN
    RAISE EXCEPTION 'F1 FAIL: a rejected suggestion still left a confirmation behind';
  END IF;
  RAISE NOTICE 'F1 OK: an invalid code is rejected before anything is written';

  -- ── F2: a note over 280 characters is refused ───────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.submit_practice_confirmation(s1, 'completed', true, true, NULL,
              'tailor_structure', repeat('x', 281));
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'F2 FAIL: an over-long note was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%note_too_long%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'F2 OK: the note is capped at 280 characters';

  -- ── F3: first confirmation + feedback, no verification ──────
  PERFORM pg_temp.impersonate(uA);
  PERFORM public.submit_practice_confirmation(s1, 'completed', true, true, NULL,
            'recommendation_more_direct', 'Lead with the answer next time.');
  PERFORM pg_temp.god();
  SELECT status INTO v_status FROM public.practice_sessions WHERE id = s1;
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE session_id = s1;
  IF v_status <> 'completed_pending_confirmation' OR n <> 0 THEN
    RAISE EXCEPTION 'F3 FAIL: feedback changed the settlement (status %, tokens %)', v_status, n;
  END IF;
  SELECT count(*) INTO n FROM public.practice_session_feedback WHERE session_id = s1;
  IF n <> 1 THEN RAISE EXCEPTION 'F3 FAIL: feedback not stored with the confirmation'; END IF;
  RAISE NOTICE 'F3 OK: feedback rides along, and verifies nothing on its own';

  -- ── F4: it is addressed to the partner, and is immutable ────
  SELECT id INTO fid FROM public.practice_session_feedback WHERE session_id = s1;
  SELECT count(*) INTO n FROM public.practice_session_feedback
   WHERE id = fid AND author_user_id = uA AND recipient_user_id = uB;
  IF n <> 1 THEN RAISE EXCEPTION 'F4 FAIL: wrong author or recipient'; END IF;
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    UPDATE public.practice_session_feedback SET note = 'edited' WHERE id = fid;
    IF FOUND THEN
      PERFORM pg_temp.god();
      RAISE EXCEPTION 'F4 FAIL: the author edited submitted feedback';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN RAISE;
    WHEN OTHERS THEN NULL;
  END;
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    DELETE FROM public.practice_session_feedback WHERE id = fid;
    IF FOUND THEN
      PERFORM pg_temp.god();
      RAISE EXCEPTION 'F4 FAIL: the author deleted submitted feedback';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN RAISE;
    WHEN OTHERS THEN NULL;
  END;
  PERFORM pg_temp.god();
  SELECT count(*) INTO n FROM public.practice_session_feedback WHERE id = fid AND note = 'edited';
  IF n <> 0 THEN RAISE EXCEPTION 'F4 FAIL: feedback was edited after submission'; END IF;
  RAISE NOTICE 'F4 OK: feedback is written once and cannot be edited or deleted';

  -- ── F5: only the two of them can read it ────────────────────
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.practice_session_feedback WHERE id = fid;
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'F5 FAIL: the recipient cannot read their own feedback'; END IF;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.practice_session_feedback WHERE id = fid;
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'F5 FAIL: the author cannot read what they wrote'; END IF;
  PERFORM pg_temp.impersonate(uX);
  SELECT count(*) INTO n FROM public.practice_session_feedback;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'F5 FAIL: an unrelated member read % feedback rows', n; END IF;
  RAISE NOTICE 'F5 OK: author and recipient only; nobody else sees a single row';

  -- ── F6: no client write path ────────────────────────────────
  -- However it is refused (no INSERT policy, or the participant and
  -- confirmation trigger), what matters is that nothing is written.
  PERFORM pg_temp.impersonate(uB);
  BEGIN
    INSERT INTO public.practice_session_feedback
           (session_id, community_id, author_user_id, recipient_user_id, suggestion_code, note)
    VALUES (s1, cid, uB, uA, 'other', 'written directly');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM pg_temp.god();
  SELECT count(*) INTO n FROM public.practice_session_feedback
   WHERE session_id = s1 AND note = 'written directly';
  IF n <> 0 THEN RAISE EXCEPTION 'F6 FAIL: a member wrote feedback directly'; END IF;
  RAISE NOTICE 'F6 OK: feedback is created only through the confirmation RPC';

  -- ── F7: the second confirmation verifies and mints once ─────
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.submit_practice_confirmation(s1, 'completed', true, true, NULL,
            'communicate_concisely', 'Signpost the structure.');
  PERFORM pg_temp.god();
  SELECT status INTO v_status FROM public.practice_sessions WHERE id = s1;
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE session_id = s1;
  IF v_status <> 'verified' OR n <> 1 THEN
    RAISE EXCEPTION 'F7 FAIL: status % with % tokens', v_status, n;
  END IF;
  SELECT count(*) INTO n FROM public.practice_session_feedback WHERE session_id = s1;
  IF n <> 2 THEN RAISE EXCEPTION 'F7 FAIL: expected one piece of feedback each, got %', n; END IF;
  RAISE NOTICE 'F7 OK: verified once, one shared token, one suggestion per person';

  -- ── F8: a retry cannot duplicate anything ───────────────────
  -- refused either as already_confirmed or by the state guard once the
  -- session is verified; what matters is that nothing is duplicated
  PERFORM pg_temp.impersonate(uB);
  BEGIN
    PERFORM public.submit_practice_confirmation(s1, 'completed', true, true, NULL,
              'communicate_concisely', 'Signpost the structure.');
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'F8 FAIL: a second confirmation from the same user was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%F8 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%already_confirmed%' AND SQLERRM NOT LIKE '%invalid_state%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  SELECT count(*) INTO n FROM public.practice_session_confirmations WHERE session_id = s1;
  IF n <> 2 THEN RAISE EXCEPTION 'F8 FAIL: % confirmation rows', n; END IF;
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE session_id = s1;
  IF n <> 1 THEN RAISE EXCEPTION 'F8 FAIL: % tokens', n; END IF;
  SELECT count(*) INTO n FROM public.practice_session_feedback WHERE session_id = s1;
  IF n <> 2 THEN RAISE EXCEPTION 'F8 FAIL: % feedback rows', n; END IF;
  RAISE NOTICE 'F8 OK: retrying duplicates no confirmation, no token and no feedback';

  -- ── F9: feedback needs a confirmation behind it ─────────────
  PERFORM pg_temp.god();
  INSERT INTO public.practice_sessions
         (pairing_id, community_id, participant_a_user_id, participant_b_user_id,
          created_by_user_id, scheduled_start, status)
  VALUES (p1, cid, uA, uB, uA, now() - interval '1 hour', 'scheduled')
  RETURNING id INTO s2;
  BEGIN
    INSERT INTO public.practice_session_feedback
           (session_id, community_id, author_user_id, recipient_user_id, suggestion_code, note)
    VALUES (s2, cid, uA, uB, 'other', 'no confirmation yet');
    RAISE EXCEPTION 'F9 FAIL: feedback was stored without a confirmation';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%confirmation_required%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'F9 OK: feedback only follows the author''s own confirmation';

  -- ── F10: an outsider can never be author or recipient ───────
  PERFORM pg_temp.god();
  BEGIN
    INSERT INTO public.practice_session_feedback
           (session_id, community_id, author_user_id, recipient_user_id, suggestion_code, note)
    VALUES (s1, cid, uA, uX, 'other', 'to a stranger');
    RAISE EXCEPTION 'F10 FAIL: feedback was addressed to a non-participant';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%not_session_participants%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'F10 OK: both parties must be in the session';

  -- ── F11: reporting belongs to the recipient ─────────────────
  SELECT id INTO fid FROM public.practice_session_feedback
   WHERE session_id = s1 AND recipient_user_id = uB;
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.report_practice_feedback(fid);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'F11 FAIL: the author reported their own feedback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%not_recipient%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.report_practice_feedback(fid);
  PERFORM pg_temp.god();
  SELECT count(*) INTO n FROM public.practice_session_feedback
   WHERE id = fid AND reported_at IS NOT NULL AND reported_by = uB;
  IF n <> 1 THEN RAISE EXCEPTION 'F11 FAIL: the report was not recorded'; END IF;
  RAISE NOTICE 'F11 OK: only the recipient can report, and nothing is deleted';

  -- ── F12: a non-completed outcome carries no feedback ────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.submit_practice_confirmation(s2, 'no_show', false, false, uB,
              'tailor_structure', 'should not be possible');
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'F12 FAIL: feedback was attached to a session that did not happen';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%feedback_requires_completed%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  SELECT count(*) INTO n FROM public.practice_session_confirmations WHERE session_id = s2;
  IF n <> 0 THEN RAISE EXCEPTION 'F12 FAIL: the rejected call still confirmed something'; END IF;
  RAISE NOTICE 'F12 OK: feedback exists only where a practice was completed';

  RAISE NOTICE '── practice feedback: ALL ASSERTIONS PASSED ──';
END $$;

ROLLBACK;
