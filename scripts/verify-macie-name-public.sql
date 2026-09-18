-- READ-ONLY. Will the new rule show Macie's name in Serine's Matches?
-- It will when name_will_show = true. Nothing is written.
SELECT
  pr.visibility                        AS macie_profile,       -- 'public' or 'private'
  p.is_anonymous                       AS post_marked_anonymous,
  CASE WHEN p.is_anonymous = false THEN true
       WHEN p.is_anonymous = true  THEN false
       ELSE pr.visibility = 'public' END AS name_will_show
FROM public.posts p
JOIN public.profiles pr ON pr.id = p.created_by
WHERE p.id = '5fea5007-c21d-44bf-be6b-8a9f530b6353';
