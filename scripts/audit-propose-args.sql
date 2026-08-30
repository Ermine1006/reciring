-- ============================================================
-- Mutu — does the live RPC accept exactly the arguments the app
-- sends? READ ONLY.
--
-- The post-migration audit checked the ARITY of
-- propose_practice_session. PostgREST resolves the function by
-- ARGUMENT NAME, so a rename would only surface when a real user
-- tries to schedule. This compares the live signature against the
-- twelve names src/lib/practice.js actually sends.
-- ============================================================

WITH live AS (
  SELECT unnest(p.proargnames) AS arg
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'propose_practice_session'
),
sent AS (
  SELECT unnest(ARRAY[
    'p_pairing_id','p_scheduled_start','p_duration_minutes','p_timezone',
    'p_location_type','p_location_detail',
    'p_session_mode','p_interview_category','p_skill_focus',
    'p_meeting_method','p_meeting_url','p_meeting_location'
  ]) AS arg
)
SELECT coalesce(sent.arg, live.arg) AS argument,
       CASE WHEN sent.arg IS NULL  THEN 'in the database, never sent by the app'
            WHEN live.arg IS NULL  THEN 'SENT BY THE APP, MISSING IN THE DATABASE'
            ELSE 'matched' END     AS state,
       CASE WHEN sent.arg IS NOT NULL AND live.arg IS NULL THEN 'FAIL'
            WHEN sent.arg IS NULL AND live.arg IS NOT NULL THEN 'INFO'
            ELSE 'PASS' END        AS status
  FROM sent FULL OUTER JOIN live ON live.arg = sent.arg
 ORDER BY 3 DESC, 1;

-- Expected: twelve rows, all PASS. Any FAIL means scheduling is
-- broken in production right now.
