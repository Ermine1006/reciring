-- ============================================================
-- Mutu — Community Map privacy assertions  (v11)
--
-- Run AFTER scripts/migration-community-network-graph.sql (v9), in
-- the Supabase SQL Editor. The whole suite runs inside one
-- transaction and ROLLS ITSELF BACK — nothing it creates survives.
-- Every group RAISEs on failure; success prints NOTICEs G1..G17.
--
-- v11 verifies "public status, unlocked identity, private
-- relationships":
--   community_map_summary  — NO pair edges, NO pair token counts,
--     NO dates; aggregates + earned status; a member's name and
--     avatar ONLY for viewers who unlocked them bilaterally, and
--     cluster paths suppressed when a circle is too small
--   my_relationship_graph  — caller-participant UNLOCKED edges ONLY
--   community_network_graph — GONE (the over-sharing RPC)
-- ============================================================

BEGIN;

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
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

DO $$
DECLARE
  cid  uuid := 'aaaaaaaa-0000-0000-0000-00000000c001';
  cid2 uuid := 'aaaaaaaa-0000-0000-0000-00000000c002';
  uA uuid := 'aaaaaaaa-0000-0000-0000-0000000000a1';     -- Consulting
  uB uuid := 'aaaaaaaa-0000-0000-0000-0000000000b2';     -- no industry → other
  uC uuid := 'aaaaaaaa-0000-0000-0000-0000000000c3';     -- Consulting
  uD uuid := 'aaaaaaaa-0000-0000-0000-0000000000d4';     -- 3 profile industries, 0 verified
  uE uuid := 'aaaaaaaa-0000-0000-0000-0000000000e5';     -- NON-member
  uF uuid := 'aaaaaaaa-0000-0000-0000-0000000000f6';     -- removed member
  uH uuid := 'aaaaaaaa-0000-0000-0000-0000000000a7';     -- Consulting hub (Connector)
  uI uuid := 'aaaaaaaa-0000-0000-0000-0000000000a8';     -- Private Equity → finance
  uJ uuid := 'aaaaaaaa-0000-0000-0000-0000000000a9';     -- Tech → technology
  uK uuid := 'aaaaaaaa-0000-0000-0000-0000000000aa';     -- Marketing
  uL uuid := 'aaaaaaaa-0000-0000-0000-0000000000ab';     -- Finance filler
  uM uuid := 'aaaaaaaa-0000-0000-0000-0000000000ac';     -- Finance filler
  ev1 uuid; ev2 uuid; m1 uuid; m2 uuid; m3 uuid;
  p1 uuid; p2 uuid; ph uuid; s1 uuid; s2 uuid; s3 uuid; sh uuid;
  po1 uuid; po2 uuid;
  g jsonb; e jsonb; n jsonb; l jsonb; c jsonb;
  akey text; ckey text; dkey text;
BEGIN
  PERFORM pg_temp.god();

  -- Defensive pre-clean of the throwaway ids (idempotent re-runs,
  -- auth triggers, interrupted attempts).
  DELETE FROM public.matches
   WHERE requester_user_id IN (uA,uB,uC,uD,uE,uF,uH,uI,uJ,uK,uL,uM)
      OR helper_user_id    IN (uA,uB,uC,uD,uE,uF,uH,uI,uJ,uK,uL,uM);
  DELETE FROM public.communities WHERE id IN (cid, cid2);
  DELETE FROM public.event_encounters
   WHERE user_id IN (uA,uB,uC,uD,uE,uF,uH,uI,uJ,uK,uL,uM)
      OR encountered_user_id IN (uA,uB,uC,uD,uE,uF,uH,uI,uJ,uK,uL,uM);
  DELETE FROM public.profiles   WHERE id IN (uA,uB,uC,uD,uE,uF,uH,uI,uJ,uK,uL,uM);
  DELETE FROM auth.users        WHERE id IN (uA,uB,uC,uD,uE,uF,uH,uI,uJ,uK,uL,uM);

  INSERT INTO auth.users (id, email) VALUES
    (uA,'cg-a@test.local'),(uB,'cg-b@test.local'),(uC,'cg-c@test.local'),
    (uD,'cg-d@test.local'),(uE,'cg-e@test.local'),(uF,'cg-f@test.local'),
    (uH,'cg-h@test.local'),(uI,'cg-i@test.local'),(uJ,'cg-j@test.local'),
    (uK,'cg-k@test.local'),(uL,'cg-l@test.local'),(uM,'cg-m@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, name, access_status, industry_interests) VALUES
    (uA,'cg-a@test.local','Alice Anders','active','{Consulting}'),
    (uB,'cg-b@test.local','Bob Brant','active',NULL),
    (uC,'cg-c@test.local','Cara Chen','active','{Consulting}'),
    -- D picked THREE industries but has zero verified exchanges:
    -- profile choices alone must never make a Community Connector
    (uD,'cg-d@test.local','Dan Dorn','active','{Marketing,Finance,Technology}'),
    (uE,'cg-e@test.local','Eve Ext','active','{Finance}'),
    (uF,'cg-f@test.local','Fay Former','active','{Finance}'),
    (uH,'cg-h@test.local','Hana Hub','active','{Consulting}'),
    (uI,'cg-i@test.local','Ivan Invest','active','{"Private Equity"}'),
    (uJ,'cg-j@test.local','Jia Jin','active','{Tech}'),
    (uK,'cg-k@test.local','Kai Kim','active','{Marketing}'),
    (uL,'cg-l@test.local','Lena Ling','active','{Finance}'),
    (uM,'cg-m@test.local','Mo Mbeki','active','{"Investment Banking"}')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, name = EXCLUDED.name,
        access_status = EXCLUDED.access_status,
        industry_interests = EXCLUDED.industry_interests;

  INSERT INTO public.communities (id, slug, name) VALUES
    (cid,'cg-test','CG Test'), (cid2,'cg-other','CG Other')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.community_members (community_id, user_id, status, source) VALUES
    (cid,uA,'member','admin'),(cid,uB,'member','admin'),
    (cid,uC,'member','admin'),(cid,uD,'member','admin'),
    (cid,uH,'member','admin'),(cid,uI,'member','admin'),
    (cid,uJ,'member','admin'),(cid,uK,'member','admin'),
    (cid,uL,'member','admin'),(cid,uM,'member','admin'),
    (cid,uF,'removed','admin'),
    (cid2,uA,'member','admin'),(cid2,uB,'member','admin')
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status;

  -- ── together fixtures ───────────────────────────────────────
  -- A↔B accepted partnership + TWO verified sessions (2 tokens);
  -- A↔B in cid2: accepted + 1 token (isolation test)
  INSERT INTO public.practice_pairings
         (community_id, requester_user_id, addressee_user_id,
          requester_snapshot, addressee_snapshot, status, accepted_at)
  VALUES (cid, uA, uB, '{}'::jsonb, '{}'::jsonb, 'accepted', now() - interval '8 days')
  RETURNING id INTO p1;
  INSERT INTO public.practice_pairings
         (community_id, requester_user_id, addressee_user_id,
          requester_snapshot, addressee_snapshot, status, accepted_at)
  VALUES (cid2, uA, uB, '{}'::jsonb, '{}'::jsonb, 'accepted', now() - interval '8 days')
  RETURNING id INTO p2;
  INSERT INTO public.practice_sessions
         (pairing_id, community_id, participant_a_user_id, participant_b_user_id,
          created_by_user_id, scheduled_start, status, verified_at)
  VALUES (p1, cid, uA, uB, uA, now() - interval '2 days', 'verified', now() - interval '1 day')
  RETURNING id INTO s1;
  INSERT INTO public.practice_sessions
         (pairing_id, community_id, participant_a_user_id, participant_b_user_id,
          created_by_user_id, scheduled_start, status, verified_at)
  VALUES (p1, cid, uA, uB, uA, now() - interval '1 day', 'verified', now())
  RETURNING id INTO s2;
  INSERT INTO public.practice_sessions
         (pairing_id, community_id, participant_a_user_id, participant_b_user_id,
          created_by_user_id, scheduled_start, status, verified_at)
  VALUES (p2, cid2, uA, uB, uA, now() - interval '1 day', 'verified', now())
  RETURNING id INTO s3;
  INSERT INTO public.practice_exchange_tokens
         (session_id, community_id, pairing_id, user_lo, user_hi, exchange_types, verified_at)
  VALUES (s1, cid,  p1, LEAST(uA,uB), GREATEST(uA,uB), '{case}',        now() - interval '1 day'),
         (s2, cid,  p1, LEAST(uA,uB), GREATEST(uA,uB), '{behavioural}', now()),
         (s3, cid2, p2, LEAST(uA,uB), GREATEST(uA,uB), '{case}',        now());

  -- H is a real Connector: verified partnerships with I (finance),
  -- J (technology) and K (marketing) — 3 distinct verified partners
  -- spanning 3 circles beyond her own
  FOR n IN SELECT to_jsonb(x) FROM unnest(ARRAY[uI, uJ, uK]) x LOOP
    INSERT INTO public.practice_pairings
           (community_id, requester_user_id, addressee_user_id,
            requester_snapshot, addressee_snapshot, status, accepted_at)
    VALUES (cid, uH, (n#>>'{}')::uuid, '{}'::jsonb, '{}'::jsonb, 'accepted', now() - interval '6 days')
    RETURNING id INTO ph;
    INSERT INTO public.practice_sessions
           (pairing_id, community_id, participant_a_user_id, participant_b_user_id,
            created_by_user_id, scheduled_start, status, verified_at)
    VALUES (ph, cid, uH, (n#>>'{}')::uuid, uH, now() - interval '2 days', 'verified', now() - interval '1 day')
    RETURNING id INTO sh;
    INSERT INTO public.practice_exchange_tokens
           (session_id, community_id, pairing_id, user_lo, user_hi, exchange_types, verified_at)
    VALUES (sh, cid, ph, LEAST(uH,(n#>>'{}')::uuid), GREATEST(uH,(n#>>'{}')::uuid), '{case}', now() - interval '1 day');
  END LOOP;

  -- C↔D partnership ENDED after acceptance: line stays, zero verified
  INSERT INTO public.practice_pairings
         (community_id, requester_user_id, addressee_user_id,
          requester_snapshot, addressee_snapshot, status, accepted_at, ended_at, ended_by)
  VALUES (cid, uC, uD, '{}'::jsonb, '{}'::jsonb, 'ended', now() - interval '3 days', now() - interval '1 day', uC);
  -- A↔C pairing only INVITED: never a connection from this row
  INSERT INTO public.practice_pairings
         (community_id, requester_user_id, addressee_user_id,
          requester_snapshot, addressee_snapshot, status)
  VALUES (cid, uA, uC, '{}'::jsonb, '{}'::jsonb, 'invited');

  -- ── event fixtures ──────────────────────────────────────────
  INSERT INTO public.events (title, start_at, category, max_attendees, host_user_id, host_display_name)
  VALUES ('CG assertion event 1', now() - interval '12 days', 'Other', 10, uA, 'Alice Anders')
  RETURNING id INTO ev1;
  INSERT INTO public.events (title, start_at, category, max_attendees, host_user_id, host_display_name)
  VALUES ('CG assertion event 2', now() - interval '4 days', 'Other', 10, uA, 'Alice Anders')
  RETURNING id INTO ev2;
  -- A↔B mutually confirmed BOTH directions at ev1 (10 days ago —
  -- BEFORE the partnership, so A-B is Event-origin);
  -- B→C one-sided self_recorded at ev2 (must contribute NOTHING)
  INSERT INTO public.event_encounters (event_id, user_id, encountered_user_id, status, created_at, confirmed_at) VALUES
    (ev1, LEAST(uA,uB), GREATEST(uA,uB), 'mutually_confirmed', now() - interval '10 days', now() - interval '10 days'),
    (ev1, GREATEST(uA,uB), LEAST(uA,uB), 'mutually_confirmed', now() - interval '10 days', now() - interval '10 days'),
    (ev2, uB, uC, 'self_recorded', now() - interval '3 days', NULL);

  -- ── discover fixtures ───────────────────────────────────────
  -- m1 B↔C: reveal accepted AND both confirmed "We met"
  -- (1 verified discover exchange, ZERO tokens)
  INSERT INTO public.matches (id, requester_user_id, helper_user_id, status, source, event_id,
                              identity_reveal_status, identity_reveal_accepted_at)
  VALUES (gen_random_uuid(), uB, uC, 'active', 'community', ev1, 'accepted', now() - interval '5 days')
  RETURNING id INTO m1;
  INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m1, uB), (m1, uC);
  -- m2 C↔D: unrevealed match + ONE-sided confirmation → nothing
  INSERT INTO public.matches (id, requester_user_id, helper_user_id, status, source, event_id, identity_reveal_status)
  VALUES (gen_random_uuid(), uC, uD, 'active', 'community', ev1, 'none')
  RETURNING id INTO m2;
  INSERT INTO public.exchange_confirmations (match_id, user_id) VALUES (m2, uC);
  -- m3 A↔E revealed but E is not a member → no edge anywhere
  INSERT INTO public.matches (id, requester_user_id, helper_user_id, status, source, event_id, identity_reveal_status)
  VALUES (gen_random_uuid(), uA, uE, 'active', 'community', ev1, 'accepted')
  RETURNING id INTO m3;
  -- practice-source A↔D: never a discover edge
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, event_id, identity_reveal_status)
  VALUES (uA, uD, 'active', 'practice', ev1, 'accepted');
  -- UNILATERAL: B↔D match on a REAL-NAME post, reveal 'none' —
  -- a right-swipe alone. Must NEVER become a connection.
  INSERT INTO public.posts (created_by, need_text, offer_text, is_anonymous)
  VALUES (uB, 'CG real-name post', 'CG offer', false) RETURNING id INTO po1;
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, post_id, identity_reveal_status)
  VALUES (uB, uD, 'active', 'post', po1, 'none');
  -- UNILATERAL: anonymous-post A↔D match, reveal 'none' → nothing
  INSERT INTO public.posts (created_by, need_text, offer_text, is_anonymous)
  VALUES (uA, 'CG anonymous post', 'CG offer', true) RETURNING id INTO po2;
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, post_id, identity_reveal_status)
  VALUES (uA, uD, 'active', 'post', po2, 'none');
  -- MUTUAL: smart-match A↔C (created only when BOTH expressed interest)
  INSERT INTO public.matches (requester_user_id, helper_user_id, status, source, identity_reveal_status)
  VALUES (uA, uC, 'active', 'smart_match', 'none');

  akey := md5(cid::text || ':' || uA::text);
  ckey := md5(cid::text || ':' || uC::text);
  dkey := md5(cid::text || ':' || uD::text);

  -- Fixture expectations (community cid, 8 members):
  --   connections: A-B(v3 t2), B-C(v1), C-D(v0), A-C(v0),
  --                H-I(v1 t1), H-J(v1 t1), H-K(v1 t1)  = 7 / v7 / t5

  -- ── G1: access control on BOTH new RPCs ─────────────────────
  PERFORM pg_temp.impersonate_anon();
  BEGIN
    PERFORM public.community_map_summary(cid);
    RAISE EXCEPTION 'G1 FAIL: anon could read the map summary';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%not_authenticated%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.my_relationship_graph(cid);
    RAISE EXCEPTION 'G1 FAIL: anon could read a relationship graph';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%not_authenticated%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  PERFORM pg_temp.impersonate(uE);
  BEGIN
    PERFORM public.community_map_summary(cid);
    RAISE EXCEPTION 'G1 FAIL: non-member could read the map summary';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%not_eligible%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.my_relationship_graph(cid);
    RAISE EXCEPTION 'G1 FAIL: non-member could read a relationship graph';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%not_eligible%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'G1 OK: anon and non-members blocked on both RPCs';

  -- ── G2: the over-sharing RPC is GONE ────────────────────────
  PERFORM pg_temp.impersonate(uA);
  BEGIN
    EXECUTE 'SELECT public.community_network_graph($1)' USING cid;
    RAISE EXCEPTION 'G2 FAIL: community_network_graph still exists';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  PERFORM pg_temp.god();
  RAISE NOTICE 'G2 OK: community_network_graph dropped — full edge list unreachable';

  -- ── G3: map summary payload contains NO pair-level data ─────
  PERFORM pg_temp.impersonate(uA);
  g := public.community_map_summary(cid);
  PERFORM pg_temp.god();
  IF g ? 'edges' THEN RAISE EXCEPTION 'G3 FAIL: map payload has an edges key'; END IF;
  IF g::text LIKE '%node_lo%' OR g::text LIKE '%node_hi%'
     OR g::text LIKE '%other_node_key%'
     OR g::text LIKE '%token_count%'
     OR g::text LIKE '%origin_source%'
     OR g::text LIKE '%source_breakdown%'
     OR g::text LIKE '%first_connected_at%'
     OR g::text LIKE '%last_verified_at%' THEN
    RAISE EXCEPTION 'G3 FAIL: pair-level field leaked into map payload';
  END IF;
  -- no email ever, and no name for a member the caller has not
  -- unlocked (per-viewer identity is asserted in full by G17)
  IF g::text LIKE '%@test.local%' THEN
    RAISE EXCEPTION 'G3 FAIL: an email leaked into the map payload';
  END IF;
  IF g::text LIKE '%Hana Hub%' OR g::text LIKE '%Ivan Invest%'
     OR g::text LIKE '%Kai Kim%' OR g::text LIKE '%Lena Ling%' THEN
    RAISE EXCEPTION 'G3 FAIL: a locked member name leaked into the map payload';
  END IF;
  RAISE NOTICE 'G3 OK: no pair edges, no pair tokens, no dates, no locked names';

  -- ── G4: no leaderboard, centrality or ranking fields ────────
  IF g::text LIKE '%centrality%' OR g::text LIKE '%rank%'
     OR g::text LIKE '%percentile%' OR g::text LIKE '%leaderboard%'
     OR g::text LIKE '%top_member%' OR g::text LIKE '%score%' THEN
    RAISE EXCEPTION 'G4 FAIL: ranking-style field leaked into map payload';
  END IF;
  RAISE NOTICE 'G4 OK: no leaderboards, centrality scores or rankings';

  -- ── G5: community totals are real and separated ─────────────
  IF (g->'community'->>'member_count')::int <> 10
     OR (g->'community'->>'mutual_connection_count')::int <> 7
     OR (g->'community'->>'verified_exchange_count')::int <> 7 THEN
    RAISE EXCEPTION 'G5 FAIL: community totals wrong: %', g->'community';
  END IF;
  IF jsonb_array_length(g->'members') <> 10 THEN
    RAISE EXCEPTION 'G5 FAIL: removed or non-member leaked into map';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(g->'members') x
              WHERE x->>'node_key' IN (md5(cid::text || ':' || uE::text),
                                       md5(cid::text || ':' || uF::text))) THEN
    RAISE EXCEPTION 'G5 FAIL: removed member or outsider present by node key';
  END IF;
  RAISE NOTICE 'G5 OK: totals 10 members / 7 mutual connections / 7 verified exchanges';

  -- ── G6: member rows carry public status only ────────────────
  SELECT x INTO n FROM jsonb_array_elements(g->'members') x
   WHERE x->>'node_key' = akey;
  IF n IS NULL THEN RAISE EXCEPTION 'G6 FAIL: A missing from members'; END IF;
  IF NOT (SELECT bool_and(k IN ('node_key','display_name','avatar_url',
            'broad_career_focus','is_self','is_identity_unlocked',
            'public_contribution_tier',
            'public_badges','is_community_connector','connected_circle_count'))
          FROM jsonb_object_keys(n) k) THEN
    RAISE EXCEPTION 'G6 FAIL: unexpected member field: %', (SELECT string_agg(k, ',') FROM jsonb_object_keys(n) k);
  END IF;
  IF n->>'public_contribution_tier' <> 'established'
     OR NOT (n->'public_badges' @> '"first_exchange"' AND n->'public_badges' @> '"contributor"') THEN
    RAISE EXCEPTION 'G6 FAIL: A public status wrong: %', n;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(g->'members') x
       WHERE (x->>'is_self')::boolean) <> 1 THEN
    RAISE EXCEPTION 'G6 FAIL: is_self should mark exactly the caller';
  END IF;
  RAISE NOTICE 'G6 OK: member rows expose earned status only, nothing pairwise';

  -- ── G7: badges come from verified behaviour ONLY ────────────
  -- D has: 3 profile industries, an ended partnership, a pending
  -- match, a one-sided confirmation received — and ZERO verified
  -- exchanges. Tier new, no badges, never a Connector.
  SELECT x INTO n FROM jsonb_array_elements(g->'members') x
   WHERE x->>'node_key' = dkey;
  IF n->>'public_contribution_tier' <> 'new'
     OR n->'public_badges' <> '[]'::jsonb
     OR (n->>'is_community_connector')::boolean THEN
    RAISE EXCEPTION 'G7 FAIL: D earned status without verified behaviour: %', n;
  END IF;
  RAISE NOTICE 'G7 OK: no public status from swipes, categories or pending activity';

  -- ── G8: Community Connector = real cross-circle topology ────
  SELECT x INTO n FROM jsonb_array_elements(g->'members') x
   WHERE x->>'node_key' = md5(cid::text || ':' || uH::text);
  IF NOT (n->>'is_community_connector')::boolean
     OR (n->>'connected_circle_count')::int <> 4 THEN
    RAISE EXCEPTION 'G8 FAIL: H should be a Connector spanning 4 circles: %', n;
  END IF;
  -- A has 3 verified exchanges but only ONE verified partner → no
  SELECT x INTO n FROM jsonb_array_elements(g->'members') x
   WHERE x->>'node_key' = akey;
  IF (n->>'is_community_connector')::boolean THEN
    RAISE EXCEPTION 'G8 FAIL: A must not be a Connector (one partner)';
  END IF;
  RAISE NOTICE 'G8 OK: Connector from verified cross-circle relationships, not profile picks';

  -- ── G9: cluster aggregates are real ─────────────────────────
  SELECT x INTO c FROM jsonb_array_elements(g->'clusters') x
   WHERE x->>'career_focus_key' = 'consulting';
  IF (c->>'member_count')::int <> 3
     OR (c->>'mutual_connection_count')::int <> 1
     OR (c->>'verified_exchange_count')::int <> 0 THEN
    RAISE EXCEPTION 'G9 FAIL: consulting cluster wrong: %', c;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(g->'clusters') x
              WHERE x->>'career_focus_key' IN
                ('investment_banking','private_equity','vc','venture_capital')) THEN
    RAISE EXCEPTION 'G9 FAIL: narrow finance clusters must fold into finance';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(g->'clusters') x
                  WHERE x->>'career_focus_key' = 'finance'
                    AND (x->>'member_count')::int = 3) THEN
    RAISE EXCEPTION 'G9 FAIL: Private Equity and IB members should sit in finance';
  END IF;
  RAISE NOTICE 'G9 OK: broad clusters only; counts match fixtures';

  -- ── G10: aggregate paths, with small groups suppressed ─────
  -- Cross-circle pairs present in the data: consulting-other,
  -- consulting-marketing_sales, consulting-finance,
  -- consulting-technology. Only consulting(3) and finance(3) are
  -- both large enough to publish; the other three are withheld.
  IF jsonb_array_length(g->'cluster_links') <> 1 THEN
    RAISE EXCEPTION 'G10 FAIL: expected exactly 1 publishable link, got %',
      g->'cluster_links';
  END IF;
  SELECT x INTO l FROM jsonb_array_elements(g->'cluster_links') x LIMIT 1;
  IF l->>'cluster_a' <> 'consulting' OR l->>'cluster_b' <> 'finance'
     OR (l->>'mutual_connection_count')::int <> 1
     OR (l->>'verified_exchange_count')::int <> 1
     OR (l->>'strength_tier')::int <> 1 THEN
    RAISE EXCEPTION 'G10 FAIL: consulting-finance link wrong: %', l;
  END IF;
  IF (g->>'suppressed_link_count')::int <> 3 THEN
    RAISE EXCEPTION 'G10 FAIL: expected 3 suppressed links, got %',
      g->>'suppressed_link_count';
  END IF;
  -- a circle with fewer than 3 members can never appear in a path
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(g->'cluster_links') x
              WHERE x->>'cluster_a' IN ('other','technology','marketing_sales')
                 OR x->>'cluster_b' IN ('other','technology','marketing_sales')) THEN
    RAISE EXCEPTION 'G10 FAIL: a small circle leaked into a published path';
  END IF;
  RAISE NOTICE 'G10 OK: paths carry counts only, and small circles are suppressed';

  -- ── G11: private graph returns caller-participant edges ONLY ─
  PERFORM pg_temp.impersonate(uB);
  g := public.my_relationship_graph(cid);
  PERFORM pg_temp.god();
  IF jsonb_array_length(g->'edges') <> 2 THEN
    RAISE EXCEPTION 'G11 FAIL: B should have exactly 2 relationships, got %', g;
  END IF;
  IF g::text LIKE '%' || dkey || '%' THEN
    RAISE EXCEPTION 'G11 FAIL: C-D relationship leaked into B''s graph';
  END IF;
  SELECT x INTO e FROM jsonb_array_elements(g->'edges') x
   WHERE x->>'other_node_key' = akey;
  IF e->>'origin_source' <> 'event'
     OR (e->>'verified_exchange_count')::int <> 3
     OR (e->>'token_count')::int <> 2
     OR (e->>'strength_tier')::int <> 2
     OR (e->'source_breakdown'->>'event')::int <> 1
     OR (e->'source_breakdown'->>'together')::int <> 2
     OR (e->>'first_connected_at') IS NULL THEN
    RAISE EXCEPTION 'G11 FAIL: B-A private edge wrong: %', e;
  END IF;
  -- B-C is a Discover exchange both people confirmed: since the
  -- discover-token migration that mints one shared Token too
  SELECT x INTO e FROM jsonb_array_elements(g->'edges') x
   WHERE x->>'other_node_key' = ckey;
  IF (e->>'verified_exchange_count')::int <> 1
     OR (e->>'token_count')::int <> 1
     OR (e->>'strength_tier')::int <> 1
     OR (e->'source_breakdown'->>'discover')::int <> 1 THEN
    RAISE EXCEPTION 'G11 FAIL: B-C private edge wrong: %', e;
  END IF;
  -- names DO reach the caller here, and only here: B is mutually
  -- connected to A and C, so B may see those two names and no others
  IF g::text NOT LIKE '%Alice Anders%' OR g::text NOT LIKE '%Cara Chen%' THEN
    RAISE EXCEPTION 'G11 FAIL: a participant should see their own partners named';
  END IF;
  IF g::text LIKE '%Dan Dorn%' OR g::text LIKE '%Hana Hub%' THEN
    RAISE EXCEPTION 'G11 FAIL: a non-partner name reached the caller';
  END IF;
  RAISE NOTICE 'G11 OK: full detail and names only for the caller''s own partners';

  -- ── G12: unilateral signals never appear, even privately ────
  PERFORM pg_temp.impersonate(uD);
  g := public.my_relationship_graph(cid);
  PERFORM pg_temp.god();
  -- D's only mutual connection is C (ended-after-accept). The
  -- real-name-post swipe from B, the anonymous-post match with A,
  -- the practice-source match and the one-sided confirmation add
  -- NOTHING — not even in D's own private view.
  IF jsonb_array_length(g->'edges') <> 1
     OR (g->'edges'->0->>'other_node_key') <> ckey
     OR (g->'edges'->0->>'verified_exchange_count')::int <> 0
     OR (g->'edges'->0->>'token_count')::int <> 0
     OR (g->'edges'->0->>'strength_tier')::int <> 0 THEN
    RAISE EXCEPTION 'G12 FAIL: D private graph wrong: %', g;
  END IF;
  RAISE NOTICE 'G12 OK: two-sided signals only; a bare mutual line has tier 0 and no tokens';

  -- ── G13: cross-community isolation ──────────────────────────
  -- Together artifacts are community-scoped: cid holds 2 tokens on
  -- A-B, cid2 holds 1 — neither leaks into the other. Event and
  -- Discover relationships are between PEOPLE (events carry no
  -- community), so the mutual ev1 connection shows wherever both
  -- are members: cid2 A-B = event origin, verified 2 (1 event +
  -- 1 cid2 together), exactly 1 token.
  PERFORM pg_temp.impersonate(uA);
  g := public.my_relationship_graph(cid2);
  PERFORM pg_temp.god();
  IF jsonb_array_length(g->'edges') <> 1
     OR (g->'edges'->0->>'origin_source') <> 'event'
     OR (g->'edges'->0->>'verified_exchange_count')::int <> 2
     OR (g->'edges'->0->>'token_count')::int <> 1
     OR (g->'edges'->0->'source_breakdown'->>'together')::int <> 1 THEN
    RAISE EXCEPTION 'G13 FAIL: cid tokens leaked into cid2: %', g;
  END IF;
  PERFORM pg_temp.impersonate(uA);
  g := public.community_map_summary(cid2);
  PERFORM pg_temp.god();
  IF (g->'community'->>'member_count')::int <> 2
     OR (g->'community'->>'mutual_connection_count')::int <> 1
     OR (g->'community'->>'verified_exchange_count')::int <> 2 THEN
    RAISE EXCEPTION 'G13 FAIL: cid2 map counts wrong: %', g->'community';
  END IF;
  RAISE NOTICE 'G13 OK: community-scoped tokens never cross; H-I-J-K stay out of cid2';

  -- ── G14: blocks hide the member and their aggregates ────────
  INSERT INTO public.blocks (blocker_id, blocked_user_id) VALUES (uA, uD);
  PERFORM pg_temp.impersonate(uA);
  g := public.community_map_summary(cid);
  PERFORM pg_temp.god();
  IF g::text LIKE '%' || dkey || '%'
     OR (g->'community'->>'member_count')::int <> 9
     OR (g->'community'->>'mutual_connection_count')::int <> 6 THEN
    RAISE EXCEPTION 'G14 FAIL: blocked member still visible: %', g->'community';
  END IF;
  DELETE FROM public.blocks WHERE blocker_id = uA AND blocked_user_id = uD;
  RAISE NOTICE 'G14 OK: caller blocks remove the member from map and aggregates';

  -- ── G15: no raw auth ids anywhere ───────────────────────────
  PERFORM pg_temp.impersonate(uA);
  g := public.community_map_summary(cid);
  e := public.my_relationship_graph(cid);
  PERFORM pg_temp.god();
  IF g::text LIKE '%' || uA::text || '%' OR g::text LIKE '%' || uB::text || '%'
     OR e::text LIKE '%' || uA::text || '%' OR e::text LIKE '%' || uB::text || '%' THEN
    RAISE EXCEPTION 'G15 FAIL: raw user id leaked into a payload';
  END IF;
  RAISE NOTICE 'G15 OK: node keys are opaque in both payloads';

  -- ── G16: career_focus_key mirrors careerFocus.js ────────────
  IF public.career_focus_key('Private Equity') <> 'finance'
     OR public.career_focus_key('Investment Banking') <> 'finance'
     OR public.career_focus_key('VC') <> 'finance'
     OR public.career_focus_key('Tech') <> 'technology'
     OR public.career_focus_key('Start-up') <> 'entrepreneurship'
     OR public.career_focus_key('Consulting') <> 'consulting'
     OR public.career_focus_key('Underwater basket weaving') <> 'other'
     OR public.career_focus_key(NULL) <> 'other' THEN
    RAISE EXCEPTION 'G16 FAIL: career_focus_key mapping drifted from careerFocus.js';
  END IF;
  RAISE NOTICE 'G16 OK: SQL career-focus mapping matches the canonical taxonomy';

  -- ── G17: identity unlocks only on a bilateral action ────────
  PERFORM pg_temp.impersonate(uA);
  g := public.community_map_summary(cid);
  e := public.my_relationship_graph(cid);
  PERFORM pg_temp.god();
  -- A unlocked B (accepted partnership + mutually confirmed event)
  SELECT x INTO n FROM jsonb_array_elements(g->'members') x
   WHERE x->>'node_key' = md5(cid::text || ':' || uB::text);
  IF NOT (n->>'is_identity_unlocked')::boolean OR n->>'display_name' <> 'Bob Brant' THEN
    RAISE EXCEPTION 'G17 FAIL: an accepted partnership should unlock identity: %', n;
  END IF;
  -- A and C are mutually connected through a SMART MATCH only: the
  -- line exists, the identity does not
  SELECT x INTO n FROM jsonb_array_elements(g->'members') x
   WHERE x->>'node_key' = ckey;
  IF (n->>'is_identity_unlocked')::boolean
     OR (n->'display_name') <> 'null'::jsonb
     OR (n->'avatar_url') <> 'null'::jsonb THEN
    RAISE EXCEPTION 'G17 FAIL: a smart match must not unlock identity: %', n;
  END IF;
  IF g::text LIKE '%Cara Chen%' THEN
    RAISE EXCEPTION 'G17 FAIL: locked name present in A''s map payload';
  END IF;
  -- strangers stay locked, whatever their public status
  SELECT x INTO n FROM jsonb_array_elements(g->'members') x
   WHERE x->>'node_key' = md5(cid::text || ':' || uH::text);
  IF (n->>'is_identity_unlocked')::boolean OR (n->'display_name') <> 'null'::jsonb THEN
    RAISE EXCEPTION 'G17 FAIL: a Connector stranger must stay anonymous: %', n;
  END IF;
  IF NOT (n->>'is_community_connector')::boolean THEN
    RAISE EXCEPTION 'G17 FAIL: public status should survive anonymity';
  END IF;
  -- and the private graph carries UNLOCKED relationships only
  IF jsonb_array_length(e->'edges') <> 1
     OR (e->'edges'->0->>'other_node_key') <> md5(cid::text || ':' || uB::text) THEN
    RAISE EXCEPTION 'G17 FAIL: A''s private graph should hold only the unlocked B edge: %', e;
  END IF;
  RAISE NOTICE 'G17 OK: identity unlocks only through a bilateral action, per viewer';

  RAISE NOTICE '── community map privacy split v9: ALL ASSERTIONS PASSED ──';
END $$;

ROLLBACK;
