-- READ-ONLY. Why can't Serine see Macie's Give & Ask post?
-- Run in the Supabase SQL Editor. Changes nothing.
-- One row per post Macie has published, with every reason the app
-- would hide it from Serine's deck. All "hidden_*" false and
-- visible_in_app = true means the only cause was the stale feed
-- (posts loaded once per app launch), which the app fix addresses.

WITH serine AS (
  SELECT id FROM public.profiles
  WHERE name ILIKE '%serine%' OR email ILIKE 'erminelyu@%'
  LIMIT 1
), macie AS (
  SELECT id, name, email, access_status FROM public.profiles
  WHERE name ILIKE '%macie%' OR email ILIKE '%macie%'
)
SELECT
  m.name                     AS macie_name,
  m.access_status            AS macie_access,
  p.id                       AS post_id,
  p.created_at,
  left(p.need_text, 60)      AS need_preview,
  p.expires_at,
  (p.expires_at IS NOT NULL AND p.expires_at < now())                 AS hidden_expired,
  EXISTS (SELECT 1 FROM public.post_interactions i
          WHERE i.post_id = p.id AND i.user_id = s.id
            AND i.interaction_type = 'swiped_left')                   AS hidden_passed_by_serine,
  EXISTS (SELECT 1 FROM public.matches x
          WHERE x.post_id = p.id AND x.status = 'active'
            AND s.id IN (x.requester_user_id, x.helper_user_id))      AS hidden_already_connected,
  EXISTS (SELECT 1 FROM public.blocks b
          WHERE b.blocker_id = s.id AND b.blocked_user_id = m.id)     AS hidden_serine_blocked_macie
FROM macie m
CROSS JOIN serine s
LEFT JOIN public.posts p ON p.created_by = m.id
ORDER BY p.created_at DESC NULLS LAST;
