-- ============================================================
-- Mutu — Practice/Exchange · End an accepted partnership
--
-- Product decision 2026-08-27: an ACCEPTED pairing needs an exit.
-- Either participant may end it (the conversation about it happens
-- in chat; the button just executes politely):
--   • pairing → 'ended' (ended_at / ended_by recorded);
--   • any live proposed/scheduled session is cancelled;
--   • a session already awaiting confirmations is LEFT ALONE, so an
--     honestly-completed exchange can still verify and mint;
--   • the other person gets a notification;
--   • verified tokens, history, and the chat all remain;
--   • the pair becomes visible to each other in browse again
--     immediately (identities were already mutual; no cooldown).
--
-- Additive + idempotent. Run manually in the Supabase SQL Editor
-- AFTER the previous practice migrations. Rollback at the bottom.
-- ============================================================


-- ── 1. Allow the 'ended' status + audit columns ──────────────
ALTER TABLE public.practice_pairings
  DROP CONSTRAINT IF EXISTS practice_pairings_status_check;
ALTER TABLE public.practice_pairings
  ADD CONSTRAINT practice_pairings_status_check
  CHECK (status IN ('invited','accepted','declined','withdrawn','expired','ended'));

ALTER TABLE public.practice_pairings
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- (uq_pairing_live covers only invited/accepted, so an 'ended' row
-- automatically frees the pair for a fresh invitation. The browse
-- cooldown clause only matches 'declined', so ended pairs reappear
-- to each other immediately — both by design.)


-- ── 2. View: identity stays visible on an ended pairing ──────
-- Identities were mutually revealed while accepted; hiding them
-- retroactively would be strange. The chat link also remains.
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
       CASE WHEN p.status IN ('accepted','ended')
            THEN CASE WHEN p.requester_user_id = auth.uid()
                      THEN p.addressee_user_id ELSE p.requester_user_id END
       END                                                            AS counterpart_user_id,
       CASE WHEN p.status IN ('accepted','ended') THEN p.match_id END AS match_id,
       p.proposed_starts_at, p.proposed_ends_at, p.proposed_timezone,
       -- new columns must sit at the END (CREATE OR REPLACE VIEW rule)
       p.ended_at, p.ended_by
FROM public.practice_pairings p
WHERE auth.uid() IN (p.requester_user_id, p.addressee_user_id);

REVOKE ALL ON public.my_practice_pairings FROM PUBLIC, anon;
GRANT SELECT ON public.my_practice_pairings TO authenticated;


-- ── 3. The RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.end_practice_pairing(p_pairing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_other uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF auth.uid() NOT IN (v_pairing.requester_user_id, v_pairing.addressee_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_pairing.status <> 'accepted' THEN RAISE EXCEPTION 'invalid_state'; END IF;

  -- Cancel a live proposal/scheduled session. A session that is
  -- already awaiting confirmations is deliberately untouched.
  UPDATE public.practice_sessions
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = 'partnership_ended'
   WHERE pairing_id = p_pairing_id
     AND status IN ('proposed','scheduled');

  UPDATE public.practice_pairings
     SET status = 'ended', ended_at = now(), ended_by = auth.uid()
   WHERE id = p_pairing_id;

  v_other := CASE WHEN auth.uid() = v_pairing.requester_user_id
                  THEN v_pairing.addressee_user_id ELSE v_pairing.requester_user_id END;
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_other, 'practice_partnership_ended',
          'Partnership ended',
          'Your exchange partner ended your partnership. Your verified history and chat are safe, and you can match again anytime.',
          jsonb_build_object('pairing_id', p_pairing_id,
                             'community_id', v_pairing.community_id));

  RETURN jsonb_build_object('id', p_pairing_id, 'status', 'ended');
END $$;

REVOKE ALL ON FUNCTION public.end_practice_pairing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_practice_pairing(uuid) TO authenticated;


-- ── 4. notifications CHECK: re-list EVERYTHING + the new type ─
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      -- pre-practice values (do not remove any):
      'new_match','new_message','feedback_request','meeting_confirmed',
      'review_received','event_cancelled','event_joined','event_message',
      'event_below_min','marketplace_interest',
      -- practice values:
      'practice_invitation','practice_invitation_accepted',
      'practice_session_proposed','practice_session_scheduled',
      'practice_session_cancelled','practice_partner_confirmed',
      'practice_session_verified',
      -- new:
      'practice_partnership_ended'
    ));


-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.end_practice_pairing(uuid);
-- -- Restore the view + notifications CHECK by re-running the
-- -- corresponding sections of migration-practice-slot-invites.sql
-- -- (view) and the 17-value CHECK from that era.
-- -- Ended rows keep their status; to fully revert the CHECK you
-- -- must first: UPDATE practice_pairings SET status='withdrawn'
-- -- WHERE status='ended';  then drop columns:
-- -- ALTER TABLE public.practice_pairings
-- --   DROP COLUMN IF EXISTS ended_at, DROP COLUMN IF EXISTS ended_by;
-- ============================================================
