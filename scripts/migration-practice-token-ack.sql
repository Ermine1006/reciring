-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — Exchange Token · per-user reward acknowledgement
--
-- WHY THIS IS REQUIRED
-- The Token unlock moment currently appears only for the SECOND
-- confirmer (the one whose confirmation flips the session to
-- 'verified' in their own client). The FIRST confirmer learns about
-- it only via a notification. To show BOTH participants the reward
-- moment exactly once — across devices and sessions — the server
-- must remember, per participant, whether the moment was shown.
-- Local storage cannot do this reliably (multiple devices, cleared
-- storage, shared computers), so it needs two tiny columns + one RPC.
--
-- Additive + idempotent. No effect on minting, privacy, or any
-- existing invariant. Rollback at the bottom.
-- ============================================================

ALTER TABLE public.practice_exchange_tokens
  ADD COLUMN IF NOT EXISTS ack_lo_at timestamptz,   -- user_lo saw the reward moment
  ADD COLUMN IF NOT EXISTS ack_hi_at timestamptz;   -- user_hi saw the reward moment

-- Each participant may stamp ONLY their own side, once.
CREATE OR REPLACE FUNCTION public.acknowledge_exchange_token(p_token_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_t public.practice_exchange_tokens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_t FROM public.practice_exchange_tokens
   WHERE id = p_token_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'token_not_found'; END IF;
  IF auth.uid() NOT IN (v_t.user_lo, v_t.user_hi) THEN RAISE EXCEPTION 'not_participant'; END IF;

  IF auth.uid() = v_t.user_lo THEN
    UPDATE public.practice_exchange_tokens
       SET ack_lo_at = coalesce(ack_lo_at, now()) WHERE id = p_token_id;
  ELSE
    UPDATE public.practice_exchange_tokens
       SET ack_hi_at = coalesce(ack_hi_at, now()) WHERE id = p_token_id;
  END IF;
  RETURN jsonb_build_object('id', p_token_id, 'acknowledged', true);
END $$;

REVOKE ALL ON FUNCTION public.acknowledge_exchange_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_exchange_token(uuid) TO authenticated;

-- FRONTEND PLAN (after this runs): on Exchange load, look for my
-- tokens where MY side's ack column is null → show the unlock moment
-- once → call acknowledge_exchange_token(id). The second confirmer's
-- immediate modal also acknowledges, so nobody sees it twice.

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DROP FUNCTION IF EXISTS public.acknowledge_exchange_token(uuid);
-- ALTER TABLE public.practice_exchange_tokens
--   DROP COLUMN IF EXISTS ack_lo_at,
--   DROP COLUMN IF EXISTS ack_hi_at;
-- ============================================================
