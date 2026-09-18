-- READ-ONLY, round 3. Same checks as rounds 1 and 2, but for the account
-- Serine actually uses on the phone: xiaoling.lyu@mail.utoronto.ca
-- (rounds 1 and 2 looked at erminelyu@..., a different account).
--
-- Run ALL lines together in the Supabase SQL Editor. For this one query
-- it acts as Serine's signed-in account, exactly like her phone, then
-- the settings reset automatically. Nothing is written.

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id FROM auth.users WHERE lower(email) = 'xiaoling.lyu@mail.utoronto.ca'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT
  auth.uid() IS NOT NULL                                                 AS account_found,
  (SELECT access_status FROM public.profiles WHERE id = auth.uid())      AS serine_access,
  (SELECT count(*) FROM public.posts)                                    AS posts_serine_receives,
  EXISTS (SELECT 1 FROM public.posts
          WHERE id = '5fea5007-c21d-44bf-be6b-8a9f530b6353')             AS receives_macies_post,
  (SELECT interaction_type FROM public.post_interactions
    WHERE user_id = auth.uid()
      AND post_id = '5fea5007-c21d-44bf-be6b-8a9f530b6353')              AS serine_interaction,
  (SELECT string_agg(status, ',') FROM public.matches
    WHERE post_id = '5fea5007-c21d-44bf-be6b-8a9f530b6353'
      AND auth.uid() IN (requester_user_id, helper_user_id))             AS serine_match_status,
  EXISTS (SELECT 1 FROM public.blocks b
          JOIN public.posts p ON p.created_by = b.blocked_user_id
          WHERE b.blocker_id = auth.uid()
            AND p.id = '5fea5007-c21d-44bf-be6b-8a9f530b6353')           AS serine_blocked_macie;
