-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — Community Map privacy split  (v8)
--
--   Public status, private relationships.
--
-- WHY v8
-- The previous RPC (community_network_graph) sent the COMPLETE pair
-- edge list — stable node-key pairs, per-pair verified counts, token
-- counts, dates and breakdowns — to every active community member's
-- browser. That exposes who-meets-whom topology to everyone. v8
-- REPLACES it with two contracts, and DROPS the old function so the
-- browser can never receive data the viewer may not inspect:
--
--   community_map_summary(community_id)  — community-safe. Members,
--     Career-Focus clusters, and AGGREGATE cluster-to-cluster link
--     counts. NO pair edges, NO pair-level token counts, NO dates.
--     Public identity signals only: earned contribution tier, earned
--     badges, Community Connector role, connected-circle count.
--
--   my_relationship_graph(community_id)  — private. ONLY edges where
--     the CALLER is one endpoint: exact origin, token count, source
--     breakdown, strength tier, dates. Powers My Circle + Locate me.
--
-- RELATIONSHIP DEFINITIONS (unchanged from v7)
--   mutual connection — two-sided only: ever-accepted pairings;
--     discover = reveal accepted OR smart_match OR both-We-met;
--     event = mutually confirmed BOTH directions.
--   verified exchange — tokens + both-We-met matches + mutual
--     encounters.  token = minted practice_exchange_tokens only.
--   scoping — Together pairings/tokens are community-scoped; Event
--     and Discover relationships are between people (events carry no
--     community id), so they appear in any community where BOTH are
--     members. Today Mutu has one live community, so no practical
--     duplication.
--
-- PUBLIC STATUS (evidence-backed, never popularity)
--   contribution tier / badges come ONLY from verified behaviour:
--     first_exchange          ≥ 1 verified exchange
--     contributor             ≥ 3 verified exchanges
--     community_contributor   ≥ 5 distinct verified partners
--     trusted_collaborator    ≥ 3 repeat-verified partners
--     community_builder       ≥ 10 verified exchanges
--   tier: new(0) · contributor(1-2) · established(3-9) · builder(10+)
--   Community Connector (a documented CONSERVATIVE approximation —
--   NOT formal betweenness centrality): ≥ 3 distinct verified
--   partners AND those partners span ≥ 2 Career-Focus circles beyond
--   the member's own. Each relationship counted once.
--   No leaderboards, no centrality scores, no rankings.
--
-- CAREER-FOCUS KEYS
--   public.career_focus_key(text) mirrors src/data/careerFocus.js
--   (broad machine keys; IB/PE/VC → finance). KEEP THE TWO IN SYNC.
--
-- IDENTITY UNLOCK (per viewer, enforced here, never in React)
--   A member's name and avatar reach a viewer ONLY after a genuine
--   bilateral action between those two people:
--     · an accepted Together pairing
--     · an accepted Discover identity-reveal handshake
--     · a mutually confirmed event encounter (one side requests
--       confirmation, the other accepts; both memories then name
--       the other person)
--   These do NOT unlock: a unilateral swipe, a smart match on its
--   own, a pair of "We met" confirmations without a reveal, mere
--   attendance at the same event, an invitation before acceptance,
--   any anonymous or unaccepted interaction. Locked members come
--   back with display_name = NULL and avatar_url = NULL.
--   my_relationship_graph returns UNLOCKED relationships only, so
--   My Circle and Locate me can never draw a nameless stranger.
--   Anonymous mutual connections still count in the community
--   aggregates; they simply cannot be attributed to a person.
--
-- SCOPING & SECURITY (both functions)
--   caller: authenticated + active access + active member
--   (practice_is_community_eligible); caller's blocks hide members in
--   both directions; opaque md5 node keys; community-scoped only;
--   nothing anonymous/pre-acceptance; anon/PUBLIC revoked.
--
-- Idempotent. Read-only. Rollback at the bottom.
-- Assertions: scripts/practice-assertions-community-graph.sql (v10)
-- ============================================================

-- ── Canonical broad Career-Focus key (mirror of careerFocus.js) ──
CREATE OR REPLACE FUNCTION public.career_focus_key(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_raw, '')))
    WHEN '' THEN 'other'
    WHEN 'finance' THEN 'finance'
    WHEN 'investment banking' THEN 'finance'
    WHEN 'investment-banking' THEN 'finance'
    WHEN 'ib' THEN 'finance'
    WHEN 'banking' THEN 'finance'
    WHEN 'private equity' THEN 'finance'
    WHEN 'private-equity' THEN 'finance'
    WHEN 'pe' THEN 'finance'
    WHEN 'vc' THEN 'finance'
    WHEN 'venture capital' THEN 'finance'
    WHEN 'venture-capital' THEN 'finance'
    WHEN 'asset management' THEN 'finance'
    WHEN 'corporate finance' THEN 'finance'
    WHEN 'fintech' THEN 'finance'
    WHEN 'consulting' THEN 'consulting'
    WHEN 'technology' THEN 'technology'
    WHEN 'tech' THEN 'technology'
    WHEN 'ai & technology' THEN 'technology'
    WHEN 'ai-technology' THEN 'technology'
    WHEN 'ai' THEN 'technology'
    WHEN 'software' THEN 'technology'
    WHEN 'marketing' THEN 'marketing_sales'
    WHEN 'sales' THEN 'marketing_sales'
    WHEN 'marketing & sales' THEN 'marketing_sales'
    WHEN 'operations' THEN 'operations_supply_chain'
    WHEN 'supply chain' THEN 'operations_supply_chain'
    WHEN 'operations & supply chain' THEN 'operations_supply_chain'
    WHEN 'strategy' THEN 'strategy_general_management'
    WHEN 'general management' THEN 'strategy_general_management'
    WHEN 'strategy & general management' THEN 'strategy_general_management'
    WHEN 'entrepreneurship' THEN 'entrepreneurship'
    WHEN 'startup' THEN 'entrepreneurship'
    WHEN 'start-up' THEN 'entrepreneurship'
    WHEN 'start up' THEN 'entrepreneurship'
    WHEN 'founder' THEN 'entrepreneurship'
    WHEN 'healthcare' THEN 'healthcare_life_sciences'
    WHEN 'health' THEN 'healthcare_life_sciences'
    WHEN 'biotech' THEN 'healthcare_life_sciences'
    WHEN 'life sciences' THEN 'healthcare_life_sciences'
    WHEN 'healthcare & life sciences' THEN 'healthcare_life_sciences'
    WHEN 'real estate' THEN 'real_estate'
    WHEN 'real-estate' THEN 'real_estate'
    WHEN 'proptech' THEN 'real_estate'
    WHEN 'sustainability' THEN 'sustainability_social_impact'
    WHEN 'social impact' THEN 'sustainability_social_impact'
    WHEN 'social-impact' THEN 'sustainability_social_impact'
    WHEN 'energy & climate' THEN 'sustainability_social_impact'
    WHEN 'energy-climate' THEN 'sustainability_social_impact'
    WHEN 'cleantech' THEN 'sustainability_social_impact'
    WHEN 'climate' THEN 'sustainability_social_impact'
    WHEN 'public sector' THEN 'public_nonprofit'
    WHEN 'nonprofit' THEN 'public_nonprofit'
    WHEN 'public sector & nonprofit' THEN 'public_nonprofit'
    ELSE 'other'
  END
$$;

-- ── Shared internal builder: the FULL mutual-connection edge set ──
-- SECURITY DEFINER internals only; never granted to clients. Both
-- public RPCs derive from this one definition so their numbers can
-- never disagree.
-- dropped first: the RETURNS TABLE shape changes between revisions
DROP FUNCTION IF EXISTS public._community_edges(uuid, uuid);
CREATE FUNCTION public._community_edges(p_community_id uuid, p_viewer uuid)
RETURNS TABLE (
  lo uuid, hi uuid,
  origin_source text,
  first_connected_at timestamptz,
  verified_exchange_count int,
  token_count int,
  source_breakdown jsonb,
  last_verified_at timestamptz,
  is_unlock boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH members AS (
    SELECT cm.user_id
    FROM public.community_members cm
    JOIN public.profiles pr ON pr.id = cm.user_id
    WHERE cm.community_id = p_community_id
      AND cm.status = 'member'
      AND pr.access_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = p_viewer AND b.blocked_user_id = cm.user_id)
           OR (b.blocker_id = cm.user_id AND b.blocked_user_id = p_viewer))
  ),
  -- `unlocks` marks the rows that genuinely reveal identity to BOTH
  -- people (see the IDENTITY UNLOCK note in the header).
  conn_raw AS (
    SELECT LEAST(p.requester_user_id, p.addressee_user_id) AS lo,
           GREATEST(p.requester_user_id, p.addressee_user_id) AS hi,
           'together'::text AS src, min(p.accepted_at) AS connected_at,
           true AS unlocks
    FROM public.practice_pairings p
    WHERE p.community_id = p_community_id
      AND p.status IN ('accepted', 'ended') AND p.accepted_at IS NOT NULL
    GROUP BY 1, 2
    UNION ALL
    SELECT LEAST(m.requester_user_id, m.helper_user_id),
           GREATEST(m.requester_user_id, m.helper_user_id),
           'discover', min(coalesce(m.identity_reveal_accepted_at, m.created_at)),
           -- ONLY an accepted reveal handshake unlocks. A smart match
           -- or a pair of "We met" confirmations still draws a mutual
           -- connection, but both people may remain anonymous.
           bool_or(m.identity_reveal_status = 'accepted')
    FROM public.matches m
    WHERE coalesce(m.source, 'community') <> 'practice'
      AND m.requester_user_id <> m.helper_user_id
      AND m.status IN ('active', 'completed')
      AND (m.identity_reveal_status = 'accepted'
           OR coalesce(m.source, '') = 'smart_match'
           OR (SELECT count(DISTINCT c.user_id) FROM public.exchange_confirmations c
                WHERE c.match_id = m.id
                  AND c.user_id IN (m.requester_user_id, m.helper_user_id)) = 2)
    GROUP BY 1, 2
    UNION ALL
    SELECT e.user_id, e.encountered_user_id, 'event',
           min(coalesce(e.confirmed_at, e.created_at)),
           true
    FROM public.event_encounters e
    WHERE e.status = 'mutually_confirmed'
      AND e.user_id < e.encountered_user_id
      AND EXISTS (SELECT 1 FROM public.event_encounters r
                   WHERE r.user_id = e.encountered_user_id
                     AND r.encountered_user_id = e.user_id
                     AND r.event_id = e.event_id
                     AND r.status = 'mutually_confirmed')
    GROUP BY e.user_id, e.encountered_user_id
  ),
  conn AS (
    SELECT c.lo, c.hi,
           min(c.connected_at) AS first_connected_at,
           (ARRAY_AGG(c.src ORDER BY c.connected_at ASC, c.src ASC))[1] AS origin_source,
           bool_or(c.unlocks) AS is_unlock
    FROM conn_raw c
    JOIN members ma ON ma.user_id = c.lo
    JOIN members mb ON mb.user_id = c.hi
    GROUP BY c.lo, c.hi
  ),
  ver_raw AS (
    -- practice tokens only: a Discover token is already counted by
    -- the both-confirmed branch below, and must not be counted twice
    SELECT t.user_lo AS lo, t.user_hi AS hi, 'together'::text AS src,
           count(*)::int AS cnt, max(t.verified_at) AS last_at
    FROM public.practice_exchange_tokens t
    WHERE t.community_id = p_community_id
      AND coalesce(t.source, 'practice') = 'practice'
    GROUP BY 1, 2
    UNION ALL
    SELECT LEAST(m.requester_user_id, m.helper_user_id),
           GREATEST(m.requester_user_id, m.helper_user_id),
           'discover', count(*)::int, max(m.created_at)
    FROM public.matches m
    WHERE coalesce(m.source, 'community') <> 'practice'
      AND m.requester_user_id <> m.helper_user_id
      AND (SELECT count(DISTINCT c.user_id) FROM public.exchange_confirmations c
            WHERE c.match_id = m.id
              AND c.user_id IN (m.requester_user_id, m.helper_user_id)) = 2
    GROUP BY 1, 2
    UNION ALL
    SELECT e.user_id, e.encountered_user_id, 'event',
           count(DISTINCT e.event_id)::int,
           max(coalesce(e.confirmed_at, e.created_at))
    FROM public.event_encounters e
    WHERE e.status = 'mutually_confirmed'
      AND e.user_id < e.encountered_user_id
      AND EXISTS (SELECT 1 FROM public.event_encounters r
                   WHERE r.user_id = e.encountered_user_id
                     AND r.encountered_user_id = e.user_id
                     AND r.event_id = e.event_id
                     AND r.status = 'mutually_confirmed')
    GROUP BY e.user_id, e.encountered_user_id
  ),
  ver AS (
    SELECT v.lo, v.hi,
           sum(v.cnt)::int AS verified_exchange_count,
           max(v.last_at)  AS last_verified_at,
           jsonb_object_agg(v.src, v.cnt) AS source_breakdown
    FROM ver_raw v
    JOIN conn c ON c.lo = v.lo AND c.hi = v.hi
    GROUP BY v.lo, v.hi
  ),
  tok AS (
    SELECT t.user_lo AS lo, t.user_hi AS hi, count(*)::int AS token_count
    FROM public.practice_exchange_tokens t
    WHERE t.community_id = p_community_id
    GROUP BY 1, 2
  )
  SELECT c.lo, c.hi, c.origin_source, c.first_connected_at,
         coalesce(v.verified_exchange_count, 0),
         coalesce(t.token_count, 0),
         coalesce(v.source_breakdown, '{}'::jsonb),
         v.last_verified_at,
         c.is_unlock
  FROM conn c
  LEFT JOIN ver v ON v.lo = c.lo AND v.hi = c.hi
  LEFT JOIN tok t ON t.lo = c.lo AND t.hi = c.hi
$$;

REVOKE ALL ON FUNCTION public._community_edges(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 1. COMMUNITY-SAFE MAP: no pair edges, ever ───────────────────
CREATE OR REPLACE FUNCTION public.community_map_summary(p_community_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT name INTO v_name FROM public.communities WHERE id = p_community_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'community_not_found'; END IF;
  IF NOT public.practice_is_community_eligible(auth.uid(), p_community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  WITH members AS (
    -- name/avatar are carried here but released per row ONLY when the
    -- caller has unlocked that member (see node_rows below)
    SELECT cm.user_id,
           coalesce(nullif(trim(pr.name), ''), 'Member') AS display_name,
           pr.avatar_url,
           public.career_focus_key(pr.industry_interests[1]) AS focus_key
    FROM public.community_members cm
    JOIN public.profiles pr ON pr.id = cm.user_id
    WHERE cm.community_id = p_community_id
      AND cm.status = 'member'
      AND pr.access_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = auth.uid() AND b.blocked_user_id = cm.user_id)
           OR (b.blocker_id = cm.user_id AND b.blocked_user_id = auth.uid()))
  ),
  edges AS (
    SELECT * FROM public._community_edges(p_community_id, auth.uid())
  ),
  -- per-member verified stats (evidence for public status)
  ends AS (
    SELECT x.user_id, e.verified_exchange_count, e.token_count,
           CASE WHEN x.user_id = e.lo THEN e.hi ELSE e.lo END AS partner
    FROM edges e
    CROSS JOIN LATERAL (VALUES (e.lo), (e.hi)) AS x(user_id)
  ),
  stats AS (
    SELECT en.user_id,
           sum(en.verified_exchange_count)::int AS verified_total,
           count(*) FILTER (WHERE en.verified_exchange_count >= 1)::int AS verified_partners,
           count(*) FILTER (WHERE en.verified_exchange_count >= 2)::int AS repeat_partners,
           count(DISTINCT mp.focus_key)
             FILTER (WHERE en.verified_exchange_count >= 1
                       AND mp.focus_key IS DISTINCT FROM ms.focus_key)::int AS cross_circles,
           count(DISTINCT mp.focus_key)
             FILTER (WHERE en.verified_exchange_count >= 1)::int AS partner_circles
    FROM ends en
    JOIN members ms ON ms.user_id = en.user_id
    LEFT JOIN members mp ON mp.user_id = en.partner
    GROUP BY en.user_id
  ),
  -- pairs whose identity the CALLER has unlocked (bilateral action)
  unlocked AS (
    SELECT CASE WHEN e.lo = auth.uid() THEN e.hi ELSE e.lo END AS user_id
    FROM edges e
    WHERE auth.uid() IN (e.lo, e.hi) AND e.is_unlock
  ),
  node_rows AS (
    -- IDENTITY IS PER VIEWER: display_name and avatar_url are NULL
    -- unless this member is the caller or the caller has unlocked
    -- them. Locked members are opaque nodes carrying Career Focus
    -- placement and earned status only.
    SELECT md5(p_community_id::text || ':' || m.user_id::text) AS node_key,
           m.focus_key AS broad_career_focus,
           (m.user_id = auth.uid()) AS is_self,
           (m.user_id = auth.uid()
              OR EXISTS (SELECT 1 FROM unlocked u WHERE u.user_id = m.user_id))
             AS is_identity_unlocked,
           CASE WHEN m.user_id = auth.uid()
                  OR EXISTS (SELECT 1 FROM unlocked u WHERE u.user_id = m.user_id)
                THEN m.display_name END AS display_name,
           CASE WHEN m.user_id = auth.uid()
                  OR EXISTS (SELECT 1 FROM unlocked u WHERE u.user_id = m.user_id)
                THEN m.avatar_url END AS avatar_url,
           -- evidence-backed public tier (verified behaviour only)
           CASE WHEN coalesce(st.verified_total, 0) >= 10 THEN 'builder'
                WHEN coalesce(st.verified_total, 0) >= 3  THEN 'established'
                WHEN coalesce(st.verified_total, 0) >= 1  THEN 'contributor'
                ELSE 'new' END AS public_contribution_tier,
           coalesce((SELECT jsonb_agg(b) FROM (
              SELECT unnest(ARRAY[]::text[]
                || CASE WHEN coalesce(st.verified_total, 0) >= 1  THEN ARRAY['first_exchange'] ELSE ARRAY[]::text[] END
                || CASE WHEN coalesce(st.verified_total, 0) >= 3  THEN ARRAY['contributor'] ELSE ARRAY[]::text[] END
                || CASE WHEN coalesce(st.verified_partners, 0) >= 5 THEN ARRAY['community_contributor'] ELSE ARRAY[]::text[] END
                || CASE WHEN coalesce(st.repeat_partners, 0) >= 3 THEN ARRAY['trusted_collaborator'] ELSE ARRAY[]::text[] END
                || CASE WHEN coalesce(st.verified_total, 0) >= 10 THEN ARRAY['community_builder'] ELSE ARRAY[]::text[] END
              ) AS b) sub), '[]'::jsonb) AS public_badges,
           -- conservative Community Connector approximation (documented
           -- in the header; NOT betweenness centrality)
           (coalesce(st.verified_partners, 0) >= 3
              AND coalesce(st.cross_circles, 0) >= 2) AS is_community_connector,
           coalesce(st.partner_circles, 0)
             + CASE WHEN m.focus_key IS NOT NULL THEN 1 ELSE 0 END AS connected_circle_count
    FROM members m
    LEFT JOIN stats st ON st.user_id = m.user_id
  ),
  cluster_rows AS (
    SELECT m.focus_key AS career_focus_key,
           count(*)::int AS member_count,
           (SELECT count(*) FROM edges e
             JOIN members a2 ON a2.user_id = e.lo
             JOIN members b2 ON b2.user_id = e.hi
            WHERE a2.focus_key IS NOT DISTINCT FROM m.focus_key
              AND b2.focus_key IS NOT DISTINCT FROM m.focus_key)::int AS mutual_connection_count,
           (SELECT coalesce(sum(e.verified_exchange_count), 0) FROM edges e
             JOIN members a2 ON a2.user_id = e.lo
             JOIN members b2 ON b2.user_id = e.hi
            WHERE a2.focus_key IS NOT DISTINCT FROM m.focus_key
              AND b2.focus_key IS NOT DISTINCT FROM m.focus_key)::int AS verified_exchange_count
    FROM members m
    GROUP BY m.focus_key
  ),
  -- SMALL-GROUP SUPPRESSION (k-anonymity): a path between two Career
  -- Focus circles is only published when BOTH circles hold at least
  -- MIN_CIRCLE members. Otherwise the aggregate would point at a
  -- specific pair. Suppressed volume still counts in the community
  -- totals, never as a drawable path. MIN_CIRCLE = 3.
  link_all AS (
    SELECT LEAST(a2.focus_key, b2.focus_key)    AS cluster_a,
           GREATEST(a2.focus_key, b2.focus_key) AS cluster_b,
           count(*)::int AS mutual_connection_count,
           sum(e.verified_exchange_count)::int  AS verified_exchange_count
    FROM edges e
    JOIN members a2 ON a2.user_id = e.lo
    JOIN members b2 ON b2.user_id = e.hi
    WHERE a2.focus_key IS DISTINCT FROM b2.focus_key
    GROUP BY 1, 2
  ),
  link_rows AS (
    SELECT l.cluster_a, l.cluster_b, l.mutual_connection_count, l.verified_exchange_count,
           CASE WHEN l.verified_exchange_count >= 7 THEN 4
                WHEN l.verified_exchange_count >= 4 THEN 3
                WHEN l.verified_exchange_count >= 2 THEN 2
                WHEN l.verified_exchange_count >= 1 THEN 1
                ELSE 0 END AS strength_tier
    FROM link_all l
    JOIN cluster_rows ca ON ca.career_focus_key IS NOT DISTINCT FROM l.cluster_a
    JOIN cluster_rows cb ON cb.career_focus_key IS NOT DISTINCT FROM l.cluster_b
    WHERE ca.member_count >= 3 AND cb.member_count >= 3
  )
  SELECT jsonb_build_object(
    'community', jsonb_build_object(
      'community_id',            p_community_id,
      'community_name',          v_name,
      'member_count',            (SELECT count(*) FROM members),
      'mutual_connection_count', (SELECT count(*) FROM edges),
      'verified_exchange_count', (SELECT coalesce(sum(verified_exchange_count), 0) FROM edges),
      -- relationships (not raw exchanges) with a verified exchange in
      -- the last 30 days — powers privacy-safe social proof copy
      'relationships_strengthened_30d', (SELECT count(*) FROM edges
                                   WHERE last_verified_at >= now() - interval '30 days')),
    'members',  coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.node_key) FROM node_rows n), '[]'::jsonb),
    'clusters', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM cluster_rows c), '[]'::jsonb),
    'cluster_links', coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM link_rows l), '[]'::jsonb),
    -- how many field pairs were withheld as too small to publish
    'suppressed_link_count', (SELECT count(*) FROM link_all) - (SELECT count(*) FROM link_rows)
  ) INTO v_out;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.community_map_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_map_summary(uuid) TO authenticated;

-- ── 2. PRIVATE PERSONAL GRAPH: caller-participant edges only ─────
CREATE OR REPLACE FUNCTION public.my_relationship_graph(p_community_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE id = p_community_id) THEN
    RAISE EXCEPTION 'community_not_found';
  END IF;
  IF NOT public.practice_is_community_eligible(auth.uid(), p_community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  SELECT jsonb_build_object(
    'edges', coalesce(jsonb_agg(jsonb_build_object(
      'other_node_key', md5(p_community_id::text || ':' ||
        (CASE WHEN e.lo = auth.uid() THEN e.hi ELSE e.lo END)::text),
      'display_name', coalesce(nullif(trim(pr.name), ''), 'Member'),
      'avatar_url', pr.avatar_url,
      'broad_career_focus', public.career_focus_key(pr.industry_interests[1]),
      'origin_source', e.origin_source,
      'first_connected_at', e.first_connected_at,
      'verified_exchange_count', e.verified_exchange_count,
      'token_count', e.token_count,
      'source_breakdown', e.source_breakdown,
      'last_verified_at', e.last_verified_at,
      'strength_tier',
        CASE WHEN e.verified_exchange_count >= 7 THEN 4
             WHEN e.verified_exchange_count >= 4 THEN 3
             WHEN e.verified_exchange_count >= 2 THEN 2
             WHEN e.verified_exchange_count >= 1 THEN 1
             ELSE 0 END
    )), '[]'::jsonb)
  ) INTO v_out
  FROM public._community_edges(p_community_id, auth.uid()) e
  JOIN public.profiles pr
    ON pr.id = (CASE WHEN e.lo = auth.uid() THEN e.hi ELSE e.lo END)
  WHERE auth.uid() IN (e.lo, e.hi)           -- caller-participant ONLY
    AND e.is_unlock;                         -- and identity unlocked

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.my_relationship_graph(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_relationship_graph(uuid) TO authenticated;

-- ── 3. Retire the over-sharing RPC ───────────────────────────────
DROP FUNCTION IF EXISTS public.community_network_graph(uuid);

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.community_map_summary(uuid);
-- DROP FUNCTION IF EXISTS public.my_relationship_graph(uuid);
-- DROP FUNCTION IF EXISTS public._community_edges(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.career_focus_key(text);
-- (to restore the previous map, re-run the prior v7 migration file)
-- ============================================================
