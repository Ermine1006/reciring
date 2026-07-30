-- DEV/TEST SEED — Recognition preview (reversible)
--
-- Lets ONE account see the whole recognition experience on localhost without a
-- second live user: it (A) simulates BOTH "We met" on one of your matches so
-- the recognition screen appears, and (B) seeds a few recognitions TO you from
-- distinct other members so the impact ledger + trust line light up.
--
-- Writes test rows to your real DB (fine pre-launch). free_text is tagged
-- '[seed]' so the CLEANUP block at the bottom removes them cleanly.
--
-- ▶ Before running: replace YOUR_APP_LOGIN_EMAIL below with the email you log
--   into the Mutu app with.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  me         uuid;
  my_match   uuid;
  my_peer    uuid;
  seed_match uuid;
  givers     uuid[];
  g          uuid;
  i          int := 0;
  chips      text[];
BEGIN
  -- ⚠️ SET THIS to the email you log into the app with:
  SELECT id INTO me FROM public.profiles
   WHERE lower(email) = lower('YOUR_APP_LOGIN_EMAIL') LIMIT 1;
  IF me IS NULL THEN
    RAISE EXCEPTION 'No profile found for that email — fix the email on the line above.';
  END IF;

  -- (A) Recognition screen: simulate BOTH "We met" on your most recent match.
  SELECT id,
         CASE WHEN requester_user_id = me THEN helper_user_id ELSE requester_user_id END
    INTO my_match, my_peer
    FROM public.matches
   WHERE me IN (requester_user_id, helper_user_id)
   ORDER BY created_at DESC LIMIT 1;

  IF my_match IS NOT NULL THEN
    INSERT INTO public.exchange_confirmations(match_id, user_id)
      VALUES (my_match, me), (my_match, my_peer)
      ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Seeded both "We met" on match % — open that chat to see the recognition screen.', my_match;
  ELSE
    RAISE NOTICE 'You have no matches yet — the recognition screen needs a real match; skipped (A).';
  END IF;

  -- (B) Impact ledger + trust line: 4 recognitions TO you from 4 distinct
  --     members. Needs any real match id (FK) + distinct giver profiles.
  SELECT id INTO seed_match FROM public.matches ORDER BY created_at DESC LIMIT 1;
  SELECT array_agg(id) INTO givers FROM (
    SELECT id FROM public.profiles WHERE id <> me ORDER BY created_at LIMIT 4
  ) s;

  IF seed_match IS NOT NULL AND givers IS NOT NULL THEN
    FOREACH g IN ARRAY givers LOOP
      i := i + 1;
      chips := CASE i
        WHEN 1 THEN ARRAY['Followed through','Responsive']
        WHEN 2 THEN ARRAY['Great listener']
        WHEN 3 THEN ARRAY['High-quality advice','Followed through']
        ELSE        ARRAY['Warm introduction','Responsive']
      END;
      INSERT INTO public.recognition_events(match_id, giver_id, receiver_id, chips, free_text)
        VALUES (seed_match, g, me, chips, '[seed]')
        ON CONFLICT (match_id, giver_id) DO NOTHING;
    END LOOP;
    RAISE NOTICE 'Seeded % recognitions to you — refresh Profile for the impact ledger + trust line.', i;
  ELSE
    RAISE NOTICE 'Need >=1 match and >=1 other profile to seed recognitions; skipped (B).';
  END IF;
END $$;


-- ── CLEANUP — run this block later to remove the seed ─────────
-- DELETE FROM public.recognition_events
--  WHERE free_text = '[seed]'
--    AND receiver_id = (SELECT id FROM public.profiles
--                        WHERE lower(email) = lower('YOUR_APP_LOGIN_EMAIL'));
-- -- Also clears the simulated "We met" on your latest match, if you want to reset it:
-- DELETE FROM public.exchange_confirmations ec
--  USING public.matches m
--  WHERE ec.match_id = m.id
--    AND (SELECT id FROM public.profiles WHERE lower(email)=lower('YOUR_APP_LOGIN_EMAIL'))
--        IN (m.requester_user_id, m.helper_user_id);
