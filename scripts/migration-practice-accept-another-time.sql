-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — "yes, but another time"
--
-- THE PROBLEM: a slot-bound invitation offers exactly two answers.
-- Accepting books the proposed time on the spot; the only other
-- button is Decline. Someone who wants to practise but cannot make
-- that hour has no way to say so, so they decline. A timing clash is
-- then recorded as a rejection: it starts the requester's 14 day
-- cooldown and marks the card, both of which are wrong.
--
-- THE FIX: one new function. The addressee clears the proposed time
-- and the EXISTING accept function runs untouched. With no proposed
-- time it takes its own no-slot branch, which already does the right
-- thing: names reveal, a chat opens, nothing is booked, and the
-- inviter is told to say hi and pick a time together.
--
-- WHY A WRAPPER AND NOT A NEW ARGUMENT. Adding a parameter to
-- accept_practice_pairing would mean rewriting it, and this codebase
-- has already been bitten once by a CREATE OR REPLACE quietly
-- reverting somebody else's later edit. This file adds a function and
-- changes nothing that exists. Rollback is a DROP.
--
-- No schema change. No data change. Idempotent. Rollback at the
-- bottom. Assertions: scripts/practice-assertions-another-time.sql
-- ============================================================


-- ── 0. PRE-FLIGHT ───────────────────────────────────────────────
DO $preflight$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'accept_practice_pairing'
     AND pg_get_function_arguments(oid) = 'p_pairing_id uuid';
  IF n <> 1 THEN
    RAISE EXCEPTION 'PRE-FLIGHT: accept_practice_pairing(p_pairing_id uuid) not found; run the earlier practice migrations first';
  END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'practice_pairings'
     AND column_name IN ('proposed_window_id','proposed_starts_at',
                         'proposed_ends_at','proposed_timezone');
  IF n <> 4 THEN
    RAISE EXCEPTION 'PRE-FLIGHT: the proposed_* columns are missing; run scripts/migration-practice-slot-invites.sql first';
  END IF;
END $preflight$;


-- ── 1. Accept, but not at the proposed time ─────────────────────
-- Purely additive. accept_practice_pairing is called, never rewritten.
CREATE OR REPLACE FUNCTION public.accept_practice_pairing_without_slot(p_pairing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  -- Only the person who RECEIVED the invitation may do this. The
  -- inviter proposed the time; they cannot un-propose it this way.
  IF v_pairing.addressee_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_addressee'; END IF;
  IF v_pairing.status <> 'invited' THEN RAISE EXCEPTION 'invalid_state'; END IF;

  UPDATE public.practice_pairings
     SET proposed_window_id  = NULL,
         proposed_starts_at  = NULL,
         proposed_ends_at    = NULL,
         proposed_timezone   = NULL
   WHERE id = p_pairing_id;

  -- Everything else is the existing acceptance, unchanged: expiry,
  -- eligibility, the chat, the reveal and the notification are all
  -- still owned by that function. If it raises, this whole call rolls
  -- back and the proposed time survives untouched.
  RETURN public.accept_practice_pairing(p_pairing_id);
END $$;

REVOKE ALL ON FUNCTION public.accept_practice_pairing_without_slot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_practice_pairing_without_slot(uuid) TO authenticated;


-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.accept_practice_pairing_without_slot(uuid);
-- Nothing else is touched, so nothing else needs restoring. The
-- client hides the button when the function is absent.
-- ============================================================
