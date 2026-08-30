-- ============================================================
-- Mutu — meeting link assertions  (L1..L10)
--
-- Run AFTER scripts/migration-practice-meeting-links.sql, in the
-- Supabase SQL Editor. Self-rolling-back: nothing it creates survives.
--
-- Proves a meeting link is validated, participant-private, and
-- invisible to everyone else.
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
  cid uuid := 'ffffffff-0000-0000-0000-00000000c001';
  uA uuid := 'ffffffff-0000-0000-0000-0000000000a1';
  uB uuid := 'ffffffff-0000-0000-0000-0000000000b2';
  uX uuid := 'ffffffff-0000-0000-0000-0000000000c3';   -- outsider
  p1 uuid; res jsonb; sid uuid; s public.practice_sessions%ROWTYPE;
  n int;
  teams_url text := 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=%7b%22Tid%22%3a%22t%22%7d';
  zoom_url  text := 'https://utoronto.zoom.us/j/98765432101?pwd=aBcDeF';
BEGIN
  PERFORM pg_temp.god();
  DELETE FROM public.communities WHERE id = cid;
  DELETE FROM public.profiles WHERE id IN (uA,uB,uX);
  DELETE FROM auth.users      WHERE id IN (uA,uB,uX);

  INSERT INTO auth.users (id, email) VALUES
    (uA,'ml-a@test.local'),(uB,'ml-b@test.local'),(uX,'ml-x@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, name, access_status) VALUES
    (uA,'ml-a@test.local','Ada Link','active'),
    (uB,'ml-b@test.local','Bo Link','active'),
    (uX,'ml-x@test.local','Xu Outsider','active')
  ON CONFLICT (id) DO UPDATE SET access_status = EXCLUDED.access_status;
  INSERT INTO public.communities (id, slug, name) VALUES (cid,'ml-test','ML Test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.community_members (community_id, user_id, status, source) VALUES
    (cid,uA,'member','admin'),(cid,uB,'member','admin'),(cid,uX,'member','admin')
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status;
  INSERT INTO public.practice_pairings
         (community_id, requester_user_id, addressee_user_id,
          requester_snapshot, addressee_snapshot, status, accepted_at)
  VALUES (cid, uA, uB, '{}'::jsonb, '{}'::jsonb, 'accepted', now() - interval '3 days')
  RETURNING id INTO p1;

  -- ── L1: an online meeting needs a link ──────────────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 30, 'America/Toronto', 'virtual', '',
      'quick_skill_drill', 'case', 'synthesis', 'zoom', NULL, NULL);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'L1 FAIL: a Zoom session without a link was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%meeting_url_required%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'L1 OK: an online session cannot be proposed without a link';

  -- ── L2: only https, and no embedded credentials ─────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 30, 'America/Toronto', 'virtual', '',
      'quick_skill_drill', 'case', 'synthesis', 'zoom', 'http://zoom.us/j/1', NULL);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'L2 FAIL: a plain http link was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%not_https%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 30, 'America/Toronto', 'virtual', '',
      'quick_skill_drill', 'case', 'synthesis', 'zoom', 'https://evil.com@zoom.us/j/1', NULL);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'L2 FAIL: a link with credentials was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%has_credentials%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'L2 OK: https only, and no credentials in the authority';

  -- ── L3: the host must match the platform ────────────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '2 days', 30, 'America/Toronto', 'virtual', '',
      'quick_skill_drill', 'case', 'synthesis', 'teams', zoom_url, NULL);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'L3 FAIL: a Zoom link was stored as Teams';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%invalid_session_agreement%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'L3 OK: the link host must match the platform that was claimed';

  -- ── L4: a valid institutional link is stored ────────────────
  PERFORM pg_temp.impersonate(uA);
  res := public.propose_practice_session(
    p1, now() + interval '2 days', 30, 'America/Toronto', 'virtual', '',
    'quick_skill_drill', 'case', 'synthesis', 'zoom', zoom_url, NULL);
  PERFORM pg_temp.god();
  sid := (res->>'id')::uuid;
  IF sid IS NULL THEN RAISE EXCEPTION 'L4 FAIL: propose returned no session'; END IF;
  SELECT * INTO s FROM public.practice_sessions WHERE id = sid;
  IF s.meeting_method <> 'zoom' OR s.meeting_url <> zoom_url
     OR s.meeting_location IS NOT NULL OR s.location_type <> 'virtual' THEN
    RAISE EXCEPTION 'L4 FAIL: meeting not stored as given: %', s;
  END IF;
  RAISE NOTICE 'L4 OK: a tenant Zoom link with query parameters is stored intact';

  -- ── L5: both participants read the same link ────────────────
  PERFORM pg_temp.impersonate(uA);
  SELECT count(*) INTO n FROM public.practice_sessions WHERE id = sid AND meeting_url = zoom_url;
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'L5 FAIL: the sender cannot read the link'; END IF;
  PERFORM pg_temp.impersonate(uB);
  SELECT count(*) INTO n FROM public.practice_sessions WHERE id = sid AND meeting_url = zoom_url;
  PERFORM pg_temp.god();
  IF n <> 1 THEN RAISE EXCEPTION 'L5 FAIL: the recipient cannot read the link'; END IF;
  RAISE NOTICE 'L5 OK: both participants retrieve the identical link';

  -- ── L6: nobody else can ─────────────────────────────────────
  PERFORM pg_temp.impersonate(uX);
  SELECT count(*) INTO n FROM public.practice_sessions WHERE id = sid;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'L6 FAIL: a non-participant read the session'; END IF;
  PERFORM pg_temp.impersonate(uX);
  SELECT count(*) INTO n FROM public.practice_sessions WHERE meeting_url IS NOT NULL;
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'L6 FAIL: an outsider saw % meeting links', n; END IF;
  RAISE NOTICE 'L6 OK: the meeting link is invisible to everyone but the two participants';

  -- ── L7: the community browse surface carries no link ────────
  PERFORM pg_temp.impersonate(uX);
  SELECT count(*) INTO n
    FROM public.browse_practice_requests(cid) b
   WHERE to_jsonb(b)::text LIKE '%zoom.us%';
  PERFORM pg_temp.god();
  IF n <> 0 THEN RAISE EXCEPTION 'L7 FAIL: a meeting link leaked into the browse surface'; END IF;
  RAISE NOTICE 'L7 OK: browse returns no meeting details at all';

  -- ── L8: the notification body never carries the link ────────
  -- Scoped to the fixture's own recipients. An unscoped sweep of
  -- notifications would fail for an innocent reason the moment any
  -- unrelated feature (an event, a coffee chat) ever put a Zoom
  -- address in a notification body.
  PERFORM pg_temp.god();
  SELECT count(*) INTO n FROM public.notifications
   WHERE user_id IN (uA, uB, uX)
     AND (payload::text LIKE '%zoom.us%' OR body LIKE '%zoom.us%' OR title LIKE '%zoom.us%');
  IF n <> 0 THEN RAISE EXCEPTION 'L8 FAIL: a notification contained the link'; END IF;
  RAISE NOTICE 'L8 OK: notifications reference the session, never the link';

  -- ── L9: in person carries a location and no url ─────────────
  PERFORM pg_temp.god();
  DELETE FROM public.practice_sessions
   WHERE pairing_id = p1 AND status IN ('proposed','scheduled','completed_pending_confirmation','disputed');
  PERFORM pg_temp.impersonate(uA);
  res := public.propose_practice_session(
    p1, now() + interval '3 days', 75, 'America/Toronto', 'virtual', '',
    'full_mock_swap', 'case', NULL, 'in_person', NULL, 'Rotman building, room 2020');
  PERFORM pg_temp.god();
  sid := coalesce(res->>'id', res->>'session_id')::uuid;
  SELECT * INTO s FROM public.practice_sessions WHERE id = sid;
  IF s.meeting_method <> 'in_person' OR s.meeting_url IS NOT NULL
     OR s.meeting_location <> 'Rotman building, room 2020' OR s.location_type <> 'in_person' THEN
    RAISE EXCEPTION 'L9 FAIL: in person stored wrongly: %', s;
  END IF;
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    PERFORM public.propose_practice_session(
      p1, now() + interval '4 days', 75, 'America/Toronto', 'virtual', '',
      'full_mock_swap', 'case', NULL, 'in_person', zoom_url, NULL);
    PERFORM pg_temp.god();
    RAISE EXCEPTION 'L9 FAIL: an in-person session accepted a meeting link';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%meeting_url_not_allowed%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'L9 OK: in person keeps a location and never a link';

  -- ── L10: history is left alone ──────────────────────────────
  PERFORM pg_temp.god();
  INSERT INTO public.practice_sessions
         (pairing_id, community_id, participant_a_user_id, participant_b_user_id,
          created_by_user_id, scheduled_start, status, location_type, location_detail)
  VALUES (p1, cid, uA, uB, uA, now() - interval '40 days', 'verified', 'virtual', '')
  RETURNING id INTO sid;
  SELECT * INTO s FROM public.practice_sessions WHERE id = sid;
  IF s.meeting_method IS NOT NULL OR s.meeting_url IS NOT NULL OR s.meeting_location IS NOT NULL THEN
    RAISE EXCEPTION 'L10 FAIL: a historical row was given invented meeting details';
  END IF;
  RAISE NOTICE 'L10 OK: older sessions stay Meeting details not recorded';

  RAISE NOTICE '── meeting links: ALL ASSERTIONS PASSED ──';
END $$;

ROLLBACK;
