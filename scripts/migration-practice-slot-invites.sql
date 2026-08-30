-- ============================================================
-- Mutu — Practice · Slot-bound invitations (additive migration)
--
-- Founder decision 2026-08-26 (post-pilot-build revision):
-- Reciprocal practice FIT is about types only. Lack of overlapping
-- availability must never disqualify a match — it only changes the
-- invite CTA. A user may invite by committing to ONE of the
-- partner's availability slots ("I can make this time"):
--   • the invitation is bound to that exact slot (immutable snapshot);
--   • identities still reveal ONLY when the addressee accepts;
--   • acceptance books the slot as a SCHEDULED session directly
--     (the one-time explicit acceptance IS the mutual time consent);
--   • the same slot can never be booked by two live sessions
--     (partial unique index + clean 'slot_taken' error).
--
-- Additive only: 4 new pairing columns, 1 new session column,
-- 1 index, 2 function updates, 1 view update. Idempotent.
-- Run AFTER migration-practice-reciprocal.sql, manually, in the
-- Supabase SQL Editor. Rollback at the bottom.
-- ============================================================


-- ── 1. practice_pairings: the bound slot (immutable snapshot) ─
ALTER TABLE public.practice_pairings
  ADD COLUMN IF NOT EXISTS proposed_window_id uuid
    REFERENCES public.practice_availability_windows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_ends_at   timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_timezone  text;

-- ── 2. practice_sessions: which slot a session was booked from ─
ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS source_window_id uuid
    REFERENCES public.practice_availability_windows(id) ON DELETE SET NULL;

-- One slot → at most one LIVE session, ever.
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_slot
  ON public.practice_sessions (source_window_id)
  WHERE source_window_id IS NOT NULL
    AND status IN ('proposed','scheduled','completed_pending_confirmation','disputed');


-- ── 3. Browse RPC: windows now carry their id (needed to bind an
--       invitation to a slot; a window uuid is not identity-bearing) ─
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
                             OR (p.status = 'declined'
                                 AND p.declined_at > now() - interval '30 days')));
$$;

REVOKE ALL ON FUNCTION public.browse_practice_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.browse_practice_requests(uuid) TO authenticated;


-- ── 4. send_practice_invitation: optional slot binding ────────
-- Signature change (extra defaulted param) — drop the old overload
-- first so PostgREST resolution stays unambiguous. Single-argument
-- calls keep working via the default.
DROP FUNCTION IF EXISTS public.send_practice_invitation(uuid);

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
                AND p.declined_at > now() - interval '30 days') THEN
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


-- ── 5. accept_practice_pairing: slot acceptance books the session ─
CREATE OR REPLACE FUNCTION public.accept_practice_pairing(p_pairing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_match_id uuid;
  v_session_id uuid;
  v_dur int;
  v_loc text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF v_pairing.addressee_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_addressee'; END IF;
  IF v_pairing.status <> 'invited' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF v_pairing.expires_at <= now() THEN RAISE EXCEPTION 'invitation_expired'; END IF;

  IF NOT public.practice_is_community_eligible(v_pairing.requester_user_id, v_pairing.community_id)
     OR NOT public.practice_is_community_eligible(v_pairing.addressee_user_id, v_pairing.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  -- One NEW Practice chat, born identity-revealed (contextual reveal).
  INSERT INTO public.matches
         (requester_user_id, helper_user_id, status, source,
          identity_reveal_status, identity_reveal_accepted_at)
  VALUES (v_pairing.requester_user_id, v_pairing.addressee_user_id,
          'active', 'practice', 'accepted', now())
  RETURNING id INTO v_match_id;

  UPDATE public.practice_pairings
     SET status = 'accepted', accepted_at = now(), match_id = v_match_id
   WHERE id = p_pairing_id;

  -- Slot-bound invitation: this one-time explicit acceptance IS the
  -- mutual time consent → book the slot as a SCHEDULED session now.
  -- (If the slot's start has passed while the invitation waited, fall
  -- back to a normal acceptance — the pair schedules in-app.)
  IF v_pairing.proposed_starts_at IS NOT NULL
     AND v_pairing.proposed_starts_at > now() THEN
    v_dur := LEAST(180, GREATEST(30,
               coalesce((v_pairing.addressee_snapshot->>'duration_minutes')::int, 60)));
    v_loc := CASE coalesce(v_pairing.addressee_snapshot->>'location_type', 'virtual')
               WHEN 'in_person' THEN 'in_person' ELSE 'virtual' END;
    BEGIN
      INSERT INTO public.practice_sessions
             (pairing_id, community_id,
              participant_a_user_id, participant_b_user_id, created_by_user_id,
              scheduled_start, duration_minutes, timezone,
              location_type, location_detail,
              status, confirmed_at, source_window_id)
      VALUES (v_pairing.id, v_pairing.community_id,
              v_pairing.requester_user_id, v_pairing.addressee_user_id,
              v_pairing.requester_user_id,           -- the inviter proposed this time
              v_pairing.proposed_starts_at, v_dur,
              coalesce(v_pairing.proposed_timezone, 'America/Toronto'),
              v_loc, '',
              'scheduled', now(),                    -- accepted = time confirmed
              v_pairing.proposed_window_id)
      RETURNING id INTO v_session_id;
    EXCEPTION WHEN unique_violation THEN
      -- uq_session_slot: this exact slot is already booked by another
      -- live session. The acceptance must not silently double-book.
      RAISE EXCEPTION 'slot_taken';
    END;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_pairing.requester_user_id, 'practice_invitation_accepted',
          'Practice invitation accepted',
          CASE WHEN v_session_id IS NULL
               THEN 'Your practice invitation was accepted — say hi and pick a time'
               ELSE 'Your practice invitation was accepted — your session time is booked' END,
          jsonb_build_object('pairing_id', p_pairing_id, 'match_id', v_match_id,
                             'session_id', v_session_id,
                             'community_id', v_pairing.community_id));

  RETURN jsonb_build_object('id', p_pairing_id, 'status', 'accepted',
                            'match_id', v_match_id, 'session_id', v_session_id,
                            'counterpart_user_id', v_pairing.requester_user_id,
                            'community_id', v_pairing.community_id);
END $$;

REVOKE ALL ON FUNCTION public.accept_practice_pairing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_practice_pairing(uuid) TO authenticated;


-- ── 6. my_practice_pairings: expose the proposed slot ─────────
-- (The proposed time is the ADDRESSEE's own published window — both
-- sides already knew it; no identity is carried.)
CREATE OR REPLACE VIEW public.my_practice_pairings
WITH (security_barrier = true) AS
SELECT p.id,
       p.community_id,
       p.status,
       p.invited_at, p.expires_at, p.accepted_at, p.declined_at,
       (p.requester_user_id = auth.uid())                             AS i_invited,
       CASE WHEN p.requester_user_id = auth.uid()
            THEN p.addressee_snapshot ELSE p.requester_snapshot END   AS their_snapshot,
       CASE WHEN p.requester_user_id = auth.uid()
            THEN p.requester_snapshot ELSE p.addressee_snapshot END   AS my_snapshot,
       CASE WHEN p.status = 'accepted'
            THEN CASE WHEN p.requester_user_id = auth.uid()
                      THEN p.addressee_user_id ELSE p.requester_user_id END
       END                                                            AS counterpart_user_id,
       CASE WHEN p.status = 'accepted' THEN p.match_id END            AS match_id,
       p.proposed_starts_at, p.proposed_ends_at, p.proposed_timezone
FROM public.practice_pairings p
WHERE auth.uid() IN (p.requester_user_id, p.addressee_user_id);

REVOKE ALL ON public.my_practice_pairings FROM PUBLIC, anon;
GRANT SELECT ON public.my_practice_pairings TO authenticated;


-- ============================================================
-- ROLLBACK (manual; restores the pre-slot behavior)
-- ============================================================
-- -- 1. Restore the one-argument invitation function by re-running
-- --    §10.1 of migration-practice-reciprocal.sql, after:
-- -- DROP FUNCTION IF EXISTS public.send_practice_invitation(uuid, uuid);
-- -- 2. Restore accept_practice_pairing and my_practice_pairings by
-- --    re-running §10.2 and the view section of that same file.
-- -- 3. Remove the additive columns/index (any booked sessions keep
-- --    working; they simply lose the slot linkage):
-- -- DROP INDEX IF EXISTS public.uq_session_slot;
-- -- ALTER TABLE public.practice_sessions DROP COLUMN IF EXISTS source_window_id;
-- -- ALTER TABLE public.practice_pairings
-- --   DROP COLUMN IF EXISTS proposed_window_id,
-- --   DROP COLUMN IF EXISTS proposed_starts_at,
-- --   DROP COLUMN IF EXISTS proposed_ends_at,
-- --   DROP COLUMN IF EXISTS proposed_timezone;
-- ============================================================
