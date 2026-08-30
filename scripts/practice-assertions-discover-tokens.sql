-- ============================================================
-- Mutu — Discover Token minting assertions  (D1..D9)
--
-- Run AFTER scripts/migration-discover-tokens.sql, in the Supabase
-- SQL Editor. The whole suite runs inside one transaction and ROLLS
-- ITSELF BACK — nothing it creates survives.
--
-- Proves the Token keeps ONE meaning: two people completed and
-- verified an exchange together.
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
  cid  uuid := 'bbbbbbbb-0000-0000-0000-00000000c001';
  cid2 uuid := 'bbbbbbbb-0000-0000-0000-00000000c002';
  uA uuid := 'bbbbbbbb-0000-0000-0000-0000000000a1';
  uB uuid := 'bbbbbbbb-0000-0000-0000-0000000000b2';
  uC uuid := 'bbbbbbbb-0000-0000-0000-0000000000c3';   -- non-member
  uD uuid := 'bbbbbbbb-0000-0000-0000-0000000000d4';   -- shares TWO communities with A
  ev1 uuid; m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid;
  n int; tok record;
BEGIN
  PERFORM pg_temp.god();

  DELETE FROM public.matches
   WHERE requester_user_id IN (uA,uB,uC,uD) OR helper_user_id IN (uA,uB,uC,uD);
  DELETE FROM public.event_encounters
   WHERE user_id IN (uA,uB,uC,uD) OR encountered_user_id IN (uA,uB,uC,uD);
  DELETE FROM public.communities WHERE id IN (cid, cid2);
  DELETE FROM public.profiles WHERE id IN (uA,uB,uC,uD);
  DELETE FROM auth.users      WHERE id IN (uA,uB,uC,uD);

  INSERT INTO auth.users (id, email) VALUES
    (uA,'dt-a@test.local'),(uB,'dt-b@test.local'),
    (uC,'dt-c@test.local'),(uD,'dt-d@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, name, access_status) VALUES
    (uA,'dt-a@test.local','Ada Adams','active'),
    (uB,'dt-b@test.local','Ben Boyd','active'),
    (uC,'dt-c@test.local','Cy Chow','active'),
    (uD,'dt-d@test.local','Dee Diaz','active')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, name = EXCLUDED.name, access_status = EXCLUDED.access_status;
  INSERT INTO public.communities (id, slug, name) VALUES
    (cid,'dt-test','DT Test'), (cid2,'dt-other','DT Other')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.community_members (community_id, user_id, status, source) VALUES
    (cid,uA,'member','admin'),(cid,uB,'member','admin'),(cid,uD,'member','admin'),
    (cid2,uA,'member','admin'),(cid2,uD,'member','admin')
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status;

  INSERT INTO public.events (title, start_at, category, max_attendees, host_user_id, host_display_name)
  VALUES ('DT assertion event', now() - interval '5 days', 'Other', 10, uA, 'Ada Adams')
  RETURNING id INTO ev1;

  -- ── D1: the second confirmation mints exactly one shared token ──
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, event_id, identity_reveal_status)
  VALUES (uA, uB, 'active', 'community', ev1, 'accepted') RETURNING id INTO m1;
  INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m1, uA);
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE match_id = m1;
  IF n <> 0 THEN
    RAISE EXCEPTION 'D1 FAIL: one confirmation must never mint (got %)', n;
  END IF;
  INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m1, uB);
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE match_id = m1;
  IF n <> 1 THEN
    RAISE EXCEPTION 'D1 FAIL: the second confirmation should mint exactly 1 token (got %)', n;
  END IF;
  RAISE NOTICE 'D1 OK: a verified Discover exchange mints one shared Token';

  -- ── D2: the token is shared, community-scoped and well formed ───
  SELECT * INTO tok FROM public.practice_exchange_tokens WHERE match_id = m1;
  IF tok.user_lo <> LEAST(uA,uB) OR tok.user_hi <> GREATEST(uA,uB)
     OR tok.community_id <> cid
     OR tok.source <> 'discover'
     OR tok.session_id IS NOT NULL OR tok.pairing_id IS NOT NULL
     OR tok.verified_at IS NULL THEN
    RAISE EXCEPTION 'D2 FAIL: malformed discover token: %', tok;
  END IF;
  RAISE NOTICE 'D2 OK: one row, both parties, community scoped, no session';

  -- ── D3: minting is idempotent ───────────────────────────────────
  BEGIN
    INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m1, uA);
  EXCEPTION WHEN unique_violation THEN NULL;           -- re-tap is a no-op
  END;
  PERFORM public.mint_discover_token(m1);
  PERFORM public.mint_discover_token(m1);
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE match_id = m1;
  IF n <> 1 THEN
    RAISE EXCEPTION 'D3 FAIL: re-minting created % tokens', n;
  END IF;
  RAISE NOTICE 'D3 OK: one Token per exchange, no matter how often it runs';

  -- ── D4: a one-sided confirmation never mints ────────────────────
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, event_id, identity_reveal_status)
  VALUES (uA, uB, 'active', 'community', ev1, 'none') RETURNING id INTO m2;
  INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m2, uA);
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE match_id = m2;
  IF n <> 0 THEN RAISE EXCEPTION 'D4 FAIL: unilateral confirmation minted'; END IF;
  RAISE NOTICE 'D4 OK: one person confirming alone mints nothing';

  -- ── D5: the Together path is untouched by this trigger ──────────
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, identity_reveal_status)
  VALUES (uA, uB, 'active', 'practice', 'accepted') RETURNING id INTO m3;
  INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m3, uA), (m3, uB);
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE match_id = m3;
  IF n <> 0 THEN
    RAISE EXCEPTION 'D5 FAIL: a practice match must mint through the session flow only';
  END IF;
  RAISE NOTICE 'D5 OK: practice matches still mint only from a verified session';

  -- ── D6: meeting at an event is not a completed exchange ─────────
  INSERT INTO public.event_encounters (event_id, user_id, encountered_user_id, status, created_at, confirmed_at) VALUES
    (ev1, LEAST(uA,uB), GREATEST(uA,uB), 'mutually_confirmed', now() - interval '4 days', now() - interval '4 days'),
    (ev1, GREATEST(uA,uB), LEAST(uA,uB), 'mutually_confirmed', now() - interval '4 days', now() - interval '4 days');
  SELECT count(*) INTO n FROM public.practice_exchange_tokens
   WHERE user_lo = LEAST(uA,uB) AND user_hi = GREATEST(uA,uB);
  IF n <> 1 THEN
    RAISE EXCEPTION 'D6 FAIL: a mutually confirmed meeting must not mint (total %)', n;
  END IF;
  RAISE NOTICE 'D6 OK: meeting at an event mints nothing; only a verified exchange does';

  -- ── D7: a non-member pair mints nothing ─────────────────────────
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, identity_reveal_status)
  VALUES (uA, uC, 'active', 'community', 'accepted') RETURNING id INTO m4;
  INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m4, uA), (m4, uC);
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE match_id = m4;
  IF n <> 0 THEN RAISE EXCEPTION 'D7 FAIL: minted for a non-member'; END IF;
  RAISE NOTICE 'D7 OK: both people must be active members of one community';

  -- ── D8: an ambiguous pair of communities mints nothing ──────────
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, identity_reveal_status)
  VALUES (uA, uD, 'active', 'community', 'accepted') RETURNING id INTO m5;
  INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m5, uA), (m5, uD);
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE match_id = m5;
  IF n <> 0 THEN
    RAISE EXCEPTION 'D8 FAIL: a token must never guess which community it belongs to';
  END IF;
  RAISE NOTICE 'D8 OK: two shared communities mints nothing rather than guessing';

  -- ── D9: no client write path, and both participants can read ────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    INSERT INTO public.practice_exchange_tokens
           (session_id, pairing_id, match_id, source, community_id, user_lo, user_hi, exchange_types, verified_at)
    VALUES (NULL, NULL, m2, 'discover', cid, LEAST(uA,uB), GREATEST(uA,uB), '{}', now());
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'D9 FAIL: a member could mint their own token';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN RAISE;
    WHEN OTHERS THEN NULL;                    -- RLS refusal in any form
  END;
  PERFORM pg_temp.god();
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE match_id = m1;
  PERFORM pg_temp.god();
  IF n <> 1 THEN
    RAISE EXCEPTION 'D9 FAIL: the other participant should see the shared token (saw %)', n;
  END IF;
  RAISE NOTICE 'D9 OK: minted server side only, visible to both participants';

  RAISE NOTICE '── discover tokens: ALL ASSERTIONS PASSED ──';
END $$;

ROLLBACK;
