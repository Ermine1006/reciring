-- ============================================================
-- Mutu — Step 4 pre-audit: what does the LIVE
-- submit_practice_confirmation look like right now?
--
-- READ ONLY. Catalog reads only. Nothing is written.
--
-- Why this exists: migration-practice-feedback.sql replaces the
-- whole function with CREATE OR REPLACE. If the version it was
-- written against is not the version that is live, running it
-- silently reverts whatever the newer migration changed. This
-- confirms the base is what Step 4 assumes.
-- ============================================================

WITH f AS (
  SELECT p.oid, p.pronargs, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'submit_practice_confirmation'
),
checks AS (

SELECT 1 AS ord, 'E1 one overload, 5 args' AS check_name,
       coalesce(string_agg(pronargs::text || ' args', ', '), '(missing)') AS found,
       CASE WHEN count(*) = 1 AND max(pronargs) = 5 THEN 'PASS'
            WHEN count(*) = 1 AND max(pronargs) = 7 THEN 'ALREADY MIGRATED'
            WHEN count(*) > 1 THEN 'FAIL ambiguous overload'
            ELSE 'FAIL' END AS status
  FROM f

UNION ALL
-- The three Together strings must ALREADY be the new wording. If any
-- shows the old wording, together-copy is not live and Step 4 must be
-- rebased again before it runs.
SELECT 2, 'E2 Together copy is live',
       CASE WHEN def LIKE '%Confirm your side to verify the session%'
            THEN 'session wording' ELSE 'OLD: verify the exchange' END || ' | ' ||
       CASE WHEN def LIKE '%Session verified%'
            THEN 'Session verified' ELSE 'OLD: Practice exchange verified' END || ' | ' ||
       CASE WHEN def LIKE '%You both confirmed! You unlocked a shared Mutu Token%'
            THEN 'unlocked a shared Mutu Token' ELSE 'OLD: earned a shared exchange token' END,
       CASE WHEN def LIKE '%Confirm your side to verify the session%'
             AND def LIKE '%Session verified%'
             AND def LIKE '%You both confirmed! You unlocked a shared Mutu Token%'
            THEN 'PASS' ELSE 'FAIL rebase Step 4 first' END
  FROM f

UNION ALL
-- The invariants Step 4 must not touch.
SELECT 3, 'E3 first confirmation does not verify',
       CASE WHEN def LIKE '%completed_pending_confirmation%' THEN 'pending state present'
            ELSE 'MISSING' END,
       CASE WHEN def LIKE '%completed_pending_confirmation%' THEN 'PASS' ELSE 'FAIL' END
  FROM f

UNION ALL
SELECT 4, 'E4 disagreement disputes, never mints',
       CASE WHEN def LIKE '%disputed%' THEN 'disputed branch present' ELSE 'MISSING' END,
       CASE WHEN def LIKE '%disputed%' THEN 'PASS' ELSE 'FAIL' END
  FROM f

UNION ALL
SELECT 5, 'E5 token minted server side only',
       CASE WHEN def LIKE '%practice_exchange_tokens%' THEN 'mint lives inside this RPC'
            ELSE 'MISSING' END,
       CASE WHEN def LIKE '%practice_exchange_tokens%' THEN 'PASS' ELSE 'FAIL' END
  FROM f

UNION ALL
SELECT 6, 'E6 reciprocity CHECK intact',
       coalesce((SELECT string_agg(conname, ', ' ORDER BY conname) FROM pg_constraint
                  WHERE conrelid = 'public.practice_session_confirmations'::regclass
                    AND contype = 'c'), '(none)'),
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conrelid = 'public.practice_session_confirmations'::regclass
                            AND conname = 'psc_completed_is_reciprocal')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL
SELECT 7, 'E7 one token per session',
       coalesce((SELECT string_agg(conname || '/' || contype::text, ', ') FROM pg_constraint
                  WHERE conrelid = 'public.practice_exchange_tokens'::regclass
                    AND contype = 'u'), '')
       || coalesce((SELECT ' idx: ' || string_agg(indexname, ', ') FROM pg_indexes
                     WHERE schemaname = 'public' AND tablename = 'practice_exchange_tokens'
                       AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%session_id%'), ' (no session unique)'),
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname = 'public' AND tablename = 'practice_exchange_tokens'
                            AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%session_id%')
            THEN 'PASS' ELSE 'FAIL' END

UNION ALL
-- Step 4 objects must NOT exist yet.
SELECT 8, 'E8 Step 4 not yet applied',
       CASE WHEN to_regclass('public.practice_session_feedback') IS NULL
            THEN 'practice_session_feedback absent, as expected'
            ELSE 'ALREADY EXISTS' END,
       CASE WHEN to_regclass('public.practice_session_feedback') IS NULL
            THEN 'PASS' ELSE 'INFO already applied' END

UNION ALL
-- Step 4 adds a notification type; confirm the current CHECK list so
-- the migration can re-list every existing value without dropping one.
SELECT 9, 'E9 notification types',
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.notifications'::regclass
           AND conname = 'notifications_type_check'),
       'INFO'
)
SELECT check_name, found, status FROM checks ORDER BY ord;
