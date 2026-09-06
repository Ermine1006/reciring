-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — the decline cooldown becomes one-directional and 14 days
--
-- WHY THE COOLDOWN EXISTS AT ALL (unchanged): declining is silent and
-- anonymous, so the person who declined can never say "no thanks".
-- Without a cooldown the same invitation could arrive again and
-- again, and the only way out would be to block someone. The
-- cooldown is what makes a silent no actually hold.
--
-- WHAT IS WRONG WITH IT TODAY:
--   1. It is SYMMETRIC. The rule matches on user_lo/user_hi with no
--      direction, so the person who DECLINED is locked out too. If
--      they change their mind next week they cannot see or invite
--      the other member either. That protects nobody; it only
--      penalises the person who made the decision.
--   2. Thirty days is out of proportion. An invitation itself
--      expires in 14 days, so one decline costs more than two full
--      invitation lifetimes. In a pool with a handful of active
--      members that removes a pair for a month.
--
-- WHAT THIS CHANGES: only the two cooldown predicates.
--   • one-directional — `AND p.requester_user_id = auth.uid()`, so
--     only the member whose invitation was declined waits;
--   • 14 days instead of 30, matching practice_pairings.expires_at.
--
-- What it deliberately does NOT change: declining stays silent and
-- anonymous; blocks still hide both directions unconditionally; live
-- 'invited'/'accepted' pairings still hide the pair symmetrically;
-- 'withdrawn' and 'expired' still carry no cooldown at all.
--
-- No schema change. No data change. Two function bodies, replaced
-- with the CURRENT live definitions (from
-- migration-practice-slot-invites.sql) plus those two predicates, so
-- nothing else is silently reverted. Signatures are unchanged, so no
-- DROP is needed and no overload can appear.
--
-- Idempotent: re-running is a no-op. Rollback at the bottom.
-- Assertions: scripts/practice-assertions-cooldown.sql
-- ============================================================


-- ── 0. PRE-FLIGHT — confirm the base before replacing anything ───
-- Both functions must currently carry the 30-day symmetric rule. If
-- they do not, something newer is live and this file must be rebased
-- onto it first.
DO $preflight$
DECLARE b text; s text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO b FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'browse_practice_requests';
  SELECT pg_get_functiondef(oid) INTO s FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'send_practice_invitation';

  IF b IS NULL OR s IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT: one of the functions is missing; run the earlier practice migrations first';
  END IF;
  IF b NOT LIKE '%interval ''30 days''%' THEN
    RAISE WARNING 'PRE-FLIGHT: browse_practice_requests does not carry the 30-day rule. Either this migration already ran, or something newer is live — check before continuing.';
  END IF;
  IF b NOT LIKE '%''id'', w.id%' THEN
    RAISE EXCEPTION 'PRE-FLIGHT: browse_practice_requests is older than the slot-invites version (no window ids). Rebase this file first.';
  END IF;
  IF s NOT LIKE '%p_window_id%' THEN
    RAISE EXCEPTION 'PRE-FLIGHT: send_practice_invitation is the 1-argument version. Run migration-practice-slot-invites.sql first.';
  END IF;
END $preflight$;


-- ── 1. browse: the declined requester waits, the decliner does not ─
CREATE OR REPLACE FUNCTION public.browse_practice_requests(p_community_id uuid)
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
  mutual_fit       boolean
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
             AND my.status = 'active')                             AS mutual_fit
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


-- ── 2. send: same rule, so browse and invite cannot disagree ─────
-- Signature unchanged (uuid, uuid), so no DROP and no new overload.
CREATE OR REPLACE FUNCTION public.send_practice_invitation(
  p_request_id uuid,
  p_window_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target  public.practice_requests%ROWTYPE;
  v_mine    public.practice_requests%ROWTYPE;
  v_window  public.practice_availability_windows%ROWTYPE;
  v_pairing public.practice_pairings%ROWTYPE;
  v_req_snap jsonb; v_adr_snap jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_target FROM public.practice_requests
   WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'active' THEN
    RAISE EXCEPTION 'request_unavailable';
  END IF;
  IF v_target.user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;

  IF NOT public.practice_is_community_eligible(auth.uid(), v_target.community_id)
     OR NOT public.practice_is_community_eligible(v_target.user_id, v_target.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  -- Reciprocity basis: the caller's own ACTIVE request in the SAME
  -- community. NOTE: only the request (types) is required — the
  -- caller's own availability windows are NOT consulted here.
  SELECT * INTO v_mine FROM public.practice_requests
   WHERE user_id = auth.uid() AND community_id = v_target.community_id
     AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'own_request_required'; END IF;

  -- Reciprocal practice FIT = types only, both directions.
  IF NOT ((v_target.help_types && v_mine.want_types)
      AND (v_mine.help_types && v_target.want_types)) THEN
    RAISE EXCEPTION 'no_mutual_fit';
  END IF;

  IF EXISTS (SELECT 1 FROM public.blocks b
              WHERE (b.blocker_id = auth.uid()        AND b.blocked_user_id = v_target.user_id)
                 OR (b.blocker_id = v_target.user_id  AND b.blocked_user_id = auth.uid())) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  IF EXISTS (SELECT 1 FROM public.practice_pairings p
              WHERE p.community_id = v_target.community_id
                AND p.user_lo = LEAST(auth.uid(), v_target.user_id)
                AND p.user_hi = GREATEST(auth.uid(), v_target.user_id)
                AND p.status = 'declined'
                AND p.declined_at > now() - interval '14 days'
                -- one-directional: only the declined requester waits
                AND p.requester_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'already_invited';
  END IF;

  -- Optional slot binding: must be one of the TARGET's own windows,
  -- still in the future, and not already booked by a live session.
  IF p_window_id IS NOT NULL THEN
    SELECT * INTO v_window FROM public.practice_availability_windows
     WHERE id = p_window_id AND request_id = p_request_id;
    IF NOT FOUND OR v_window.starts_at <= now() THEN
      RAISE EXCEPTION 'invalid_slot';
    END IF;
    IF EXISTS (SELECT 1 FROM public.practice_sessions s
                WHERE s.source_window_id = p_window_id
                  AND s.status IN ('proposed','scheduled','completed_pending_confirmation','disputed')) THEN
      RAISE EXCEPTION 'slot_taken';
    END IF;
  END IF;

  v_req_snap := jsonb_build_object(
    'community_id', v_mine.community_id,
    'want_types',  to_jsonb(v_mine.want_types),  'want_focus',  v_mine.want_focus,
    'help_types',  to_jsonb(v_mine.help_types),  'help_focus',  v_mine.help_focus,
    'help_context', v_mine.help_context,
    'location_type', v_mine.location_type,
    'duration_minutes', v_mine.duration_minutes, 'timezone', v_mine.timezone,
    'snapshot_at', now(), 'source_request_id', v_mine.id);
  v_adr_snap := jsonb_build_object(
    'community_id', v_target.community_id,
    'want_types',  to_jsonb(v_target.want_types), 'want_focus',  v_target.want_focus,
    'help_types',  to_jsonb(v_target.help_types), 'help_focus',  v_target.help_focus,
    'help_context', v_target.help_context,
    'location_type', v_target.location_type,
    'duration_minutes', v_target.duration_minutes, 'timezone', v_target.timezone,
    'snapshot_at', now(), 'source_request_id', v_target.id);

  BEGIN
    INSERT INTO public.practice_pairings
           (community_id, requester_user_id, addressee_user_id,
            requester_snapshot, addressee_snapshot,
            proposed_window_id, proposed_starts_at, proposed_ends_at, proposed_timezone)
    VALUES (v_target.community_id, auth.uid(), v_target.user_id,
            v_req_snap, v_adr_snap,
            v_window.id, v_window.starts_at, v_window.ends_at,
            CASE WHEN p_window_id IS NULL THEN NULL ELSE v_target.timezone END)
    RETURNING * INTO v_pairing;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_invited';
  END;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_target.user_id, 'practice_invitation',
          'New practice invitation',
          CASE WHEN p_window_id IS NULL
               THEN 'A member of your community wants to practise with you'
               ELSE 'A member of your community can make one of your practice times' END,
          jsonb_build_object('pairing_id', v_pairing.id,
                             'community_id', v_pairing.community_id));

  RETURN jsonb_build_object(
    'id', v_pairing.id, 'community_id', v_pairing.community_id,
    'status', v_pairing.status, 'invited_at', v_pairing.invited_at,
    'expires_at', v_pairing.expires_at,
    'proposed_starts_at', v_pairing.proposed_starts_at,
    'proposed_ends_at', v_pairing.proposed_ends_at,
    'their_snapshot', v_pairing.addressee_snapshot,
    'my_snapshot',    v_pairing.requester_snapshot);
END $$;


REVOKE ALL ON FUNCTION public.send_practice_invitation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_practice_invitation(uuid, uuid) TO authenticated;


-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- Re-run the browse_practice_requests and send_practice_invitation
-- sections of scripts/migration-practice-slot-invites.sql verbatim.
-- That restores the symmetric 30-day rule exactly. No data has to be
-- touched: this migration writes none.
--
-- Do NOT roll back by re-running migration-practice-reciprocal.sql —
-- it carries the ONE-argument send_practice_invitation and a browse
-- without window ids, and would take the pool backwards.
-- ============================================================
