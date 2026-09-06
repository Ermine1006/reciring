-- ============================================================
-- Mutu — decline cooldown assertions  (K1..K9)
--
-- Run AFTER scripts/migration-practice-cooldown.sql, in the Supabase
-- SQL Editor. Self-rolling-back: nothing it creates survives.
--
-- Proves the cooldown still protects the person who declined, that it
-- no longer penalises them, and that it is 14 days rather than 30.
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
  cid uuid := 'cccccccc-0000-0000-0000-00000000c001';
  -- uA invites, uB declines. uA is "the declined requester".
  uA uuid := 'cccccccc-0000-0000-0000-0000000000a1';
  uB uuid := 'cccccccc-0000-0000-0000-0000000000b2';
  reqA uuid; reqB uuid; pair uuid; n int;
BEGIN
  PERFORM pg_temp.god();

  -- clean slate for the throwaway ids
  DELETE FROM public.practice_pairings
   WHERE requester_user_id IN (uA,uB) OR addressee_user_id IN (uA,uB);
  DELETE FROM public.blocks
   WHERE blocker_id IN (uA,uB) OR blocked_user_id IN (uA,uB);
  DELETE FROM public.communities WHERE id = cid;
  DELETE FROM public.profiles    WHERE id IN (uA,uB);
  DELETE FROM auth.users         WHERE id IN (uA,uB);

  INSERT INTO auth.users (id, email) VALUES
    (uA,'cool-a@test.local'),(uB,'cool-b@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, name, access_status) VALUES
    (uA,'cool-a@test.local','Ada Cool','active'),
    (uB,'cool-b@test.local','Bo Cool','active');
  INSERT INTO public.communities (id, slug, name) VALUES (cid,'cooltest','Cool Test');
  INSERT INTO public.community_members (community_id, user_id, status) VALUES
    (cid,uA,'member'),(cid,uB,'member');

  -- reciprocal fit both ways, so nothing else can block the invite
  INSERT INTO public.practice_requests
    (user_id, community_id, want_types, help_types, status)
  VALUES (uA, cid, ARRAY['case'], ARRAY['behavioural'], 'active') RETURNING id INTO reqA;
  INSERT INTO public.practice_requests
    (user_id, community_id, want_types, help_types, status)
  VALUES (uB, cid, ARRAY['behavioural'], ARRAY['case'], 'active') RETURNING id INTO reqB;

  -- uA invites uB, uB declines. This is the state everything below tests.
  PERFORM pg_temp.impersonate(uA);
  PERFORM public.send_practice_invitation(reqB);
  PERFORM pg_temp.god();
  SELECT id INTO pair FROM public.practice_pairings
   WHERE requester_user_id = uA AND addressee_user_id = uB;
  IF pair IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: no pairing was created'; END IF;
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.decline_practice_invitation(pair);
  PERFORM pg_temp.god();

  -- ── K1: the declined requester still waits ──────────────────
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b
   WHERE b.request_id = reqB;
  PERFORM pg_temp.god();
  IF n <> 0 THEN
    RAISE EXCEPTION 'K1 FAIL: the declined requester can still see the member who declined';
  END IF;
  RAISE NOTICE 'K1 OK: the member whose invitation was declined still waits';

  -- ── K2: ...and still cannot re-invite ───────────────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.send_practice_invitation(reqB);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'K2 FAIL: the declined requester re-invited during the cooldown';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.god();
    IF SQLERRM LIKE 'K2 FAIL%' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM public.practice_pairings
   WHERE requester_user_id = uA AND addressee_user_id = uB AND status = 'invited';
  IF n <> 0 THEN RAISE EXCEPTION 'K2 FAIL: a second invitation row exists'; END IF;
  RAISE NOTICE 'K2 OK: no re-invitation, and nothing was written';

  -- ── K3: THE FIX — the person who declined is NOT locked out ─
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b
   WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF n <> 1 THEN
    RAISE EXCEPTION 'K3 FAIL: the member who declined cannot see the other member (expected 1, got %)', n;
  END IF;
  RAISE NOTICE 'K3 OK: declining no longer hides the other member from the person who declined';

  -- ── K4: ...and they may invite, if they change their mind ───
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.send_practice_invitation(reqA);
  PERFORM pg_temp.god();
  SELECT count(*) INTO n FROM public.practice_pairings
   WHERE requester_user_id = uB AND addressee_user_id = uA AND status = 'invited';
  IF n <> 1 THEN
    RAISE EXCEPTION 'K4 FAIL: the person who declined could not invite the other member';
  END IF;
  RAISE NOTICE 'K4 OK: the person who declined may reach out themselves';

  -- clear that new invitation so the window tests start clean
  PERFORM pg_temp.god();
  DELETE FROM public.practice_pairings
   WHERE requester_user_id = uB AND addressee_user_id = uA;

  -- ── K5: still blocked at 13 days ────────────────────────────
  UPDATE public.practice_pairings
     SET declined_at = now() - interval '13 days' WHERE id = pair;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqB;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'K5 FAIL: the cooldown ended too early'; END IF;
  RAISE NOTICE 'K5 OK: the cooldown still holds at 13 days';

  -- ── K6: free at 15 days ─────────────────────────────────────
  UPDATE public.practice_pairings
     SET declined_at = now() - interval '15 days' WHERE id = pair;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqB;
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'K6 FAIL: still hidden after 15 days (expected 1, got %)', n; END IF;
  RAISE NOTICE 'K6 OK: 14 days, not 30 — free again at 15 days';

  -- ── K7: blocks still hide BOTH directions, unconditionally ──
  PERFORM pg_temp.god();
  UPDATE public.practice_pairings SET declined_at = now() WHERE id = pair;
  INSERT INTO public.blocks (blocker_id, blocked_user_id) VALUES (uB, uA);
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'K7 FAIL: a block did not hide the blocked member'; END IF;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqB;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'K7 FAIL: a block did not hide in the other direction'; END IF;
  DELETE FROM public.blocks WHERE blocker_id = uB AND blocked_user_id = uA;
  RAISE NOTICE 'K7 OK: blocking still hides both directions, cooldown or not';

  -- ── K8: a LIVE pairing still hides the pair symmetrically ───
  UPDATE public.practice_pairings SET status = 'invited', declined_at = NULL WHERE id = pair;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqB;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'K8 FAIL: a live invitation stopped hiding the pair'; END IF;
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqA;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'K8 FAIL: a live invitation must hide BOTH sides'; END IF;
  RAISE NOTICE 'K8 OK: an open invitation still hides the pair from each other';

  -- ── K9: withdrawn and expired carry no cooldown at all ──────
  FOR n IN 1..1 LOOP END LOOP;
  UPDATE public.practice_pairings SET status = 'withdrawn' WHERE id = pair;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqB;
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'K9 FAIL: withdrawing must not start a cooldown'; END IF;
  UPDATE public.practice_pairings SET status = 'expired' WHERE id = pair;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.browse_practice_requests(cid) b WHERE b.request_id = reqB;
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'K9 FAIL: an expired invitation must not start a cooldown'; END IF;
  RAISE NOTICE 'K9 OK: only an explicit decline starts a cooldown';

  RAISE NOTICE '── decline cooldown: ALL ASSERTIONS PASSED ──';
END $$;

ROLLBACK;
