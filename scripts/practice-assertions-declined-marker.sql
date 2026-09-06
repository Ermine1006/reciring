-- ============================================================
-- Mutu — "you declined this one" marker assertions  (D1..D7)
--
-- Run AFTER scripts/migration-practice-declined-marker.sql, in the
-- Supabase SQL Editor. Self-rolling-back: nothing it creates survives.
--
-- The privacy-critical one is D3. The marker must appear ONLY for the
-- person who did the declining. If it ever appeared for the person who
-- WAS declined, the anonymous pool would be telling them which member
-- turned them down.
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
  cid  uuid := 'dddddddd-0000-0000-0000-00000000d001';
  -- a second community, used only to prove the marker is scoped
  cid2 uuid := 'dddddddd-0000-0000-0000-00000000d999';
  -- uA invites, uB declines. uC never interacts with anybody.
  uA uuid := 'dddddddd-0000-0000-0000-0000000000a1';
  uB uuid := 'dddddddd-0000-0000-0000-0000000000b2';
  uC uuid := 'dddddddd-0000-0000-0000-0000000000c3';
  reqA uuid; reqB uuid; reqC uuid; pair uuid; n int; flag boolean;
BEGIN
  PERFORM pg_temp.god();

  DELETE FROM public.practice_pairings
   WHERE requester_user_id IN (uA,uB,uC) OR addressee_user_id IN (uA,uB,uC);
  DELETE FROM public.blocks
   WHERE blocker_id IN (uA,uB,uC) OR blocked_user_id IN (uA,uB,uC);
  DELETE FROM public.practice_requests WHERE user_id IN (uA,uB,uC);
  DELETE FROM public.communities WHERE id IN (cid, cid2);
  DELETE FROM public.profiles    WHERE id IN (uA,uB,uC);
  DELETE FROM auth.users         WHERE id IN (uA,uB,uC);

  INSERT INTO auth.users (id, email) VALUES
    (uA,'mark-a@test.local'),(uB,'mark-b@test.local'),(uC,'mark-c@test.local')
  ON CONFLICT (id) DO NOTHING;
  -- auth.users carries a trigger that creates the profile, so this has
  -- to be idempotent rather than a plain insert.
  INSERT INTO public.profiles (id, email, name, access_status) VALUES
    (uA,'mark-a@test.local','Ada Mark','active'),
    (uB,'mark-b@test.local','Bo Mark','active'),
    (uC,'mark-c@test.local','Cy Mark','active')
  ON CONFLICT (id) DO UPDATE SET access_status = EXCLUDED.access_status;
  INSERT INTO public.communities (id, slug, name) VALUES
    (cid,'marktest','Mark Test'),(cid2,'marktest2','Mark Test Elsewhere')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.community_members (community_id, user_id, status, source) VALUES
    (cid,uA,'member','admin'),(cid,uB,'member','admin'),(cid,uC,'member','admin')
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status;

  -- A and C want what B offers, and offer what B wants.
  INSERT INTO public.practice_requests
    (user_id, community_id, want_types, help_types, status)
  VALUES (uA, cid, ARRAY['case'], ARRAY['behavioural'], 'active') RETURNING id INTO reqA;
  INSERT INTO public.practice_requests
    (user_id, community_id, want_types, help_types, status)
  VALUES (uB, cid, ARRAY['behavioural'], ARRAY['case'], 'active') RETURNING id INTO reqB;
  INSERT INTO public.practice_requests
    (user_id, community_id, want_types, help_types, status)
  VALUES (uC, cid, ARRAY['case'], ARRAY['behavioural'], 'active') RETURNING id INTO reqC;

  -- uA invites uB. uB declines.
  PERFORM pg_temp.impersonate(uA);
  PERFORM public.send_practice_invitation(reqB);
  PERFORM pg_temp.god();
  SELECT id INTO pair FROM public.practice_pairings
   WHERE requester_user_id = uA AND addressee_user_id = uB;
  IF pair IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: no pairing was created'; END IF;
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.decline_practice_invitation(pair);
  PERFORM pg_temp.god();

  -- ── D1: the person who declined sees the marker ─────────────
  PERFORM pg_temp.impersonate(uB);
  SELECT b.previously_declined INTO flag
    FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF flag IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'D1 FAIL: the card of the member you declined is not marked (got %)', flag;
  END IF;
  RAISE NOTICE 'D1 OK: the card you already declined is marked, for you';

  -- ── D2: every other card is FALSE, never NULL ───────────────
  PERFORM pg_temp.impersonate(uB);
  SELECT b.previously_declined INTO flag
    FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqC;
  PERFORM pg_temp.god();
  IF flag IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'D2 FAIL: an untouched card is not false (got %)', flag;
  END IF;
  RAISE NOTICE 'D2 OK: cards you have no history with are false, not null';

  -- ── D3: PRIVACY — never marked for the person who WAS declined ──
  -- During the cooldown uA cannot see uB at all, so age the decline
  -- past 14 days and check the card uA then gets.
  UPDATE public.practice_pairings
     SET declined_at = now() - interval '15 days' WHERE id = pair;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqB;
  SELECT b.previously_declined INTO flag
    FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqB;
  PERFORM pg_temp.god();
  IF n <> 1 THEN
    RAISE EXCEPTION 'D3 SETUP FAILED: uA should see uB again after the cooldown';
  END IF;
  IF flag IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'D3 FAIL: the pool told the member WHO declined them (got %)', flag;
  END IF;
  RAISE NOTICE 'D3 OK: being declined is never revealed to the person who was declined';

  -- ── D4: only an explicit decline marks anything ─────────────
  UPDATE public.practice_pairings
     SET status = 'withdrawn', declined_at = now() WHERE id = pair;
  PERFORM pg_temp.impersonate(uB);
  SELECT b.previously_declined INTO flag
    FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF flag IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'D4 FAIL: a withdrawn invitation was marked as declined';
  END IF;
  UPDATE public.practice_pairings
     SET status = 'expired' WHERE id = pair;
  PERFORM pg_temp.impersonate(uB);
  SELECT b.previously_declined INTO flag
    FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF flag IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'D4 FAIL: an expired invitation was marked as declined';
  END IF;
  RAISE NOTICE 'D4 OK: withdrawn and expired invitations are not declines';

  -- ── D5: the marker does not leak across communities ─────────
  PERFORM pg_temp.god();
  UPDATE public.practice_pairings
     SET status = 'declined', declined_at = now() WHERE id = pair;
  PERFORM pg_temp.impersonate(uB);
  SELECT b.previously_declined INTO flag
    FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF flag IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'D5 SETUP FAILED: expected the decline to be marked again';
  END IF;
  UPDATE public.practice_pairings
     SET community_id = cid2 WHERE id = pair;
  PERFORM pg_temp.impersonate(uB);
  SELECT b.previously_declined INTO flag
    FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF flag IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'D5 FAIL: a decline in another community marked this one';
  END IF;
  UPDATE public.practice_pairings SET community_id = cid WHERE id = pair;
  RAISE NOTICE 'D5 OK: the marker is scoped to the community you are browsing';

  -- ── D6: everything else about browse is unchanged ───────────
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b
   WHERE b.request_id = reqA AND b.mutual_fit AND b.windows = '[]'::jsonb
     AND b.community_id = cid;
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'D6 FAIL: the rest of the browse row changed shape'; END IF;
  -- a live invitation must still hide the pair from BOTH sides
  UPDATE public.practice_pairings SET status = 'invited', declined_at = NULL WHERE id = pair;
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'D6 FAIL: an open invitation stopped hiding the pair'; END IF;
  RAISE NOTICE 'D6 OK: fit, windows, scoping and hiding all behave as before';

  RAISE NOTICE '── declined marker: ALL ASSERTIONS PASSED ──';
END $$;

-- ── D7: the recreated function kept its grants ────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'browse_practice_requests'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF n <> 1 THEN RAISE EXCEPTION 'D7 FAIL: authenticated lost EXECUTE after the drop/create'; END IF;

  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'browse_practice_requests'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF n <> 0 THEN RAISE EXCEPTION 'D7 FAIL: anon or PUBLIC can execute browse'; END IF;

  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'browse_practice_requests'
     AND p.prosecdef AND p.provolatile = 's';
  IF n <> 1 THEN RAISE EXCEPTION 'D7 FAIL: the function is no longer SECURITY DEFINER STABLE'; END IF;
  RAISE NOTICE 'D7 OK: grants, SECURITY DEFINER and STABLE all survived the recreate';
END $$;

ROLLBACK;
