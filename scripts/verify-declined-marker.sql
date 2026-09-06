-- ============================================================
-- Mutu — READ ONLY. Verifies the declined marker against the real
-- database and predicts exactly what each account will see.
--
-- Writes nothing. Impersonates nobody. Safe to run any number of
-- times. Run AFTER scripts/migration-practice-declined-marker.sql.
-- ============================================================

WITH me AS (
  SELECT ARRAY[
    'erminelyu@gmail.com',
    'xiaoling.lyu@mail.utoronto.ca',
    'xiaoling.lyu@rotman.utoronto.ca'
  ] AS emails
),
fn AS (
  SELECT p.oid, pg_get_functiondef(p.oid) AS def, p.prosecdef, p.provolatile
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'browse_practice_requests'
)

-- V1 — is the column actually live?
SELECT 'V1 contract' AS check_name,
       CASE WHEN (SELECT count(*) FROM fn) <> 1 THEN 'FAIL'
            WHEN (SELECT def FROM fn) LIKE '%previously_declined%' THEN 'PASS'
            ELSE 'NOT MIGRATED' END AS result,
       'browse_practice_requests returns previously_declined' AS detail

UNION ALL
-- V2 — the drop and recreate did not lose the grants
SELECT 'V2 grants',
       CASE WHEN (SELECT has_function_privilege('authenticated', oid, 'EXECUTE') FROM fn)
             AND NOT (SELECT has_function_privilege('anon', oid, 'EXECUTE') FROM fn)
             AND NOT (SELECT has_function_privilege('public', oid, 'EXECUTE') FROM fn)
            THEN 'PASS' ELSE 'FAIL' END,
       'authenticated may execute; anon and PUBLIC may not'

UNION ALL
-- V3 — still runs as definer, still declared STABLE
SELECT 'V3 security',
       CASE WHEN (SELECT prosecdef AND provolatile = 's' FROM fn)
            THEN 'PASS' ELSE 'FAIL' END,
       'SECURITY DEFINER and STABLE survived the recreate'

UNION ALL
-- V4 — what these accounts will actually see, right now
SELECT 'V4 your accounts',
       'READ',
       coalesce(
         (SELECT string_agg(line, E'\n' ORDER BY line) FROM (
            SELECT format(
              '%s declined an invitation from %s on %s. %s. %s',
              ad.email, rq.email, p.declined_at::date,
              CASE WHEN rq.status_active
                   THEN format('%s will see a marked card for %s', ad.email, rq.email)
                   ELSE format('%s is not in the pool, so no card appears at all', rq.email) END,
              CASE WHEN p.declined_at > now() - interval '14 days'
                   THEN format('%s stays hidden from %s until %s',
                               ad.email, rq.email, (p.declined_at + interval '14 days')::date)
                   ELSE format('the cooldown is over, so %s can see %s again, unmarked',
                               rq.email, ad.email) END) AS line
              FROM public.practice_pairings p
              JOIN (SELECT pr.id, pr.email,
                           EXISTS (SELECT 1 FROM public.practice_requests r
                                    WHERE r.user_id = pr.id AND r.status = 'active') AS status_active
                      FROM public.profiles pr) rq ON rq.id = p.requester_user_id
              JOIN public.profiles ad ON ad.id = p.addressee_user_id
             WHERE p.status = 'declined'
               AND (rq.email = ANY(SELECT unnest(emails) FROM me)
                 OR ad.email = ANY(SELECT unnest(emails) FROM me))
          ) s),
         'no declined invitation exists between these accounts yet')

UNION ALL
-- V5 — the privacy rule, stated as a count over the whole table.
-- Nothing here can ever mark the person who WAS declined, because the
-- predicate keys on addressee_user_id = auth.uid(). This just confirms
-- the live body still says that.
SELECT 'V5 privacy',
       CASE WHEN (SELECT def FROM fn) LIKE '%d.addressee\_user\_id = auth.uid()%'
            THEN 'PASS' ELSE 'CHECK BY HAND' END,
       'the marker keys on the caller having been the ADDRESSEE, never the requester';
