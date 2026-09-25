-- ============================================================
-- REPAIR: a practice that happened but was never verified
-- ============================================================
-- Founder runs this by hand, in the Supabase SQL Editor.
--
-- WHY THIS EXISTS
-- submitPracticeConfirmation used to call a richer RPC when skill
-- ratings or finance observations were attached. Those live behind
-- their own migrations, and with no fallback a missing one meant the
-- whole confirmation was lost: the session stayed 'scheduled', both
-- people believed they had confirmed, and no Token was minted. The app
-- now degrades to the plain confirmation, but that does not recover a
-- confirmation already lost. This does.
--
-- READ THIS BEFORE RUNNING
-- You are writing, on behalf of two people, that a practice happened
-- and that each ran their round. That is the one thing Mutu asks THEM
-- to state, and the whole meaning of a Token rests on it. Only run
-- this when you have checked with BOTH participants that the session
-- took place. If you are unsure, ask them to confirm in the app
-- instead: the flow now works, and a member confirming for themselves
-- is always better than you doing it for them.
--
-- WHAT IT DOES, exactly what the RPC would have done:
--   1. inserts the missing confirmation rows (outcome 'completed',
--      both rounds ticked), keeping any row that already exists
--   2. sets the session to 'verified' with verified_at = now()
--   3. mints exactly ONE shared Token for the pair, with the same
--      exchange types the RPC derives from the pairing snapshots.
--      UNIQUE (session_id) makes a second run a no-op, and `source`
--      defaults to 'practice' where that migration has been run.
-- Notifications are NOT sent: a "Session verified" alert days later
-- reads as a fault. Uncomment section 4 if you want them.
--
-- SAFE TO RE-RUN. Every write is guarded or idempotent.
-- ============================================================


-- ── STEP 1 · Find the session. Run this ALONE first. ─────────
-- Never repair by name matching: two members can share a first name,
-- and the wrong id would put a false record on somebody else.
-- Read the result, satisfy yourself it is the right row, and copy its
-- id into STEP 2.

SELECT s.id                AS session_id,
       s.status,
       s.scheduled_start,
       s.verified_at,
       a.name              AS participant_a,
       b.name              AS participant_b,
       (SELECT count(*) FROM public.practice_session_confirmations c
         WHERE c.session_id = s.id)                    AS confirmations_on_file,
       (SELECT string_agg(coalesce(pr.name, c.user_id::text) || ' → ' || c.outcome, ', ')
          FROM public.practice_session_confirmations c
          LEFT JOIN public.profiles pr ON pr.id = c.user_id
         WHERE c.session_id = s.id)                    AS who_confirmed_what,
       EXISTS (SELECT 1 FROM public.practice_exchange_tokens t
                WHERE t.session_id = s.id)             AS token_already_minted
  FROM public.practice_sessions s
  LEFT JOIN public.profiles a ON a.id = s.participant_a_user_id
  LEFT JOIN public.profiles b ON b.id = s.participant_b_user_id
 WHERE s.scheduled_start >= now() - interval '60 days'
   AND s.status IN ('scheduled', 'completed_pending_confirmation')
 ORDER BY s.scheduled_start DESC;


-- ── STEP 2 · Repair that one session ─────────────────────────
-- Paste the id from STEP 1 into v_session below, then run this block.
-- It refuses rather than guesses: a session that is already verified,
-- disputed, cancelled, or still in the future stops the block with a
-- message and changes nothing.

DO $$
DECLARE
  -- ⬇⬇⬇  PASTE THE SESSION ID FROM STEP 1  ⬇⬇⬇
  v_session uuid := '00000000-0000-0000-0000-000000000000';
  -- ⬆⬆⬆                                     ⬆⬆⬆

  v_s       public.practice_sessions%ROWTYPE;
  v_pairing public.practice_pairings%ROWTYPE;
  v_types   text[];
  v_added   integer;
BEGIN
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = v_session FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No session with id %. Did you paste the id from STEP 1?', v_session;
  END IF;

  IF v_s.status = 'verified' THEN
    RAISE EXCEPTION 'Already verified on %. Nothing to repair.', v_s.verified_at;
  END IF;

  IF v_s.status NOT IN ('scheduled', 'completed_pending_confirmation') THEN
    RAISE EXCEPTION 'Session is %, which this script will not touch. A disputed or cancelled session is a decision somebody made, not a lost confirmation.', v_s.status;
  END IF;

  IF now() < v_s.scheduled_start THEN
    RAISE EXCEPTION 'That session has not started yet (starts %).', v_s.scheduled_start;
  END IF;

  -- 1. the missing confirmations, one per participant.
  --    ON CONFLICT keeps whatever a member already submitted: if one
  --    of them DID get through, their own answer stands.
  INSERT INTO public.practice_session_confirmations
         (session_id, user_id, outcome, completed_own_round, completed_partner_round)
  SELECT v_session, u, 'completed', true, true
    FROM unnest(ARRAY[v_s.participant_a_user_id, v_s.participant_b_user_id]) AS u
  ON CONFLICT (session_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  -- 2. settle the session, exactly as the second confirmation would
  UPDATE public.practice_sessions
     SET status       = 'verified',
         completed_at = coalesce(completed_at, now()),
         verified_at  = coalesce(verified_at, now())
   WHERE id = v_session;

  -- 3. mint the one shared Token, with the RPC's own type derivation
  SELECT * INTO v_pairing FROM public.practice_pairings WHERE id = v_s.pairing_id;
  v_types := ARRAY(
    SELECT DISTINCT t FROM (
      SELECT jsonb_array_elements_text(v_pairing.requester_snapshot->'want_types') AS t
      UNION
      SELECT jsonb_array_elements_text(v_pairing.addressee_snapshot->'want_types')
    ) s ORDER BY t);

  INSERT INTO public.practice_exchange_tokens
         (session_id, community_id, pairing_id, user_lo, user_hi, exchange_types, verified_at)
  VALUES (v_session, v_s.community_id, v_s.pairing_id,
          LEAST(v_s.participant_a_user_id, v_s.participant_b_user_id),
          GREATEST(v_s.participant_a_user_id, v_s.participant_b_user_id),
          v_types, now())
  ON CONFLICT (session_id) DO NOTHING;

  -- 4. notifications, deliberately OFF. Uncomment to send them.
  -- INSERT INTO public.notifications (user_id, type, title, body, payload)
  -- SELECT u, 'practice_session_verified', 'Session verified',
  --        'You both confirmed! You unlocked a shared Mutu Token',
  --        jsonb_build_object('session_id', v_session, 'community_id', v_s.community_id)
  --   FROM unnest(ARRAY[v_s.participant_a_user_id, v_s.participant_b_user_id]) AS u;

  RAISE NOTICE 'Repaired %. Added % confirmation row(s); session is verified and the Token is minted.', v_session, v_added;
END $$;


-- ── STEP 3 · Check it, and check nothing else moved ──────────
-- Replace the id, then read both results.

-- The session and its Token:
-- SELECT s.status, s.verified_at,
--        (SELECT count(*) FROM public.practice_session_confirmations c WHERE c.session_id = s.id) AS confirmations,
--        (SELECT count(*) FROM public.practice_exchange_tokens t WHERE t.session_id = s.id)       AS tokens
--   FROM public.practice_sessions s
--  WHERE s.id = '00000000-0000-0000-0000-000000000000';
-- Expect: verified · 2 confirmations · exactly 1 token.

-- Each participant's totals, which is what the Passport and Ask Mutu read:
-- SELECT pr.name,
--        count(*) FILTER (WHERE s.status = 'verified') AS verified_practices
--   FROM public.practice_sessions s
--   JOIN public.profiles pr
--     ON pr.id IN (s.participant_a_user_id, s.participant_b_user_id)
--  WHERE pr.id IN (SELECT participant_a_user_id FROM public.practice_sessions WHERE id = '00000000-0000-0000-0000-000000000000'
--                  UNION
--                  SELECT participant_b_user_id FROM public.practice_sessions WHERE id = '00000000-0000-0000-0000-000000000000')
--  GROUP BY pr.name ORDER BY 2 DESC;


-- ============================================================
-- NO ROLLBACK SCRIPT, on purpose
-- ============================================================
-- Undoing this would mean deleting a Token two people can see and
-- taking a verified practice off both records. If you repaired the
-- wrong session, tell both members what happened, then remove the rows
-- by hand in this order: the token (practice_exchange_tokens by
-- session_id), the confirmations you added (practice_session_confirmations
-- by session_id and user_id), then set practice_sessions.status back to
-- 'scheduled' with verified_at = NULL.
-- ============================================================
