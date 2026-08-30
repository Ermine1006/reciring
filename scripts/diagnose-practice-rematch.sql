-- ============================================================
-- Mutu — why can two members not see each other in Together?
--
-- READ ONLY. Nothing here writes, updates or deletes. Safe to run
-- in the Supabase SQL Editor.
--
-- Edit the two emails on the first line, then run the whole file.
-- ============================================================

WITH pair AS (
  SELECT p.id, p.name, p.email
    FROM public.profiles p
   WHERE lower(p.email) IN ('xiaoling.lyu@rotman.utoronto.ca',
                            'xiaoling.lyu@mail.utoronto.ca')
),
two AS (
  -- Postgres has no min(uuid)/max(uuid) aggregate, so order the two
  -- rows against each other instead. a.id < b.id gives exactly the
  -- same u_lo / u_hi that practice_pairings stores.
  SELECT a.id AS u_lo, b.id AS u_hi
    FROM pair a JOIN pair b ON a.id < b.id
)

-- ── A. Is each of them actually in the pool right now? ───────────
-- 'active' in the SAME community is what puts someone in the pool.
-- want_types / help_types are what make the fit reciprocal.
SELECT 'A. request' AS check,
       pr.name, pr.email,
       r.community_id::text,
       r.status,
       r.want_types::text,
       r.help_types::text,
       r.updated_at::text AS detail
  FROM pair pr
  LEFT JOIN public.practice_requests r ON r.user_id = pr.id

UNION ALL

-- ── B. Is there a pairing between them that hides them? ──────────
-- browse_practice_requests hides the pair while the pairing is
-- 'invited' or 'accepted', and for 30 days after 'declined'.
-- 'ended' / 'withdrawn' / 'expired' do NOT hide anyone.
SELECT 'B. pairing' AS check,
       (SELECT string_agg(name, ' + ') FROM pair),
       NULL,
       p.community_id::text,
       p.status,
       CASE
         WHEN p.status IN ('invited','accepted')                     THEN 'HIDDEN: live pairing'
         WHEN p.status = 'declined'
          AND p.declined_at > now() - interval '30 days'             THEN 'HIDDEN: declined cooldown'
         ELSE 'not hiding them'
       END,
       NULL,
       concat_ws(' · ',
         'invited ' || p.invited_at::date,
         'accepted ' || p.accepted_at::date,
         'declined ' || p.declined_at::date,
         'ended ' || p.ended_at::date) AS detail
  FROM public.practice_pairings p, two
 WHERE p.user_lo = two.u_lo AND p.user_hi = two.u_hi

UNION ALL

-- ── C. Has either one blocked the other? ─────────────────────────
SELECT 'C. block' AS check,
       (SELECT name FROM pair WHERE id = b.blocker_id),
       NULL, NULL, 'blocked',
       'HIDDEN: block in place', NULL,
       b.created_at::text
  FROM public.blocks b, two
 WHERE (b.blocker_id = two.u_lo AND b.blocked_user_id = two.u_hi)
    OR (b.blocker_id = two.u_hi AND b.blocked_user_id = two.u_lo)

UNION ALL

-- ── D. Is each account eligible in the community at all? ─────────
-- browse_practice_requests calls practice_is_community_eligible on
-- BOTH sides: profiles.access_status must be 'active' AND there must
-- be a community_members row with status 'member'. Two accounts on
-- different university domains can easily end up in two different
-- communities, or one of them in none.
SELECT 'D. eligibility' AS check,
       pr.name, pr.email,
       cm.community_id::text,
       coalesce(cm.status, 'NO MEMBERSHIP ROW'),
       CASE
         WHEN p.access_status <> 'active'  THEN 'HIDDEN: access_status = ' || p.access_status
         WHEN cm.status IS NULL            THEN 'HIDDEN: not a member of any community'
         WHEN cm.status <> 'member'        THEN 'HIDDEN: membership status ' || cm.status
         ELSE 'eligible'
       END,
       NULL,
       p.access_status AS detail
  FROM pair pr
  JOIN public.profiles p ON p.id = pr.id
  LEFT JOIN public.community_members cm ON cm.user_id = pr.id

ORDER BY 1;

-- ============================================================
-- Reading the result
--
--  FIRST: section A must show TWO different people. If it shows one
--    row, the other email is not in profiles at all (that account
--    registered under a different address), and B and C will be
--    empty for that reason alone, not because nothing is blocking.
--
--  A shows two rows with the SAME community_id and status
--    'active', and their types overlap in BOTH directions
--    (her want_types ∩ his help_types, and the reverse)
--       → the pool is fine, look at B.
--
--  B shows status 'accepted'  → this is the usual answer. They are
--    still partners, so Together does not offer them to each other
--    again. Either of them opens the partnership, taps ⋯ →
--    "Leave partnership" → "Yes, leave", and they reappear to each
--    other immediately. (This needs migration-practice-end-pairing.sql
--    to be live; check with:
--       select 1 from pg_proc where proname = 'end_practice_pairing';)
--
--  B shows 'declined' inside 30 days → deliberate cooldown; it
--    clears on its own.
--
--  D shows two DIFFERENT community_id values, or one account with
--    no membership row → they are not in the same pool at all, and
--    no pairing change will help. This is the one to check first
--    when the two accounts sit on different email domains.
--
--  B returns no row at all and A and D both look healthy → the block
--    is the type fit, not the pairing: the app only lists partners
--    whose want/help types overlap both ways. One of them changed
--    what they want to practise or what they can help with.
-- ============================================================
