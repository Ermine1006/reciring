-- ============================================================
-- Mutu — post-migration audit
--
-- READ ONLY. Every statement is a SELECT against the catalog.
-- Nothing is created, altered, dropped or written. Safe to run
-- in the Supabase SQL Editor on production.
--
-- Covers the three migrations:
--   migration-practice-meeting-links.sql
--   migration-discover-tokens.sql
--   migration-community-network-graph.sql  (re-run)
--
-- Read the `status` column: every row should say PASS.
-- ============================================================

WITH checks AS (

-- ── A. Meeting links: the three columns ─────────────────────────
SELECT 1 AS ord, 'A1 meeting columns' AS check_name,
       string_agg(column_name || ' ' || data_type, ', ' ORDER BY column_name) AS found,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL expected 3' END AS status
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'practice_sessions'
   AND column_name IN ('meeting_method','meeting_url','meeting_location')

UNION ALL
-- ── A2. Meeting links: the five CHECK constraints ───────────────
SELECT 2, 'A2 meeting constraints',
       coalesce(string_agg(conname, ', ' ORDER BY conname), '(none)'),
       CASE WHEN count(*) = 5 THEN 'PASS' ELSE 'FAIL expected 5' END
  FROM pg_constraint
 WHERE conrelid = 'public.practice_sessions'::regclass
   AND conname IN ('ps_meeting_method_valid','ps_meeting_url_shape',
                   'ps_meeting_url_required','ps_meeting_host_matches',
                   'ps_meeting_location_shape')

UNION ALL
-- ── A3. The host regexes survived the file intact ───────────────
-- A double backslash here would silently reject valid links.
SELECT 3, 'A3 host regex intact',
       CASE WHEN pg_get_constraintdef(oid) LIKE '%\\\\.%' THEN 'DOUBLE BACKSLASH'
            ELSE 'single backslash, correct' END,
       CASE WHEN pg_get_constraintdef(oid) LIKE '%\\\\.%' THEN 'FAIL'
            WHEN pg_get_constraintdef(oid) ILIKE '%zoom%' THEN 'PASS'
            ELSE 'FAIL zoom host missing' END
  FROM pg_constraint
 WHERE conrelid = 'public.practice_sessions'::regclass
   AND conname = 'ps_meeting_host_matches'

UNION ALL
-- ── A4. propose_practice_session: EXACTLY ONE overload, 12 args ─
-- More than one row here means an ambiguous overload and every
-- scheduling call in the app is already broken.
SELECT 4, 'A4 propose overloads',
       coalesce(string_agg(pronargs::text || ' args', ', ' ORDER BY pronargs), '(none)'),
       CASE WHEN count(*) = 1 AND max(pronargs) = 12 THEN 'PASS'
            WHEN count(*) > 1 THEN 'FAIL ambiguous overload'
            ELSE 'FAIL wrong arity' END
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace AND proname = 'propose_practice_session'

UNION ALL
-- ── A5. propose is executable by authenticated, not by anon ─────
SELECT 5, 'A5 propose grants',
       CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
            THEN 'authenticated=yes' ELSE 'authenticated=NO' END || ', ' ||
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN 'anon=YES' ELSE 'anon=no' END,
       CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
             AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'propose_practice_session'

UNION ALL
-- ── A6. Sessions are still participant-only ─────────────────────
SELECT 6, 'A6 sessions RLS',
       CASE WHEN c.relrowsecurity THEN 'row level security enabled'
            ELSE 'RLS OFF' END,
       CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END
  FROM pg_class c WHERE c.oid = 'public.practice_sessions'::regclass

UNION ALL
-- ── A7. No meeting link ever reached a notification ─────────────
SELECT 7, 'A7 links out of notifications',
       count(*)::text || ' notifications contain a meeting host',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM public.notifications
 WHERE body ILIKE '%zoom.us%' OR body ILIKE '%teams.microsoft%'
    OR title ILIKE '%zoom.us%' OR title ILIKE '%teams.microsoft%'
    OR payload::text ILIKE '%zoom.us%' OR payload::text ILIKE '%teams.microsoft%'

UNION ALL
-- ── B1. Discover tokens: the two columns ────────────────────────
SELECT 11, 'B1 token columns',
       coalesce(string_agg(column_name, ', ' ORDER BY column_name), '(none)'),
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL expected 2' END
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'practice_exchange_tokens'
   AND column_name IN ('source','match_id')

UNION ALL
-- ── B2. Constraints + the one-per-match index ───────────────────
SELECT 12, 'B2 token guards',
       coalesce((SELECT string_agg(conname, ', ' ORDER BY conname) FROM pg_constraint
                  WHERE conrelid = 'public.practice_exchange_tokens'::regclass
                    AND conname IN ('pet_source_valid','pet_source_shape')), '(no constraints)')
       || ' | index: ' ||
       coalesce((SELECT string_agg(indexname, ', ') FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'pet_one_per_match'), '(missing)'),
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conrelid = 'public.practice_exchange_tokens'::regclass
                     AND conname IN ('pet_source_valid','pet_source_shape')) = 2
             AND EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname = 'public' AND indexname = 'pet_one_per_match')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL
-- ── B3. The mint function and its trigger ───────────────────────
SELECT 13, 'B3 discover mint path',
       coalesce((SELECT string_agg(proname, ', ' ORDER BY proname) FROM pg_proc
                  WHERE pronamespace = 'public'::regnamespace
                    AND proname IN ('mint_discover_token','tg_mint_discover_token')), '(none)')
       || ' | trigger: ' ||
       coalesce((SELECT string_agg(tgname, ', ') FROM pg_trigger
                  WHERE tgrelid = 'public.exchange_confirmations'::regclass
                    AND tgname = 'trg_mint_discover_token' AND NOT tgisinternal), '(missing)'),
       CASE WHEN (SELECT count(*) FROM pg_proc
                   WHERE pronamespace = 'public'::regnamespace
                     AND proname IN ('mint_discover_token','tg_mint_discover_token')) = 2
             AND EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgrelid = 'public.exchange_confirmations'::regclass
                            AND tgname = 'trg_mint_discover_token' AND NOT tgisinternal)
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL
-- ── B4. What the backfill actually minted (informational) ───────
SELECT 14, 'B4 token counts by source',
       coalesce((SELECT string_agg(source || '=' || n, ', ' ORDER BY source)
                   FROM (SELECT source, count(*)::text AS n
                           FROM public.practice_exchange_tokens GROUP BY source) x), '(no tokens)'),
       'INFO'

UNION ALL
-- ── B5. No token can carry both a session and a match ───────────
SELECT 15, 'B5 no double-origin token',
       count(*)::text || ' tokens claim two origins',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM public.practice_exchange_tokens
 WHERE session_id IS NOT NULL AND match_id IS NOT NULL

UNION ALL
-- ── C1. The two map RPCs exist, the old one is gone ─────────────
SELECT 21, 'C1 map RPCs',
       coalesce((SELECT string_agg(proname, ', ' ORDER BY proname) FROM pg_proc
                  WHERE pronamespace = 'public'::regnamespace
                    AND proname IN ('community_map_summary','my_relationship_graph',
                                    '_community_edges','career_focus_key')), '(none)')
       || ' | old community_network_graph: ' ||
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                          AND proname = 'community_network_graph')
            THEN 'STILL PRESENT' ELSE 'dropped' END,
       CASE WHEN (SELECT count(*) FROM pg_proc
                   WHERE pronamespace = 'public'::regnamespace
                     AND proname IN ('community_map_summary','my_relationship_graph',
                                     '_community_edges','career_focus_key')) = 4
             AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                              AND proname = 'community_network_graph')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL
-- ── C2. THE RE-RUN CHECK: does the live body carry the guard? ───
-- Without `coalesce(t.source, 'practice') = 'practice'` a Discover
-- token is counted twice in the map. This proves the re-run landed.
SELECT 22, 'C2 double-count guard',
       CASE WHEN pg_get_functiondef(oid) LIKE '%coalesce(t.source%'
            THEN 'guard present' ELSE 'GUARD MISSING — re-run the graph migration' END,
       CASE WHEN pg_get_functiondef(oid) LIKE '%coalesce(t.source%'
            THEN 'PASS' ELSE 'FAIL' END
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace AND proname = '_community_edges'

UNION ALL
-- ── C3. The shared edge builder is unreachable from any client ──
SELECT 23, 'C3 _community_edges locked',
       CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
            THEN 'authenticated=YES' ELSE 'authenticated=no' END || ', ' ||
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN 'anon=YES' ELSE 'anon=no' END,
       CASE WHEN NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
             AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = '_community_edges'

UNION ALL
-- ── C4. The two public map RPCs: authenticated only ─────────────
SELECT 24, 'C4 map RPC grants',
       string_agg(p.proname || ': anon=' ||
                  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'YES' ELSE 'no' END,
                  ', ' ORDER BY p.proname),
       CASE WHEN bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                          AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
            THEN 'PASS' ELSE 'FAIL' END
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('community_map_summary','my_relationship_graph')

UNION ALL
-- ── D1. Nothing re-created a stale propose overload ─────────────
-- Re-running the reciprocal or notification-copy migration after
-- the meeting-links migration would put a 6-arg version back.
SELECT 31, 'D1 no stale RPC overloads',
       coalesce(string_agg(proname || '(' || pronargs || ')', ', ' ORDER BY proname, pronargs), 'none'),
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL duplicate overloads' END
  FROM (
    SELECT proname, pronargs FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('propose_practice_session','send_practice_invitation',
                       'accept_practice_invitation','submit_practice_confirmation',
                       'confirm_practice_session','browse_practice_requests')
     GROUP BY proname, pronargs
  ) a
 WHERE (SELECT count(*) FROM pg_proc p2
         WHERE p2.pronamespace = 'public'::regnamespace AND p2.proname = a.proname) > 1

)
SELECT check_name, found, status FROM checks ORDER BY ord;
