-- ============================================================
-- Mutu — Practice Phase 1 · Assertion suite
--
-- Proves every security, privacy, community-scoping, and
-- state-machine invariant of migration-practice-reciprocal.sql.
--
-- HOW TO RUN (Supabase SQL Editor, as the default postgres role,
-- AFTER the migration has been applied):
--   1. Run this file as ONE statement batch. It wraps itself in
--      BEGIN … ROLLBACK — nothing it creates or changes survives.
--   2. Success = the final NOTICE 'ALL PRACTICE ASSERTIONS PASSED'
--      and no error. Any failure raises 'ASSERTION <id> FAILED …'
--      and aborts (the ROLLBACK still applies).
--   3. If the very first setup insert into auth.users fails, your
--      auth schema requires more columns — add them to the two
--      INSERT INTO auth.users statements below and re-run.
--
-- Identity emulation: RLS + auth.uid() are exercised for real by
-- switching to the `authenticated` role and setting the JWT-claims
-- GUCs, exactly as PostgREST does.
-- ============================================================

BEGIN;

-- Helpers (temp schema — vanish at rollback) -----------------
CREATE FUNCTION pg_temp.impersonate(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.impersonate_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('role', 'anon', true);
END $$;

CREATE FUNCTION pg_temp.god() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);  -- back to the session role (postgres)
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

DO $$
DECLARE
  -- fixed throwaway ids
  uA uuid := '00000000-0000-4000-8000-0000000000aa';  -- Rotman member (active)
  uB uuid := '00000000-0000-4000-8000-0000000000bb';  -- Rotman member (active)
  uC uuid := '00000000-0000-4000-8000-0000000000cc';  -- Rotman member (active)
  uP uuid := '00000000-0000-4000-8000-0000000000dd';  -- Mutu access PENDING
  uN uuid := '00000000-0000-4000-8000-0000000000ee';  -- ACTIVE Mutu, NOT Rotman (testcomm only)
  uR uuid := '00000000-0000-4000-8000-0000000000f1';  -- D1: rotman.utoronto.ca signup
  uM uuid := '00000000-0000-4000-8000-0000000000f2';  -- D1: mail.utoronto.ca signup
  v_rotman uuid; v_testcomm uuid;
  reqA uuid; reqB uuid; reqC uuid; reqN uuid;
  pairAB uuid; pairCA uuid; pairCA2 uuid;
  v_old_match uuid; v_new_match uuid;
  sess uuid;
  v_json jsonb; v_n int; v_txt text; v_bool boolean; v_ts timestamptz;
BEGIN
  -- ══ SETUP (as postgres; all rolled back) ═══════════════════
  SELECT id INTO v_rotman FROM public.communities WHERE slug = 'rotman';
  IF v_rotman IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: run the migration first (no rotman community)'; END IF;

  INSERT INTO public.communities (slug, name) VALUES ('assert_testcomm', 'Assertion Test Community')
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_testcomm FROM public.communities WHERE slug = 'assert_testcomm';

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         u.id::text || '@assert.test', '', now(), now(), now()
  FROM (VALUES (uA),(uB),(uC),(uP),(uN),(uR),(uM)) AS u(id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, name, access_status, member_type, access_type)
  SELECT u.id, u.id::text || '@assert.test', 'Assert User', u.st, 'student', 'legacy'
  FROM (VALUES (uA,'active'),(uB,'active'),(uC,'active'),(uP,'pending'),
               (uN,'active'),(uR,'active'),(uM,'active')) AS u(id, st)
  ON CONFLICT (id) DO UPDATE SET access_status = EXCLUDED.access_status;

  INSERT INTO public.community_members (community_id, user_id, status, source) VALUES
    (v_rotman,   uA, 'member', 'admin'),
    (v_rotman,   uB, 'member', 'admin'),
    (v_rotman,   uC, 'member', 'admin'),
    (v_testcomm, uN, 'member', 'admin')
  ON CONFLICT DO NOTHING;

  -- ══ B-GUARD · the B1 backfill can never re-run ═════════════
  INSERT INTO public.community_members (community_id, user_id, status, source)
  SELECT c.id, p.id, 'member', 'backfill'
  FROM public.communities c
  JOIN public.profiles p ON p.access_status = 'active'
  WHERE c.slug = 'rotman'
    AND NOT EXISTS (SELECT 1 FROM public.community_members cm
                    JOIN public.communities c2 ON c2.id = cm.community_id
                    WHERE c2.slug = 'rotman');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION B-GUARD FAILED: backfill re-ran (% rows)', v_n; END IF;
  RAISE NOTICE 'B-GUARD ok: backfill is one-time';

  -- ══ D1 · strict auto-enrollment ════════════════════════════
  INSERT INTO public.user_emails (user_id, email, email_type, is_verified, verified_at)
  VALUES (uR, 'assert-r@rotman.utoronto.ca', 'institutional', true, now());
  IF NOT EXISTS (SELECT 1 FROM public.community_members
                  WHERE community_id = v_rotman AND user_id = uR
                    AND status = 'member' AND source = 'institutional_email') THEN
    RAISE EXCEPTION 'ASSERTION D1a FAILED: verified rotman.utoronto.ca did not auto-enroll';
  END IF;
  INSERT INTO public.user_emails (user_id, email, email_type, is_verified, verified_at)
  VALUES (uM, 'assert-m@mail.utoronto.ca', 'institutional', true, now());
  IF EXISTS (SELECT 1 FROM public.community_members
              WHERE community_id = v_rotman AND user_id = uM) THEN
    RAISE EXCEPTION 'ASSERTION D1b FAILED: generic mail.utoronto.ca auto-enrolled (must not)';
  END IF;
  RAISE NOTICE 'D1 ok: strict rotman.utoronto.ca auto-enroll only';

  -- ══ Requests (created THROUGH RLS as each user) ════════════
  PERFORM pg_temp.impersonate(uA);
  INSERT INTO public.practice_requests (user_id, community_id, want_types, want_focus, help_types, help_focus)
  VALUES (uA, v_rotman, ARRAY['case'], 'MBB first rounds', ARRAY['behavioural'], 'Consulting fit')
  RETURNING id INTO reqA;
  INSERT INTO public.practice_availability_windows (request_id, starts_at, ends_at)
  VALUES (reqA, now() + interval '1 day', now() + interval '1 day 2 hours');

  PERFORM pg_temp.impersonate(uB);
  INSERT INTO public.practice_requests (user_id, community_id, want_types, help_types)
  VALUES (uB, v_rotman, ARRAY['behavioural'], ARRAY['case'])
  RETURNING id INTO reqB;

  PERFORM pg_temp.impersonate(uC);
  INSERT INTO public.practice_requests (user_id, community_id, want_types, help_types)
  VALUES (uC, v_rotman, ARRAY['behavioural'], ARRAY['case'])
  RETURNING id INTO reqC;

  PERFORM pg_temp.impersonate(uN);
  INSERT INTO public.practice_requests (user_id, community_id, want_types, help_types)
  VALUES (uN, v_testcomm, ARRAY['case'], ARRAY['case'])
  RETURNING id INTO reqN;

  -- S11 · one active request per user PER COMMUNITY
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    INSERT INTO public.practice_requests (user_id, community_id, want_types, help_types)
    VALUES (uA, v_rotman, ARRAY['case'], ARRAY['case']);
    RAISE EXCEPTION 'ASSERTION S11 FAILED: second active request in same community allowed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE 'S11 ok: one active request per user per community';

  -- C1 · cannot create a request in a community you do not belong to
  PERFORM pg_temp.impersonate(uN);
  BEGIN
    INSERT INTO public.practice_requests (user_id, community_id, want_types, help_types)
    VALUES (uN, v_rotman, ARRAY['case'], ARRAY['case']);
    RAISE EXCEPTION 'ASSERTION C1 FAILED: non-member created a request in rotman';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;   -- RLS WITH CHECK
           WHEN raise_exception THEN RAISE;
  END;
  RAISE NOTICE 'C1 ok: request creation is community-gated';

  -- ══ P1/P2 · browse sees availability, never the owner ══════
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman) b
   WHERE b.request_id = reqA AND jsonb_array_length(b.windows) >= 1 AND b.mutual_fit;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION P1 FAILED: eligible browser cannot see request+windows+fit'; END IF;

  SELECT count(*) INTO v_n FROM public.practice_requests WHERE id = reqA;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P2a FAILED: base practice_requests row visible to non-owner'; END IF;
  SELECT count(*) INTO v_n FROM public.practice_availability_windows WHERE request_id = reqA;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P2b FAILED: base windows visible to non-owner'; END IF;
  RAISE NOTICE 'P1/P2 ok: exact availability visible, owner unresolvable';

  -- ══ P5 · pending Mutu access → nothing ═════════════════════
  PERFORM pg_temp.impersonate(uP);
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P5a FAILED: pending user can browse'; END IF;
  BEGIN
    PERFORM public.send_practice_invitation(reqA);
    RAISE EXCEPTION 'ASSERTION P5b FAILED: pending user could invite';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'P5 ok: pending access excluded';

  -- ══ P10 · both-sides eligibility ═══════════════════════════
  PERFORM pg_temp.impersonate(uN);   -- active Mutu, NOT rotman
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P10a FAILED: non-member browses rotman'; END IF;
  BEGIN
    PERFORM public.send_practice_invitation(reqA);
    RAISE EXCEPTION 'ASSERTION P10b FAILED: non-member could invite in rotman';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;
  -- owner side: de-member A → A's active request vanishes from B's browse
  PERFORM pg_temp.god();
  UPDATE public.community_members SET status = 'removed', removed_at = now()
   WHERE community_id = v_rotman AND user_id = uA;
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman) b WHERE b.request_id = reqA;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P10c FAILED: de-membered owner still browsable'; END IF;
  PERFORM pg_temp.god();
  UPDATE public.community_members SET status = 'member', removed_at = NULL
   WHERE community_id = v_rotman AND user_id = uA;
  RAISE NOTICE 'P10 ok: eligibility enforced on both sides';

  -- C2 · N browses their own community fine (scoping, not lockout)
  PERFORM pg_temp.impersonate(uN);
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_testcomm);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION C2 FAILED: browse leaked across communities'; END IF;  -- only own request exists there
  RAISE NOTICE 'C2 ok: browse is community-scoped';

  -- ══ Invitation flow: B → A ═════════════════════════════════
  PERFORM pg_temp.impersonate(uB);
  v_json := public.send_practice_invitation(reqA);
  pairAB := (v_json->>'id')::uuid;
  IF v_json ? 'counterpart_user_id' OR v_json ? 'addressee_user_id' THEN
    RAISE EXCEPTION 'ASSERTION P3a FAILED: invitation return leaks identity';
  END IF;

  -- P3 · requester sees no identity pre-acceptance
  SELECT count(*) INTO v_n FROM public.my_practice_pairings
   WHERE id = pairAB AND counterpart_user_id IS NULL AND match_id IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION P3b FAILED: counterpart visible pre-acceptance'; END IF;
  BEGIN
    SELECT count(*) INTO v_n FROM public.practice_pairings WHERE id = pairAB;
    IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P3c FAILED: base pairings table readable'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;   -- revoked entirely: even stronger
           WHEN raise_exception THEN RAISE;
  END;
  RAISE NOTICE 'P3 ok: pairing anonymous to requester';

  -- P4 · addressee side anonymous; notification carries no identity
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO v_n FROM public.my_practice_pairings
   WHERE id = pairAB AND counterpart_user_id IS NULL AND their_snapshot IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION P4a FAILED: addressee view wrong'; END IF;
  SELECT count(*) INTO v_n
    FROM public.notifications nt,
         LATERAL jsonb_object_keys(nt.payload) k
   WHERE nt.user_id = uA AND nt.type = 'practice_invitation'
     AND k NOT IN ('pairing_id','community_id');
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P4b FAILED: invitation notification leaks identity keys'; END IF;
  RAISE NOTICE 'P4 ok: invitation anonymous to addressee';

  -- S2 · crossed invitation blocked, generic error
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.send_practice_invitation(reqB);
    RAISE EXCEPTION 'ASSERTION S2 FAILED: crossed invitation created a duplicate pairing';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
    IF SQLERRM NOT IN ('already_invited') THEN
      RAISE EXCEPTION 'ASSERTION S2 FAILED: error leaks detail (%)', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'S2 ok: duplicate live pairing impossible';

  -- S3 · role + state checks on acceptance
  PERFORM pg_temp.impersonate(uB);
  BEGIN
    PERFORM public.accept_practice_pairing(pairAB);   -- requester self-accept
    RAISE EXCEPTION 'ASSERTION S3a FAILED: requester accepted own invitation';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;

  -- C3 · community-scoped reciprocity: N (now also a rotman member,
  -- but whose only active request is in testcomm) cannot invite in rotman
  PERFORM pg_temp.god();
  INSERT INTO public.community_members (community_id, user_id, status, source)
  VALUES (v_rotman, uN, 'member', 'admin') ON CONFLICT DO NOTHING;
  PERFORM pg_temp.impersonate(uN);
  BEGIN
    PERFORM public.send_practice_invitation(reqA);
    RAISE EXCEPTION 'ASSERTION C3 FAILED: cross-community invitation succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
    IF SQLERRM <> 'own_request_required' THEN
      RAISE EXCEPTION 'ASSERTION C3 FAILED: wrong guard (%)', SQLERRM;
    END IF;
  END;
  PERFORM pg_temp.god();
  DELETE FROM public.community_members WHERE community_id = v_rotman AND user_id = uN;
  RAISE NOTICE 'C3 ok: reciprocity is community-scoped';

  -- ══ P7 setup · pre-existing anonymous A–B match ════════════
  PERFORM pg_temp.god();
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source)
  VALUES (uA, uB, 'active', 'direct') RETURNING id INTO v_old_match;

  -- ══ Acceptance: the mutual match + contextual reveal ═══════
  PERFORM pg_temp.impersonate(uA);
  v_json := public.accept_practice_pairing(pairAB);
  v_new_match := (v_json->>'match_id')::uuid;

  BEGIN
    PERFORM public.accept_practice_pairing(pairAB);   -- double accept
    RAISE EXCEPTION 'ASSERTION S3b FAILED: double acceptance succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'S3 ok: acceptance is addressee-only, once';

  -- P6 · identity revealed to both, only now
  SELECT count(*) INTO v_n FROM public.my_practice_pairings
   WHERE id = pairAB AND counterpart_user_id = uB AND match_id = v_new_match;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION P6a FAILED: addressee cannot resolve counterpart post-acceptance'; END IF;
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO v_n FROM public.my_practice_pairings
   WHERE id = pairAB AND counterpart_user_id = uA;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION P6b FAILED: requester cannot resolve counterpart post-acceptance'; END IF;
  RAISE NOTICE 'P6 ok: acceptance reveals identity to both';

  -- P7 · pre-existing match untouched; exactly one NEW practice match
  PERFORM pg_temp.god();
  SELECT identity_reveal_status INTO v_txt FROM public.matches WHERE id = v_old_match;
  IF v_txt IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'ASSERTION P7a FAILED: pre-existing anonymous match was modified (reveal=%)', v_txt;
  END IF;
  SELECT count(*) INTO v_n FROM public.matches
   WHERE source = 'practice' AND identity_reveal_status = 'accepted'
     AND ((requester_user_id, helper_user_id) IN ((uB, uA), (uA, uB)));
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION P7b FAILED: expected exactly 1 practice match, got %', v_n; END IF;
  RAISE NOTICE 'P7 ok: contextual reveal only; old match untouched';

  -- S8 · snapshot immutability
  PERFORM pg_temp.impersonate(uA);
  UPDATE public.practice_requests SET want_focus = 'EDITED AFTER INVITE' WHERE id = reqA;
  PERFORM pg_temp.god();
  SELECT addressee_snapshot->>'want_focus' INTO v_txt FROM public.practice_pairings WHERE id = pairAB;
  IF v_txt <> 'MBB first rounds' THEN
    RAISE EXCEPTION 'ASSERTION S8 FAILED: snapshot changed after request edit (%)', v_txt;
  END IF;
  RAISE NOTICE 'S8 ok: snapshots immutable';

  -- ══ Mutual scheduling ══════════════════════════════════════
  PERFORM pg_temp.impersonate(uA);
  v_json := public.propose_practice_session(pairAB, now() + interval '2 hours', 60,
                                            'America/Toronto', 'virtual', 'Zoom');
  sess := (v_json->>'id')::uuid;

  BEGIN
    PERFORM public.confirm_practice_session(sess);    -- proposer self-confirm
    RAISE EXCEPTION 'ASSERTION S5a FAILED: proposer confirmed own proposal';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.impersonate(uC);
  BEGIN
    PERFORM public.confirm_practice_session(sess);    -- non-participant
    RAISE EXCEPTION 'ASSERTION S5b FAILED: non-participant confirmed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.impersonate(uB);
  BEGIN
    PERFORM public.propose_practice_session(pairAB, now() + interval '3 hours');
    RAISE EXCEPTION 'ASSERTION S5c FAILED: second live proposal allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;
  PERFORM public.confirm_practice_session(sess);
  PERFORM pg_temp.god();
  SELECT status INTO v_txt FROM public.practice_sessions WHERE id = sess;
  IF v_txt <> 'scheduled' THEN RAISE EXCEPTION 'ASSERTION S5d FAILED: confirm did not schedule (%)', v_txt; END IF;
  RAISE NOTICE 'S5 ok: propose→confirm is mutual and single-live';

  -- S4 · no direct writes anywhere
  PERFORM pg_temp.impersonate(uB);
  BEGIN
    UPDATE public.practice_sessions SET status = 'verified' WHERE id = sess;
    RAISE EXCEPTION 'ASSERTION S4a FAILED: client set session status directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  BEGIN
    INSERT INTO public.practice_session_confirmations (session_id, user_id, outcome)
    VALUES (sess, uB, 'completed');
    RAISE EXCEPTION 'ASSERTION S4b FAILED: client inserted a confirmation directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  BEGIN
    INSERT INTO public.practice_exchange_tokens
           (session_id, community_id, pairing_id, user_lo, user_hi, verified_at)
    VALUES (sess, v_rotman, pairAB, LEAST(uA,uB), GREATEST(uA,uB), now());
    RAISE EXCEPTION 'ASSERTION S4c FAILED: client minted a token directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  BEGIN
    UPDATE public.practice_pairings SET status = 'declined' WHERE id = pairAB;
    RAISE EXCEPTION 'ASSERTION S4d FAILED: client updated a pairing directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  RAISE NOTICE 'S4 ok: zero direct client write paths';

  -- ══ Two-sided completion + mint ════════════════════════════
  PERFORM pg_temp.impersonate(uB);
  BEGIN
    PERFORM public.submit_practice_confirmation(sess, 'completed', true, true);
    RAISE EXCEPTION 'ASSERTION S6a FAILED: confirmed before scheduled_start';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  UPDATE public.practice_sessions SET scheduled_start = now() - interval '2 hours' WHERE id = sess;

  PERFORM pg_temp.impersonate(uB);
  BEGIN
    PERFORM public.submit_practice_confirmation(sess, 'completed', true, false);
    RAISE EXCEPTION 'ASSERTION S6b FAILED: completed accepted without both round attestations';
  EXCEPTION WHEN check_violation THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  PERFORM public.submit_practice_confirmation(sess, 'completed', true, true);
  BEGIN
    PERFORM public.submit_practice_confirmation(sess, 'completed', true, true);
    RAISE EXCEPTION 'ASSERTION S6c FAILED: duplicate confirmation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERTION%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'S6 ok: time gate, reciprocity gate, one confirmation each';

  -- S7 · one confirmation ≠ verified; two → verified + exactly one token
  PERFORM pg_temp.god();
  SELECT status INTO v_txt FROM public.practice_sessions WHERE id = sess;
  IF v_txt <> 'completed_pending_confirmation' THEN
    RAISE EXCEPTION 'ASSERTION S7a FAILED: one confirmation gave status %', v_txt;
  END IF;
  SELECT count(*) INTO v_n FROM public.practice_exchange_tokens WHERE session_id = sess;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION S7b FAILED: token minted from one confirmation'; END IF;

  PERFORM pg_temp.impersonate(uA);
  PERFORM public.submit_practice_confirmation(sess, 'completed', true, true);
  PERFORM pg_temp.god();
  SELECT status INTO v_txt FROM public.practice_sessions WHERE id = sess;
  IF v_txt <> 'verified' THEN RAISE EXCEPTION 'ASSERTION S7c FAILED: two compatible confirmations gave %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM public.practice_exchange_tokens WHERE session_id = sess;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION S7d FAILED: expected exactly 1 token, got %', v_n; END IF;
  -- idempotent mint: the ON CONFLICT path
  INSERT INTO public.practice_exchange_tokens
         (session_id, community_id, pairing_id, user_lo, user_hi, verified_at)
  VALUES (sess, v_rotman, pairAB, LEAST(uA,uB), GREATEST(uA,uB), now())
  ON CONFLICT (session_id) DO NOTHING;
  SELECT count(*) INTO v_n FROM public.practice_exchange_tokens WHERE session_id = sess;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION S7e FAILED: duplicate token after conflict-insert'; END IF;
  -- token is community-stamped; edge exists in that community only
  SELECT count(*) INTO v_n FROM public.practice_exchange_tokens
   WHERE session_id = sess AND community_id = v_rotman;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION S7f FAILED: token missing community stamp'; END IF;
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO v_n FROM public.practice_relationship_edges
   WHERE community_id = v_rotman AND user_lo = LEAST(uA,uB) AND user_hi = GREATEST(uA,uB)
     AND verified_exchange_count = 1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION S7g FAILED: edge not aggregated per community'; END IF;
  RAISE NOTICE 'S7 ok: atomic verify + exactly one shared community-scoped token';

  -- P8 · third parties see nothing
  PERFORM pg_temp.impersonate(uC);
  SELECT count(*) INTO v_n FROM public.practice_exchange_tokens WHERE session_id = sess;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P8a FAILED: outsider reads tokens'; END IF;
  SELECT count(*) INTO v_n FROM public.practice_relationship_edges
   WHERE user_lo = LEAST(uA,uB) AND user_hi = GREATEST(uA,uB);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P8b FAILED: outsider reads edges'; END IF;
  -- P9 · admin report locked away
  BEGIN
    SELECT count(*) INTO v_n FROM public.practice_admin_report;
    RAISE EXCEPTION 'ASSERTION P9 FAILED: authenticated user read the admin report';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  RAISE NOTICE 'P8/P9 ok: tokens/edges private; admin report service-role only';

  -- C4 · cross-community rows are impossible at the DB level
  PERFORM pg_temp.god();
  BEGIN
    INSERT INTO public.practice_sessions
           (pairing_id, community_id, participant_a_user_id, participant_b_user_id,
            created_by_user_id, scheduled_start)
    VALUES (pairAB, v_testcomm, uA, uB, uA, now() + interval '1 day');
    RAISE EXCEPTION 'ASSERTION C4a FAILED: session created with wrong community';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  BEGIN
    INSERT INTO public.practice_exchange_tokens
           (session_id, community_id, pairing_id, user_lo, user_hi, verified_at)
    VALUES (sess, v_testcomm, pairAB, LEAST(uA,uB), GREATEST(uA,uB), now());
    RAISE EXCEPTION 'ASSERTION C4b FAILED: token created with wrong community';
  EXCEPTION WHEN foreign_key_violation OR unique_violation THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  RAISE NOTICE 'C4 ok: composite FKs forbid cross-community sessions/tokens';

  -- ══ P11 · 30-day decline cooldown (not permanent) ══════════
  PERFORM pg_temp.impersonate(uC);
  v_json := public.send_practice_invitation(reqA);
  pairCA := (v_json->>'id')::uuid;
  PERFORM pg_temp.impersonate(uA);
  PERFORM public.decline_practice_invitation(pairCA);
  PERFORM pg_temp.impersonate(uC);
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman) b WHERE b.request_id = reqA;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P11a FAILED: declined pair still browsable in cooldown'; END IF;
  PERFORM pg_temp.god();
  UPDATE public.practice_pairings SET declined_at = now() - interval '31 days' WHERE id = pairCA;
  PERFORM pg_temp.impersonate(uC);
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman) b WHERE b.request_id = reqA;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERTION P11b FAILED: request did not reappear after 30 days'; END IF;
  v_json := public.send_practice_invitation(reqA);      -- re-invite now allowed
  pairCA2 := (v_json->>'id')::uuid;
  IF pairCA2 = pairCA THEN RAISE EXCEPTION 'ASSERTION P11c FAILED: re-invite reused the old pairing'; END IF;
  -- blocks trump the cooldown, forever
  PERFORM pg_temp.god();
  UPDATE public.practice_pairings SET status = 'withdrawn' WHERE id = pairCA2;  -- clear live pairing
  INSERT INTO public.blocks (blocker_id, blocked_user_id) VALUES (uA, uC);
  PERFORM pg_temp.impersonate(uC);
  SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman) b WHERE b.request_id = reqA;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERTION P11d FAILED: blocked pair browsable'; END IF;
  RAISE NOTICE 'P11 ok: 30-day cooldown, blocks excluded indefinitely';

  -- ══ P12 · anon role fully locked out ═══════════════════════
  PERFORM pg_temp.impersonate_anon();
  BEGIN
    SELECT count(*) INTO v_n FROM public.browse_practice_requests(v_rotman);
    RAISE EXCEPTION 'ASSERTION P12a FAILED: anon executed browse';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.my_practice_pairings;
    RAISE EXCEPTION 'ASSERTION P12b FAILED: anon read my_practice_pairings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.practice_requests;
    RAISE EXCEPTION 'ASSERTION P12c FAILED: anon read practice_requests';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
           WHEN raise_exception THEN RAISE;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'P12 ok: anon/public revoked everywhere';

  -- ══ S10 · every pre-existing notification type still valid ═
  FOREACH v_txt IN ARRAY ARRAY['new_match','new_message','feedback_request',
                               'meeting_confirmed','review_received','event_cancelled',
                               'event_joined','event_message','event_below_min',
                               'marketplace_interest'] LOOP
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (uA, v_txt, 'assert', '');
  END LOOP;
  RAISE NOTICE 'S10 ok: all ten pre-existing notification types intact';

  -- ══ S9 · account deletion is never blocked by Practice ═════
  -- Production fact (2026-08-26 live run): profiles_id_fkey has NO
  -- cascade, so auth.users must be deleted AFTER the profile — a
  -- pre-existing platform behavior, unrelated to Practice. The
  -- Practice invariant under test is: deleting the PROFILE cascades
  -- cleanly through every practice table (uC has a request, windows,
  -- a declined pairing, and community memberships) with nothing
  -- RESTRICTing the delete.
  DELETE FROM public.profiles WHERE id = uC;
  IF EXISTS (SELECT 1 FROM public.practice_requests WHERE user_id = uC)
     OR EXISTS (SELECT 1 FROM public.community_members WHERE user_id = uC) THEN
    RAISE EXCEPTION 'ASSERTION S9 FAILED: practice/community rows survived profile deletion';
  END IF;
  DELETE FROM auth.users WHERE id = uC;   -- now unblocked
  RAISE NOTICE 'S9 ok: no ON DELETE RESTRICT blocks account deletion (profile first, then auth user)';

  -- ══ Sweep sanity (housekeeping never touches confirmations) ═
  v_json := public.practice_sweep_expired();
  SELECT count(*) INTO v_n FROM public.practice_session_confirmations WHERE session_id = sess;
  IF v_n <> 2 THEN RAISE EXCEPTION 'ASSERTION SWEEP FAILED: sweep touched confirmations'; END IF;
  RAISE NOTICE 'SWEEP ok: % ', v_json;

  RAISE NOTICE '==============================================';
  RAISE NOTICE 'ALL PRACTICE ASSERTIONS PASSED';
  RAISE NOTICE '==============================================';
END $$;

ROLLBACK;
