-- READ-ONLY, round 2. Why can't Serine see Macie's post
-- 5fea5007-c21d-44bf-be6b-8a9f530b6353?
-- Round 1 proved the app's own hiding rules (passed, connected,
-- expired, blocked) do not apply. Remaining suspects: the database's
-- access rules on posts, or the check looked at the wrong Serine account.
--
-- Run ONE query at a time in the Supabase SQL Editor (the editor only
-- shows the last result). Nothing here writes data.


-- ── Q1 · Every account that could be "Serine" ────────────────────
-- Which one does Serine sign in with on the phone? Round 1 picked one
-- at random (LIMIT 1).
SELECT p.id, p.name, u.email, p.access_status, p.created_at,
       (SELECT i.interaction_type FROM public.post_interactions i
         WHERE i.user_id = p.id AND i.post_id = '5fea5007-c21d-44bf-be6b-8a9f530b6353') AS interaction_with_macie_post,
       (SELECT string_agg(x.status, ',') FROM public.matches x
         WHERE x.post_id = '5fea5007-c21d-44bf-be6b-8a9f530b6353'
           AND p.id IN (x.requester_user_id, x.helper_user_id))            AS match_status_on_post
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.name ILIKE '%serine%' OR u.email ILIKE 'erminelyu@%' OR u.email ILIKE '%serine%'
ORDER BY p.created_at;


-- ── Q2 · The database's read rules for posts ─────────────────────
SELECT policyname, cmd, roles, qual AS who_can_read
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'posts'
ORDER BY cmd, policyname;


-- ── Q3 · Look at posts exactly as Serine's phone does ────────────
-- Temporarily acts as Serine's signed-in account for this one query
-- only (settings reset automatically when it finishes).
-- If Q1 shows more than one Serine, replace the email below with the
-- one she uses on the phone. Run all three lines together.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id FROM auth.users WHERE email ILIKE 'erminelyu@%' LIMIT 1),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT count(*)                                                         AS posts_serine_receives,
       bool_or(id = '5fea5007-c21d-44bf-be6b-8a9f530b6353')             AS receives_macies_post,
       count(*) FILTER (WHERE created_by = (SELECT id FROM public.profiles WHERE name ILIKE '%macie%' LIMIT 1)) AS macie_posts_received
FROM public.posts;
