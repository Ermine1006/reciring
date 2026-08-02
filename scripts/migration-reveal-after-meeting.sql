-- ReciRing / Mutu — Reveal identity for people you actually met
--
-- The anonymous-until-mutually-accepted model is for people you HAVEN'T met
-- (Discover). Once you've recorded meeting someone (an event_encounters row
-- linking to their profile), messaging them shouldn't be anonymous — you know
-- who they are. This adds a SECURITY DEFINER RPC that flips a match to
-- 'accepted' ONLY when the caller has a recorded encounter with the peer, plus
-- a guard-trigger exemption so that specific path is allowed.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- 1. Guard trigger — add a transaction-local exemption at the very top.
CREATE OR REPLACE FUNCTION public.guard_identity_reveal()
RETURNS trigger AS $$
BEGIN
  -- Exemption: reveal_match_after_meeting() sets this GUC before its update.
  IF current_setting('app.reveal_after_meeting', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.identity_reveal_status IS NOT DISTINCT FROM OLD.identity_reveal_status THEN
    RETURN NEW;
  END IF;

  IF OLD.identity_reveal_status = 'accepted' THEN
    RAISE EXCEPTION 'Identity reveal is already accepted and cannot be changed';
  END IF;

  IF NEW.identity_reveal_status = 'pending' THEN
    IF NEW.identity_reveal_requested_by IS NULL
       OR NEW.identity_reveal_requested_by <> auth.uid() THEN
      RAISE EXCEPTION 'identity_reveal_requested_by must match auth.uid()';
    END IF;
    IF NEW.identity_reveal_requested_by NOT IN (NEW.requester_user_id, NEW.helper_user_id) THEN
      RAISE EXCEPTION 'Only match participants can request reveal';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.identity_reveal_status IN ('accepted','declined') THEN
    IF OLD.identity_reveal_status <> 'pending' THEN
      RAISE EXCEPTION 'Can only accept/decline a pending reveal request';
    END IF;
    IF auth.uid() IS NULL OR auth.uid() = OLD.identity_reveal_requested_by THEN
      RAISE EXCEPTION 'The requester cannot respond to their own reveal request';
    END IF;
    IF auth.uid() NOT IN (NEW.requester_user_id, NEW.helper_user_id) THEN
      RAISE EXCEPTION 'Only match participants can respond';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.identity_reveal_status = 'none' THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. RPC: reveal a match because the caller recorded meeting the peer.
CREATE OR REPLACE FUNCTION public.reveal_match_after_meeting(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m    public.matches%ROWTYPE;
  peer uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id;
  IF m.id IS NULL THEN RETURN; END IF;
  IF auth.uid() NOT IN (m.requester_user_id, m.helper_user_id) THEN RETURN; END IF;

  peer := CASE WHEN auth.uid() = m.requester_user_id THEN m.helper_user_id ELSE m.requester_user_id END;

  -- Only if the caller actually recorded meeting this person.
  IF NOT EXISTS (
    SELECT 1 FROM public.event_encounters e
    WHERE e.user_id = auth.uid() AND e.encountered_user_id = peer
  ) THEN
    RETURN;
  END IF;

  IF m.identity_reveal_status IS DISTINCT FROM 'accepted' THEN
    PERFORM set_config('app.reveal_after_meeting', 'on', true);  -- txn-local
    UPDATE public.matches
       SET identity_reveal_status = 'accepted',
           identity_reveal_accepted_at = now()
     WHERE id = p_match_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_match_after_meeting(uuid) TO authenticated;
