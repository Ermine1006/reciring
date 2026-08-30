-- ============================================================
-- Mutu — repair notifications delivered while the copy was reverted
--
-- Context: the old migration-practice-feedback.sql overwrote
-- submit_practice_confirmation and put the pre-Together wording
-- back. Any notification that RPC created between then and the
-- re-run of the corrected file carries the old strings.
--
-- STEP 1 is read only: run it first and look at the counts.
-- STEP 2 is the update, and is commented out on purpose. Only
-- uncomment it if STEP 1 shows a non-zero count.
--
-- DO NOT re-run migration-practice-together-copy.sql to fix this.
-- That file still carries the FIVE-argument
-- submit_practice_confirmation. Running it now would create a
-- second overload beside the live seven-argument version, and
-- every confirmation call in the app would fail with
-- "function is not unique".
-- ============================================================

-- ── STEP 1 · how many rows are affected (READ ONLY) ─────────────
SELECT type,
       title,
       count(*) AS rows,
       min(created_at) AS first_seen,
       max(created_at) AS last_seen
  FROM public.notifications
 WHERE title = 'Practice exchange verified'
    OR body  = 'Confirm your side to verify the exchange'
    OR body  = 'Both of you confirmed, and you earned a shared exchange token'
 GROUP BY type, title
 ORDER BY 3 DESC;

-- Expected after a short exposure window: zero rows, or a handful.


-- ── STEP 2 · bring those rows in line (WRITES — commented out) ──
-- Uncomment only if STEP 1 returned rows. Mirrors exactly what
-- migration-practice-together-copy.sql did to the rows it found.
--
-- UPDATE public.notifications
--    SET title = 'Session verified'
--  WHERE title = 'Practice exchange verified';
--
-- UPDATE public.notifications
--    SET body = 'Confirm your side to verify the session'
--  WHERE body = 'Confirm your side to verify the exchange';
--
-- UPDATE public.notifications
--    SET body = 'You both confirmed! You unlocked a shared Mutu Token'
--  WHERE body = 'Both of you confirmed, and you earned a shared exchange token';
--
-- Then re-run STEP 1: it should return zero rows.
-- ============================================================
