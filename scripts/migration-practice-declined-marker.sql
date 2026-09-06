-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — mark the pool card you already declined
--
-- WHY: the one-directional cooldown (migration-practice-cooldown.sql)
-- puts the person you declined back in your pool straight away, which
-- is right — you said no to one invitation, not to the member. But
-- the pool is anonymous, so you cannot tell which card that is, and
-- you can invite the very person you just turned down without
-- realising it.
--
-- WHAT THIS ADDS: one boolean on each browse row,
-- `previously_declined`, true when YOU declined an invitation from
-- that request's owner.
--
-- WHY IT LEAKS NOTHING: it reports the caller's OWN past action back
-- to them. No name, no id, no profile. The invitation they declined
-- was itself anonymous, so this adds no way to identify anyone; it
-- only says "this card is one you have already turned down".
--
-- ONE DIRECTION, ON PURPOSE. It is never set for the opposite case
-- ("you invited this member and they declined you"). That would point
-- at the anonymous member who rejected you, which is exactly the
-- social pressure the silent decline exists to prevent.
--
-- The output shape changes, so this function must be DROPPED and
-- recreated rather than replaced, and its grants re-applied. Nothing
-- else about it changes: the body is the current live one from
-- migration-practice-cooldown.sql plus that column.
--
-- No schema change. No data change. Idempotent. Rollback at the
-- bottom. Assertions: scripts/practice-assertions-declined-marker.sql
-- ============================================================


-- ── 0. PRE-FLIGHT — the cooldown migration must already be live ──
DO $preflight$
DECLARE b text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO b FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'browse_practice_requests';
  IF b IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT: browse_practice_requests is missing; run the earlier practice migrations first';
  END IF;
  IF b NOT LIKE '%requester_user_id = auth.uid()%' THEN
    RAISE EXCEPTION 'PRE-FLIGHT: run scripts/migration-practice-cooldown.sql first — this file builds on it';
  END IF;
  IF b LIKE '%previously_declined%' THEN
    RAISE NOTICE 'PRE-FLIGHT: already applied; re-running is a no-op.';
  END IF;
END $preflight$;


-- ── 1. Recreate browse with the marker ──────────────────────────
-- RETURNS TABLE gains a column, so CREATE OR REPLACE cannot be used.
DROP FUNCTION IF EXISTS public.browse_practice_requests(uuid);

CREATE FUNCTION public.browse_practice_requests(p_community_id uuid)
RETURNS TABLE (
  request_id       uuid,
  community_id     uuid,
  want_types       text[],
  want_focus       text,
  help_types       text[],
  help_focus       text,
  help_context     text,
  location_type    text,
  duration_minutes integer,
  timezone         text,
  windows          jsonb,
  mutual_fit       boolean,
  -- TRUE when the CALLER declined an invitation from this request's
  -- owner. One direction only, deliberately: see the header.
  previously_declined boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id,
         r.community_id,
         r.want_types, r.want_focus,
         r.help_types, r.help_focus, r.help_context,
         r.location_type, r.duration_minutes, r.timezone,
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'id', w.id,
                    'starts_at', w.starts_at, 'ends_at', w.ends_at)
                    ORDER BY w.starts_at), '[]'::jsonb)
            FROM public.practice_availability_windows w
           WHERE w.request_id = r.id AND w.ends_at > now())        AS windows,
         -- FIT IS TYPES-ONLY. Availability is never part of this flag.
         (SELECT (r.help_types && my.want_types) AND (my.help_types && r.want_types)
            FROM public.practice_requests my
           WHERE my.user_id = auth.uid()
             AND my.community_id = p_community_id
             AND my.status = 'active')                             AS mutual_fit,
         EXISTS (SELECT 1 FROM public.practice_pairings d
                  WHERE d.community_id = p_community_id
                    AND d.status = 'declined'
                    AND d.addressee_user_id = auth.uid()
                    AND d.requester_user_id = r.user_id)             AS previously_declined
    FROM public.practice_requests r
   WHERE r.community_id = p_community_id
     AND r.status = 'active'
     AND r.user_id <> auth.uid()
     AND public.practice_is_community_eligible(auth.uid(), p_community_id)
     AND public.practice_is_community_eligible(r.user_id, p_community_id)
     AND NOT EXISTS (SELECT 1 FROM public.blocks b
                      WHERE (b.blocker_id = auth.uid()  AND b.blocked_user_id = r.user_id)
                         OR (b.blocker_id = r.user_id   AND b.blocked_user_id = auth.uid()))
     AND NOT EXISTS (SELECT 1 FROM public.practice_pairings p
                      WHERE p.community_id = p_community_id
                        AND p.user_lo = LEAST(r.user_id, auth.uid())
                        AND p.user_hi = GREATEST(r.user_id, auth.uid())
                        AND (p.status IN ('invited','accepted')
                             -- COOLDOWN, one-directional and 14 days.
                             -- Only the person whose invitation was
                             -- declined waits. The person who declined
                             -- keeps full access: they said no to one
                             -- invitation, not to the member.
                             OR (p.status = 'declined'
                                 AND p.declined_at > now() - interval '14 days'
                                 AND p.requester_user_id = auth.uid())));
$$;


REVOKE ALL ON FUNCTION public.browse_practice_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.browse_practice_requests(uuid) TO authenticated;


-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.browse_practice_requests(uuid);
-- then re-run section 1 of scripts/migration-practice-cooldown.sql
-- (the browse function plus its REVOKE/GRANT). The client tolerates
-- the column being absent, so rolling back needs no app change.
-- ============================================================
