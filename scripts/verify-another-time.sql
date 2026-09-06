-- ============================================================
-- Mutu — READ ONLY. Checks the "yes, but another time" function,
-- confirms the existing acceptance was left alone, and reports one
-- SEPARATE finding about notification wording (W4).
--
-- Writes nothing. Safe to run before or after the migration.
-- ============================================================

WITH nu AS (
  SELECT p.oid, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'accept_practice_pairing_without_slot'
),
old AS (
  SELECT p.oid, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'accept_practice_pairing'
)

SELECT 'W1 new function' AS check_name,
       CASE WHEN (SELECT count(*) FROM nu) = 1 THEN 'PASS' ELSE 'NOT MIGRATED' END AS result,
       'accept_practice_pairing_without_slot(uuid) exists' AS detail

UNION ALL
SELECT 'W2 grants',
       CASE WHEN (SELECT count(*) FROM nu) <> 1 THEN 'n/a'
            WHEN (SELECT has_function_privilege('authenticated', oid, 'EXECUTE') FROM nu)
             AND NOT (SELECT has_function_privilege('anon', oid, 'EXECUTE') FROM nu)
             AND NOT (SELECT has_function_privilege('public', oid, 'EXECUTE') FROM nu)
            THEN 'PASS' ELSE 'FAIL' END,
       'authenticated may execute; anon and PUBLIC may not'

UNION ALL
-- The whole point of the wrapper is that it did not touch this one.
SELECT 'W3 accept untouched',
       CASE WHEN (SELECT def FROM old) LIKE '%proposed\_starts\_at IS NOT NULL%'
             AND (SELECT def FROM old) LIKE '%slot\_taken%'
            THEN 'PASS' ELSE 'CHANGED' END,
       'accept_practice_pairing still books a slot-bound invitation itself'

UNION ALL
-- ── SEPARATE FINDING, not part of this migration ──────────────
-- scripts/migration-practice-notification-copy.sql set this line to
-- "Your invitation was accepted! ...". A later CREATE OR REPLACE in
-- migration-practice-slot-invites.sql rewrote the same function and
-- carried the older wording back in, dashes included. If this reads
-- REVERTED, that copy fix is currently undone in the live database.
SELECT 'W4 copy finding',
       CASE WHEN (SELECT def FROM old) LIKE '%Your invitation was accepted!%'
            THEN 'copy fix is live'
            WHEN (SELECT def FROM old) LIKE '%Your practice invitation was accepted —%'
            THEN 'REVERTED'
            ELSE 'UNRECOGNISED, read it by hand' END,
       'accept_practice_pairing notification body: notification-copy vs slot-invites wording'

UNION ALL
SELECT 'W5 read the body',
       'READ',
       left(coalesce((SELECT def FROM old), 'accept_practice_pairing is missing'), 60) || ' ...';
