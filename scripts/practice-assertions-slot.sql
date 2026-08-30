-- ============================================================
-- Mutu — Practice · Slot-bound invitation assertions
-- Run AFTER migration-practice-slot-invites.sql (Supabase SQL
-- Editor, postgres role). Wraps itself in BEGIN … ROLLBACK —
-- nothing survives. Success = final NOTICE 'ALL SLOT ASSERTIONS
-- PASSED'. Run the main practice-assertions.sql afterwards too —
-- it must still pass (regression).
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
  uA uuid := '00000000-0000-4000-8000-00000000c0aa';
  uB uuid := '00000000-0000-4000-8000-00000000c0bb';
  uC uuid := '00000000-0000-4000-8000-00000000c0cc';
  v_rotman uuid;
  reqA uuid; winA uuid; winA2 uuid;
  pairBA uuid; pairCA uuid;
  v_json jsonb; v_n int; v_txt text; v_sess uuid; v_start timestamptz;
BEGIN

  SELECT id INTO v_rotman FROM public.communities WHERE slug = 'rotman';
  IF v_rotman IS NULL THEN RAISE EXCEPTION 'SETUP: run the main migration first'; END IF;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         u.id::text || '@slot.test', '', now(), now(), now()
  FROM (VALUES (uA),(uB),(uC)) AS u(id)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, name, access_status, member_type, access_type)
  SELECT u.id, u.id::text || '@slot.test', 'Slot User', 'active', 'student', 'legacy'
  FROM (VALUES (uA),(uB),(uC)) AS u(id)
  ON CONFLICT (id) DO UPDATE SET access_status = 'active';
  INSERT INTO public.community_members (community_id, user_id, status, source)
  SELECT v_rotman, u.id, 'member', 'admin' FROM (VALUES (uA),(uB),(uC)) AS u(id)
  ON CONFLICT DO NOTHING;

  -- A: wants case / helps behavioural, two future windows.
  PERFORM pg_temp.impersonate(uA);
  INSERT INTO public.practice_requests (user_id, community_id, want_types, help_types)
  VALUES (uA, v_rotman, ARRAY['case'], ARRAY['behavioural']) RETURNING id INTO reqA;
  v_start := date_trunc('hour', now()) + interval '49 hours';
  INSERT INTO public.practice_availability_windows (request_id, starts_at, ends_at)
  VALUES (reqA, v_start, v_start + interval '2 hours') RETURNING id INTO winA;
  INSERT INTO public.practice_availability_windows (request_id, starts_at, ends_at)
  VALUES (reqA, v_start + interval '1 day', v_start + interval '1 day 2 hours') RETURNING id INTO winA2;

  -- B and C: mirror requests, NO overlapping availability needed.
  PERFORM pg_temp.impersonate(uB);
  INSERT INTO public.practice_requests (user_id, community_id, want_types, help_types)
  VALUES (uB, v_rotman, ARRAY['behavioural'], ARRAY['case']);
  PERFORM pg_temp.impersonate(uC);
  INSERT INTO public.practice_requests (user_id, community_id, want_types, help_types)
  VALUES (uC, v_rotman, ARRAY['behavioural'], ARRAY['case']);

  -- SL1 · browse windows now carry ids; fit is types-only (no windows for B!)
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman) b
   WHERE b.request_id = reqA AND b.mutual_fit
     AND b.windows->0 ? 'id';
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION SL1 FAILED: fit must be types-only and windows must carry ids'; END IF;
  RAISE NOTICE 'SL1 ok: types-only fit; slot ids exposed';

  -- SL2 · B slot-binds to A's window WITHOUT any own windows
  v_json := public.send_practice_invitation(reqA, winA);
  pairBA := (v_json->>'id')::uuid;
  IF (v_json->>'proposed_starts_at') IS NULL THEN
    RAISE EXCEPTION 'ASSERTION SL2a FAILED: invitation not slot-bound';
  END IF;
  IF v_json ? 'counterpart_user_id' THEN
    RAISE EXCEPTION 'ASSERTION SL2b FAILED: slot invite leaks identity';
  END IF;
  RAISE NOTICE 'SL2 ok: slot-bound invite without own availability; still anonymous';

  -- SL3 · invalid slot (someone else's window id) is rejected
  PERFORM pg_temp.impersonate(uC);
  BEGIN
    PERFORM public.send_practice_invitation(reqA, '00000000-0000-4000-8000-00000000dead');
    RAISE EXCEPTION 'ASSERTION SL3 FAILED: bogus slot accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
    IF SQLERRM <> 'invalid_slot' THEN RAISE EXCEPTION 'ASSERTION SL3 FAILED: wrong error %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'SL3 ok: invalid slot rejected';

  -- C also slot-binds to the SAME window (allowed at invite time —
  -- only booking is exclusive).
  v_json := public.send_practice_invitation(reqA, winA);
  pairCA := (v_json->>'id')::uuid;

  -- SL4 · A sees the proposed time on the invitation, still anonymous
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO v_n FROM public.my_practice_pairings
   WHERE id = pairBA AND proposed_starts_at IS NOT NULL AND counterpart_user_id IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION SL4 FAILED: proposed time missing or identity leaked'; END IF;
  RAISE NOTICE 'SL4 ok: addressee sees slot, not identity';

  -- SL5 · accepting the slot invite books a SCHEDULED session at that time
  v_json := public.accept_practice_pairing(pairBA);
  v_sess := (v_json->>'session_id')::uuid;
  IF v_sess IS NULL THEN RAISE EXCEPTION 'ASSERTION SL5a FAILED: no session booked on slot accept'; END IF;
  PERFORM pg_temp.god();
  SELECT status INTO v_txt FROM public.practice_sessions WHERE id = v_sess;
  IF v_txt <> 'scheduled' THEN RAISE EXCEPTION 'ASSERTION SL5b FAILED: session status % (want scheduled)', v_txt; END IF;
  SELECT count(*) INTO v_n FROM public.practice_sessions
   WHERE id = v_sess AND scheduled_start = v_start AND source_window_id = winA
     AND confirmed_at IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION SL5c FAILED: session not bound to the exact slot'; END IF;
  SELECT count(*) INTO v_n FROM public.matches
   WHERE source = 'practice' AND identity_reveal_status = 'accepted'
     AND ((requester_user_id, helper_user_id) IN ((uB, uA), (uA, uB)));
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION SL5d FAILED: practice match/reveal missing'; END IF;
  RAISE NOTICE 'SL5 ok: one-time acceptance = valid time match, session booked';

  -- SL6 · the SAME slot cannot be booked twice
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.accept_practice_pairing(pairCA);
    RAISE EXCEPTION 'ASSERTION SL6 FAILED: same slot booked for two sessions';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
    IF SQLERRM <> 'slot_taken' THEN RAISE EXCEPTION 'ASSERTION SL6 FAILED: wrong error %', SQLERRM; END IF;
  END;
  PERFORM pg_temp.god();
  SELECT status INTO v_txt FROM public.practice_pairings WHERE id = pairCA;
  IF v_txt <> 'invited' THEN RAISE EXCEPTION 'ASSERTION SL6b FAILED: failed booking corrupted pairing (%)', v_txt; END IF;
  RAISE NOTICE 'SL6 ok: slot exclusivity enforced; pairing intact';

  -- SL7 · a NEW slot-bound invite against an already-booked slot is refused up front
  PERFORM pg_temp.god();
  DELETE FROM public.practice_pairings WHERE id = pairCA;   -- clear C↔A to retry
  PERFORM pg_temp.impersonate(uC);
  BEGIN
    PERFORM public.send_practice_invitation(reqA, winA);
    RAISE EXCEPTION 'ASSERTION SL7 FAILED: invite bound to a booked slot';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
    IF SQLERRM <> 'slot_taken' THEN RAISE EXCEPTION 'ASSERTION SL7 FAILED: wrong error %', SQLERRM; END IF;
  END;
  -- …but the OTHER window is free, and a plain (unbound) invite works too.
  v_json := public.send_practice_invitation(reqA, winA2);
  IF (v_json->>'proposed_starts_at') IS NULL THEN
    RAISE EXCEPTION 'ASSERTION SL7b FAILED: second slot not bindable';
  END IF;
  RAISE NOTICE 'SL7 ok: booked slot refused at invite time; other slots fine';

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'ALL SLOT ASSERTIONS PASSED';
  RAISE NOTICE '==============================================';
END $$;

ROLLBACK;
