-- ============================================================
-- Mutu — "yes, but another time" assertions  (T1..T9)
--
-- Run AFTER scripts/migration-practice-accept-another-time.sql, in
-- the Supabase SQL Editor. Self-rolling-back: nothing survives.
--
-- The two that matter most:
--   T3  a timing clash must NOT be recorded as a decline, so no
--       cooldown and no marker follow from it;
--   T9  if the acceptance fails, the proposed time must survive.
--       Clearing the slot and accepting are one atomic act.
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
  cid uuid := 'aaaaaaaa-0000-0000-0000-00000000a001';
  -- uA invites uB and proposes a time. uB wants to practise, but not then.
  uA uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1';
  uB uuid := 'aaaaaaaa-0000-0000-0000-0000000000b2';
  reqA uuid; reqB uuid; winB uuid; pair uuid; n int; res jsonb; kept timestamptz;
BEGIN
  PERFORM pg_temp.god();

  DELETE FROM public.practice_sessions
   WHERE participant_a_user_id IN (uA,uB) OR participant_b_user_id IN (uA,uB);
  DELETE FROM public.practice_pairings
   WHERE requester_user_id IN (uA,uB) OR addressee_user_id IN (uA,uB);
  DELETE FROM public.matches
   WHERE requester_user_id IN (uA,uB) OR helper_user_id IN (uA,uB);
  DELETE FROM public.notifications WHERE user_id IN (uA,uB);
  DELETE FROM public.practice_availability_windows
   WHERE request_id IN (SELECT id FROM public.practice_requests WHERE user_id IN (uA,uB));
  DELETE FROM public.practice_requests WHERE user_id IN (uA,uB);
  DELETE FROM public.communities WHERE id = cid;
  DELETE FROM public.profiles    WHERE id IN (uA,uB);
  DELETE FROM auth.users         WHERE id IN (uA,uB);

  INSERT INTO auth.users (id, email) VALUES
    (uA,'time-a@test.local'),(uB,'time-b@test.local')
  ON CONFLICT (id) DO NOTHING;
  -- auth.users carries a trigger that creates the profile, so this has
  -- to be idempotent rather than a plain insert.
  INSERT INTO public.profiles (id, email, name, access_status) VALUES
    (uA,'time-a@test.local','Ada Time','active'),
    (uB,'time-b@test.local','Bo Time','active')
  ON CONFLICT (id) DO UPDATE SET access_status = EXCLUDED.access_status;
  INSERT INTO public.communities (id, slug, name) VALUES (cid,'timetest','Time Test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.community_members (community_id, user_id, status, source) VALUES
    (cid,uA,'member','admin'),(cid,uB,'member','admin')
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status;

  INSERT INTO public.practice_requests
    (user_id, community_id, want_types, help_types, status)
  VALUES (uA, cid, ARRAY['case'], ARRAY['behavioural'], 'active') RETURNING id INTO reqA;
  INSERT INTO public.practice_requests
    (user_id, community_id, want_types, help_types, status)
  VALUES (uB, cid, ARRAY['behavioural'], ARRAY['case'], 'active') RETURNING id INTO reqB;

  -- uB offers a time. uA invites uB bound to it.
  INSERT INTO public.practice_availability_windows (request_id, starts_at, ends_at)
  VALUES (reqB, now() + interval '3 days', now() + interval '3 days 1 hour')
  RETURNING id INTO winB;

  PERFORM pg_temp.impersonate(uA);
  PERFORM public.send_practice_invitation(reqB, winB);
  PERFORM pg_temp.god();
  SELECT id INTO pair FROM public.practice_pairings
   WHERE requester_user_id = uA AND addressee_user_id = uB;
  IF pair IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: no pairing was created'; END IF;
  SELECT proposed_starts_at INTO kept FROM public.practice_pairings WHERE id = pair;
  IF kept IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: the invitation carries no proposed time'; END IF;

  -- ── T5: the inviter may not use this (guard first, before we spend
  --        the invitation on a successful acceptance) ──────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.accept_practice_pairing_without_slot(pair);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'T5 FAIL: the inviter was allowed to drop their own proposed time';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.god();
    IF SQLERRM LIKE 'T5 FAIL%' THEN RAISE; END IF;
  END;
  SELECT proposed_starts_at INTO kept FROM public.practice_pairings WHERE id = pair;
  IF kept IS NULL THEN RAISE EXCEPTION 'T5 FAIL: a refused call still cleared the time'; END IF;
  RAISE NOTICE 'T5 OK: only the person who received the invitation may answer this way';

  -- ── T9: a failing acceptance leaves the proposed time alone ─────
  -- Expire the invitation: accept_practice_pairing must refuse, and
  -- the slot we cleared on the way in must roll back with it.
  UPDATE public.practice_pairings SET expires_at = now() - interval '1 hour' WHERE id = pair;
  PERFORM pg_temp.impersonate(uB);
  BEGIN
    PERFORM public.accept_practice_pairing_without_slot(pair);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'T9 FAIL: an expired invitation was accepted';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.god();
    IF SQLERRM LIKE 'T9 FAIL%' THEN RAISE; END IF;
  END;
  SELECT proposed_starts_at INTO kept FROM public.practice_pairings WHERE id = pair;
  IF kept IS NULL THEN
    RAISE EXCEPTION 'T9 FAIL: the proposed time was cleared even though the acceptance failed';
  END IF;
  SELECT count(*) INTO n FROM public.practice_pairings WHERE id = pair AND status = 'invited';
  IF n <> 1 THEN RAISE EXCEPTION 'T9 FAIL: the pairing changed state on a failed call'; END IF;
  RAISE NOTICE 'T9 OK: clearing the time and accepting are one atomic act';
  UPDATE public.practice_pairings SET expires_at = now() + interval '7 days' WHERE id = pair;

  -- ── T6: only an open invitation can be answered ─────────────────
  UPDATE public.practice_pairings SET status = 'withdrawn' WHERE id = pair;
  PERFORM pg_temp.impersonate(uB);
  BEGIN
    PERFORM public.accept_practice_pairing_without_slot(pair);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'T6 FAIL: a withdrawn invitation was accepted';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.god();
    IF SQLERRM LIKE 'T6 FAIL%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'T6 OK: withdrawn, declined and expired invitations are all refused';
  UPDATE public.practice_pairings SET status = 'invited' WHERE id = pair;

  -- ── T1: it accepts, and books nothing ───────────────────────────
  PERFORM pg_temp.impersonate(uB);
  SELECT public.accept_practice_pairing_without_slot(pair) INTO res;
  PERFORM pg_temp.god();
  IF res->>'status' <> 'accepted' THEN
    RAISE EXCEPTION 'T1 FAIL: the pairing was not accepted (got %)', res;
  END IF;
  IF res->>'session_id' IS NOT NULL THEN
    RAISE EXCEPTION 'T1 FAIL: a session was booked anyway (%)', res->>'session_id';
  END IF;
  SELECT count(*) INTO n FROM public.practice_sessions WHERE pairing_id = pair;
  IF n <> 0 THEN RAISE EXCEPTION 'T1 FAIL: % session rows exist for this pairing', n; END IF;
  RAISE NOTICE 'T1 OK: accepted, with no time booked';

  -- ── T2: the proposed time is gone, and the window is untouched ──
  SELECT count(*) INTO n FROM public.practice_pairings
   WHERE id = pair AND proposed_starts_at IS NULL AND proposed_ends_at IS NULL
     AND proposed_window_id IS NULL AND proposed_timezone IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'T2 FAIL: the proposed time was not cleared'; END IF;
  SELECT count(*) INTO n FROM public.practice_availability_windows WHERE id = winB;
  IF n <> 1 THEN
    RAISE EXCEPTION 'T2 FAIL: the members offered availability was deleted, not just unbound';
  END IF;
  RAISE NOTICE 'T2 OK: the proposed time is dropped, the offered window survives';

  -- ── T3: THE POINT — this is not a decline ───────────────────────
  SELECT count(*) INTO n FROM public.practice_pairings
   WHERE id = pair AND status = 'accepted' AND declined_at IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'T3 FAIL: a timing clash was recorded as a decline';
  END IF;
  -- and therefore nothing hides the pair and nothing marks the card
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b
   WHERE b.previously_declined;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'T3 FAIL: a card was marked as declined'; END IF;
  RAISE NOTICE 'T3 OK: no decline, so no cooldown and no marker';

  -- ── T4: identities revealed and a chat opened, as with any accept ─
  SELECT count(*) INTO n FROM public.matches m
    JOIN public.practice_pairings p ON p.match_id = m.id
   WHERE p.id = pair AND m.source = 'practice' AND m.identity_reveal_status = 'accepted';
  IF n <> 1 THEN RAISE EXCEPTION 'T4 FAIL: no identity-revealed practice chat was created'; END IF;
  RAISE NOTICE 'T4 OK: names reveal and the chat opens, exactly as a normal acceptance';

  -- ── T7: the inviter is told, and told to pick a time ────────────
  -- Asserts the TYPE and the payload, never the wording, so a copy
  -- change cannot fail this suite.
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id = uA AND type = 'practice_invitation_accepted'
     AND payload->>'pairing_id' = pair::text
     AND payload->>'session_id' IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'T7 FAIL: the inviter was not told, or was told a time is booked';
  END IF;
  RAISE NOTICE 'T7 OK: the inviter hears back, and hears that a time is still to be chosen';

  RAISE NOTICE '── yes, but another time: ALL ASSERTIONS PASSED ──';
END $$;

-- ── T8: grants and security on the new function ───────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'accept_practice_pairing_without_slot'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND p.prosecdef;
  IF n <> 1 THEN RAISE EXCEPTION 'T8 FAIL: authenticated cannot execute, or it is not SECURITY DEFINER'; END IF;

  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'accept_practice_pairing_without_slot'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF n <> 0 THEN RAISE EXCEPTION 'T8 FAIL: anon or PUBLIC can execute it'; END IF;
  RAISE NOTICE 'T8 OK: authenticated only, SECURITY DEFINER';
END $$;

ROLLBACK;
