-- READ-ONLY. Where is Serine's connection with Macie in Matches?
-- Acts as Serine's phone account (xiaoling.lyu@mail.utoronto.ca) for
-- this one query, like verify-give-ask-visibility-3.sql. Run ALL lines
-- together in the Supabase SQL Editor. Nothing is written.

SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id FROM auth.users WHERE lower(email) = 'xiaoling.lyu@mail.utoronto.ca'),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT
  m.id                                                   AS match_id,
  m.created_at                                           AS connected_at,
  m.status,
  m.source,
  CASE WHEN m.helper_user_id = auth.uid() THEN 'Serine is helping Macie'
       ELSE 'Serine asked, Macie helps' END             AS roles,
  m.identity_reveal_status                               AS name_reveal,
  (SELECT count(*) FROM public.exchange_confirmations c
    WHERE c.match_id = m.id)                             AS we_met_taps,      -- 2 = listed under Past, not Active
  (SELECT count(*) FROM public.messages x
    WHERE x.match_id = m.id)                             AS messages,
  (SELECT count(*) FROM public.matches a
    WHERE auth.uid() IN (a.requester_user_id, a.helper_user_id)
      AND a.status <> 'unmatched')                       AS serine_total_matches
FROM public.matches m
WHERE m.post_id = '5fea5007-c21d-44bf-be6b-8a9f530b6353'
  AND auth.uid() IN (m.requester_user_id, m.helper_user_id);
