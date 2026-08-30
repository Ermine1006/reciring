-- ============================================================
-- Mutu — Practice session modes assertions  (M1..M12)
--
-- Run AFTER scripts/migration-practice-session-modes.sql, in the
-- Supabase SQL Editor. Self-rolling-back: nothing it creates survives.
--
-- Proves the agreement is validated in the DATABASE, and that adding
-- modes changed nothing about verification or Tokens.
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
  cid uuid := 'dddddddd-0000-0000-0000-00000000c001';
  uA uuid := 'dddddddd-0000-0000-0000-0000000000a1';
  uB uuid := 'dddddddd-0000-0000-0000-0000000000b2';
  uX uuid := 'dddddddd-0000-0000-0000-0000000000c3';   -- outsider
  p1 uuid; res jsonb; sid uuid; s public.practice_sessions%ROWTYPE;
  n int; v_status text; v_dur int;
BEGIN
  PERFORM pg_temp.god();
  DELETE FROM public.communities WHERE id = cid;
  DELETE FROM public.profiles WHERE id IN (uA,uB,uX);
  DELETE FROM auth.users      WHERE id IN (uA,uB,uX);

  INSERT INTO auth.users (id, email) VALUES
    (uA,'sm-a@test.local'),(uB,'sm-b@test.local'),(uX,'sm-x@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, name, access_status) VALUES
    (uA,'sm-a@test.local','Ada Mode','active'),
    (uB,'sm-b@test.local','Bo Mode','active'),
    (uX,'sm-x@test.local','Xu Outsider','active')
  ON CONFLICT (id) DO UPDATE SET access_status = EXCLUDED.access_status;
  INSERT INTO public.communities (id, slug, name) VALUES (cid,'sm-test','SM Test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.community_members (community_id, user_id, status, source) VALUES
    (cid,uA,'member','admin'),(cid,uB,'member','admin'),(cid,uX,'member','admin')
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status;
  INSERT INTO public.practice_pairings
         (community_id, requester_user_id, addressee_user_id,
          requester_snapshot, addressee_snapshot, status, accepted_at)
  VALUES (cid, uA, uB, '{}'::jsonb, '{}'::jsonb, 'accepted', now() - interval '3 days')
  RETURNING id INTO p1;

  -- ── M1: a drill without a skill focus is refused ────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 30, 'America/Toronto', 'virtual', '',
      'quick_skill_drill', 'case', NULL);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'M1 FAIL: a drill without a focus was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%skill_focus_required%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'M1 OK: Quick Skill Drill requires a skill focus';

  -- ── M2: a category is required, and validated ───────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 75, 'America/Toronto', 'virtual', '',
      'full_mock_swap', NULL, NULL);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'M2 FAIL: a mode without a category was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%category_required%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 75, 'America/Toronto', 'virtual', '',
      'full_mock_swap', 'technical', NULL);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'M2 FAIL: an unsupported category was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%invalid_interview_category%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'M2 OK: interview category required and restricted to case/behavioural';

  -- ── M3: the two rubrics never mix ───────────────────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 30, 'America/Toronto', 'virtual', '',
      'quick_skill_drill', 'case', 'executive_presence');   -- behavioural skill
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'M3 FAIL: a behavioural skill was stored on a case session';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%invalid_session_agreement%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 30, 'America/Toronto', 'virtual', '',
      'quick_skill_drill', 'behavioural', 'structuring');   -- case skill
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'M3 FAIL: a case skill was stored on a behavioural session';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%invalid_session_agreement%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'M3 OK: a skill must belong to its own interview category';

  -- ── M4: a valid drill is stored with the mode's duration ────
  PERFORM pg_temp.impersonate(uA);
  res := public.propose_practice_session(
    p1, now() + interval '2 days', 999, 'America/Toronto', 'virtual', '',
    'quick_skill_drill', 'case', 'final_recommendation');
  PERFORM pg_temp.god();
  sid := coalesce(res->>'id', res->>'session_id')::uuid;
  IF sid IS NULL THEN RAISE EXCEPTION 'FAIL: propose returned no session id: %', res; END IF;
  SELECT * INTO s FROM public.practice_sessions WHERE id = sid;
  IF NOT FOUND THEN RAISE EXCEPTION 'M4 FAIL: the proposed session row is missing'; END IF;
  IF s.session_mode <> 'quick_skill_drill' OR s.interview_category <> 'case'
     OR s.skill_focus <> 'final_recommendation' THEN
    RAISE EXCEPTION 'M4 FAIL: agreement not stored: %', s;
  END IF;
  IF s.duration_minutes <> 30 THEN
    RAISE EXCEPTION 'M4 FAIL: a caller must not dictate a misleading duration (got %)', s.duration_minutes;
  END IF;
  RAISE NOTICE 'M4 OK: the agreement is stored and the duration comes from the mode';

  -- ── M5: both participants read identical details; outsiders none ──
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.practice_sessions
   WHERE id = sid AND session_mode = 'quick_skill_drill' AND skill_focus = 'final_recommendation';
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'M5 FAIL: the proposer cannot read the agreement'; END IF;
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.practice_sessions
   WHERE id = sid AND session_mode = 'quick_skill_drill' AND skill_focus = 'final_recommendation';
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'M5 FAIL: the receiver sees different details'; END IF;
  PERFORM pg_temp.impersonate(uX);
  SELECT count(*) INTO n FROM public.practice_sessions WHERE id = sid;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'M5 FAIL: a non-participant read the session'; END IF;
  RAISE NOTICE 'M5 OK: identical details for both participants, invisible to everyone else';

  -- ── M6: an invitation can never BECOME incomplete ───────────
  -- The stronger guarantee: the constraints make the broken state
  -- unreachable, so no participant can ever be shown an invitation
  -- whose details went missing. (confirm_practice_session also
  -- refuses one, as defence in depth for any row predating these
  -- constraints.)
  PERFORM pg_temp.god();
  BEGIN
    UPDATE public.practice_sessions SET skill_focus = NULL WHERE id = sid;
    RAISE EXCEPTION 'M6 FAIL: a drill was allowed to lose its skill focus';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.practice_sessions SET interview_category = NULL WHERE id = sid;
    RAISE EXCEPTION 'M6 FAIL: a session was allowed to lose its interview category';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.practice_sessions SET skill_focus = 'concision' WHERE id = sid;
    RAISE EXCEPTION 'M6 FAIL: a case session accepted a behavioural skill';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'M6 OK: the database makes an incomplete or mismatched agreement unreachable';

  -- ── M7: a complete agreement is accepted normally ───────────
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.confirm_practice_session(sid);
  PERFORM pg_temp.god();
  SELECT status INTO v_status FROM public.practice_sessions WHERE id = sid;
  IF v_status <> 'scheduled' THEN RAISE EXCEPTION 'M7 FAIL: status %', v_status; END IF;
  RAISE NOTICE 'M7 OK: scheduling is unchanged for a valid agreement';

  -- ── M8: first confirmation does not verify ──────────────────
  PERFORM pg_temp.god();
  UPDATE public.practice_sessions SET scheduled_start = now() - interval '1 hour' WHERE id = sid;
  PERFORM pg_temp.impersonate(uA);
  PERFORM public.submit_practice_confirmation(sid, 'completed', true, true);
  PERFORM pg_temp.god();
  SELECT status INTO v_status FROM public.practice_sessions WHERE id = sid;
  IF v_status <> 'completed_pending_confirmation' THEN
    RAISE EXCEPTION 'M8 FAIL: one confirmation changed status to %', v_status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.practice_exchange_tokens WHERE session_id = sid) THEN
    RAISE EXCEPTION 'M8 FAIL: a token was minted on the first confirmation';
  END IF;
  RAISE NOTICE 'M8 OK: the first confirmation still does not verify or mint';

  -- ── M9: the second compatible confirmation verifies, once ───
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.submit_practice_confirmation(sid, 'completed', true, true);
  PERFORM pg_temp.god();
  SELECT status INTO v_status FROM public.practice_sessions WHERE id = sid;
  SELECT count(*) INTO n FROM public.practice_exchange_tokens WHERE session_id = sid;
  IF v_status <> 'verified' THEN RAISE EXCEPTION 'M9 FAIL: status %', v_status; END IF;
  IF n <> 1 THEN
    RAISE EXCEPTION 'M9 FAIL: a reciprocal session minted % tokens', n;
  END IF;
  RAISE NOTICE 'M9 OK: two reciprocal rounds still produce exactly one shared Token';

  -- ── M10: conflicting confirmations still dispute ────────────
  PERFORM pg_temp.impersonate(uA);
  res := public.propose_practice_session(
    p1, now() + interval '3 days', 75, 'America/Toronto', 'virtual', '',
    'full_mock_swap', 'behavioural', NULL);           -- no focus: allowed
  PERFORM pg_temp.god();
  sid := coalesce(res->>'id', res->>'session_id')::uuid;
  IF sid IS NULL THEN RAISE EXCEPTION 'FAIL: propose returned no session id: %', res; END IF;
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.confirm_practice_session(sid);
  PERFORM pg_temp.god();
  UPDATE public.practice_sessions SET scheduled_start = now() - interval '1 hour' WHERE id = sid;
  PERFORM pg_temp.impersonate(uA);
  PERFORM public.submit_practice_confirmation(sid, 'completed', true, true);
  PERFORM pg_temp.god();
  PERFORM pg_temp.impersonate(uB);
  PERFORM public.submit_practice_confirmation(sid, 'no_show', false, false, uA);
  PERFORM pg_temp.god();
  SELECT status INTO v_status FROM public.practice_sessions WHERE id = sid;
  IF v_status <> 'disputed' THEN RAISE EXCEPTION 'M10 FAIL: status %', v_status; END IF;
  IF EXISTS (SELECT 1 FROM public.practice_exchange_tokens WHERE session_id = sid) THEN
    RAISE EXCEPTION 'M10 FAIL: a disputed session minted a token';
  END IF;
  SELECT duration_minutes INTO v_dur FROM public.practice_sessions WHERE id = sid;
  IF v_dur <> 75 THEN RAISE EXCEPTION 'M10 FAIL: full mock duration % ', v_dur; END IF;
  RAISE NOTICE 'M10 OK: a Full Mock Swap needs no focus; conflicts still dispute and never mint';

  -- ── M11: the old call shape still works, and records nothing ──
  PERFORM pg_temp.god();
  -- clear every live session so the one-live-session rule lets us
  -- propose again (uq_session_live also covers disputed)
  DELETE FROM public.practice_sessions
   WHERE pairing_id = p1
     AND status IN ('proposed','scheduled','completed_pending_confirmation','disputed');
  PERFORM pg_temp.impersonate(uA);
  res := public.propose_practice_session(p1, now() + interval '4 days');
  PERFORM pg_temp.god();
  sid := coalesce(res->>'id', res->>'session_id')::uuid;
  IF sid IS NULL THEN RAISE EXCEPTION 'FAIL: propose returned no session id: %', res; END IF;
  SELECT * INTO s FROM public.practice_sessions WHERE id = sid;
  IF NOT FOUND THEN RAISE EXCEPTION 'M11 FAIL: the proposed session row is missing'; END IF;
  IF s.session_mode IS NOT NULL OR s.interview_category IS NOT NULL OR s.skill_focus IS NOT NULL THEN
    RAISE EXCEPTION 'M11 FAIL: an un-migrated call invented an agreement';
  END IF;
  RAISE NOTICE 'M11 OK: a proposal without a mode stays Not recorded, never guessed';

  -- ── M12: an older session keeps its empty agreement ─────────
  -- SCOPED TO THIS FIXTURE'S COMMUNITY ON PURPOSE. An earlier
  -- version of this check counted the WHOLE practice_sessions
  -- table, which is wrong twice over: it passed vacuously in a
  -- sandbox that had no history, and it fails in production for an
  -- innocent reason — real members have been choosing modes since
  -- the migration went live, so their rows legitimately carry one.
  --
  -- What can honestly be proven after the fact is narrower: a row
  -- that predates the agreement and was never given one still has
  -- none. Whether a backfill ever ran is NOT decidable from the
  -- data now; it is decided by reading the migration, which
  -- contains exactly one UPDATE on practice_sessions (status and
  -- confirmed_at, inside confirm_practice_session) and never
  -- writes session_mode, interview_category or skill_focus.
  PERFORM pg_temp.god();
  UPDATE public.practice_sessions
     SET created_at = now() - interval '90 days'
   WHERE id = sid;
  SELECT count(*) INTO n FROM public.practice_sessions
   WHERE community_id = cid
     AND created_at < now() - interval '1 minute'
     AND (session_mode IS NOT NULL
          OR interview_category IS NOT NULL
          OR skill_focus IS NOT NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'M12 FAIL: an older session acquired an agreement it was never given';
  END IF;
  RAISE NOTICE 'M12 OK: an older session keeps no invented mode, category or skill';

  RAISE NOTICE '── practice session modes: ALL ASSERTIONS PASSED ──';
END $$;

ROLLBACK;
