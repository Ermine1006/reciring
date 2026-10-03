-- ============================================================
-- Mutu: Smart Match · tell someone when a member is interested
--
-- Before: an "Interested" tap on People you should meet was silent until
-- the other person happened to tap Interested back.
-- After:
--   1. The other person gets ONE notification ("Someone would like to
--      connect", or the first name when the sender has a Public profile).
--   2. Home shows them a card for it with Interested / Not now.
--   3. Interested creates the match through the existing handshake trigger.
--      Not now is silent: the sender is never told.
--
-- Privacy:
--   · A Private sender's user id never reaches the recipient's client. The
--     notification payload and the incoming list carry only the nudge id.
--   · No notification if either person blocked the other, or if the
--     recipient already chose Skip / Not now for the sender.
--   · At most one notification per sender and recipient pair.
--
-- Idempotent. Run once in the Supabase SQL Editor.
-- Preflight (optional): SELECT pg_get_functiondef('public.handle_mutual_nudge'::regproc);
--   should match migration-smart-match-handshake.sql. This file replaces it
--   with the same mutual logic plus the one-sided notification.
-- ============================================================

-- ── 1. Allow the new notification type ──────────────────────
-- Rebuilt from the LIVE constraint so no existing type is ever dropped.
DO $$
DECLARE
  def    text;
  vals   text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
   WHERE conname = 'notifications_type_check' AND conrelid = 'public.notifications'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check not found; stop and check the notifications table';
  END IF;
  IF def LIKE '%''smart_match_interest''%' THEN
    RETURN;
  END IF;
  SELECT array_agg(DISTINCT m[1]) INTO vals
    FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  vals := vals || ARRAY['smart_match_interest'];
  EXECUTE 'ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check';
  EXECUTE format('ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))', vals);
END $$;


-- ── 2. Handshake trigger: mutual → match (unchanged), one-sided → notify ─
CREATE OR REPLACE FUNCTION public.handle_mutual_nudge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reciprocal_interested boolean;
  match_already_exists  boolean;
  sender_visibility     text;
  sender_name           text;
  first_name            text;
BEGIN
  IF NEW.status <> 'interested' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.match_nudges r
    WHERE r.user_id = NEW.candidate_id
      AND r.candidate_id = NEW.user_id
      AND r.status = 'interested'
  ) INTO reciprocal_interested;

  IF NOT reciprocal_interested THEN
    -- One-sided interest: let the candidate know, once, unless blocked or
    -- they already passed on this person.
    IF EXISTS (SELECT 1 FROM public.blocks b
                WHERE (b.blocker_id = NEW.user_id AND b.blocked_user_id = NEW.candidate_id)
                   OR (b.blocker_id = NEW.candidate_id AND b.blocked_user_id = NEW.user_id))
       OR EXISTS (SELECT 1 FROM public.match_nudges r
                   WHERE r.user_id = NEW.candidate_id AND r.candidate_id = NEW.user_id
                     AND r.status IN ('skipped', 'matched'))
       OR EXISTS (SELECT 1 FROM public.notifications n
                   WHERE n.user_id = NEW.candidate_id AND n.type = 'smart_match_interest'
                     AND n.payload->>'nudge_id' = NEW.id::text)
    THEN
      RETURN NEW;
    END IF;

    SELECT p.visibility, p.name INTO sender_visibility, sender_name
      FROM public.profiles p WHERE p.id = NEW.user_id;
    first_name := NULLIF(split_part(btrim(coalesce(sender_name, '')), ' ', 1), '');

    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      NEW.candidate_id,
      'smart_match_interest',
      CASE WHEN sender_visibility = 'public' AND first_name IS NOT NULL
           THEN first_name || ' would like to connect'
           ELSE 'Someone in your community would like to connect' END,
      'Tap Interested too and you will meet in Matches.',
      jsonb_build_object('nudge_id', NEW.id)
    );
    RETURN NEW;
  END IF;

  -- Mutual: unchanged from migration-smart-match-handshake.sql.
  UPDATE public.match_nudges
     SET status = 'matched'
   WHERE (user_id = NEW.user_id      AND candidate_id = NEW.candidate_id)
      OR (user_id = NEW.candidate_id AND candidate_id = NEW.user_id);

  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.status <> 'unmatched'
      AND ((m.requester_user_id = NEW.user_id      AND m.helper_user_id = NEW.candidate_id)
        OR (m.requester_user_id = NEW.candidate_id AND m.helper_user_id = NEW.user_id))
  ) INTO match_already_exists;

  IF NOT match_already_exists THEN
    INSERT INTO public.matches (requester_user_id, helper_user_id, status, source)
    VALUES (NEW.candidate_id, NEW.user_id, 'active', 'smart_match');
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nudge_mutual ON public.match_nudges;
CREATE TRIGGER trg_nudge_mutual
  AFTER UPDATE OF status ON public.match_nudges
  FOR EACH ROW
  WHEN (NEW.status = 'interested')
  EXECUTE FUNCTION public.handle_mutual_nudge();


-- ── 3. Who is interested in me (still waiting for my answer) ─
-- Returns the sender's id and first name ONLY for Public profiles.
-- my_pending_nudge_id lets Home hide a duplicate suggestion card.
CREATE OR REPLACE FUNCTION public.incoming_smart_interests()
RETURNS TABLE (nudge_id uuid, public_id uuid, public_name text, my_pending_nudge_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id,
         CASE WHEN p.visibility = 'public' AND btrim(coalesce(p.name, '')) <> '' THEN r.user_id END,
         CASE WHEN p.visibility = 'public' AND btrim(coalesce(p.name, '')) <> '' THEN split_part(btrim(p.name), ' ', 1) END,
         mine.id,
         r.updated_at
    FROM public.match_nudges r
    JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.match_nudges mine
           ON mine.user_id = auth.uid() AND mine.candidate_id = r.user_id
   WHERE r.candidate_id = auth.uid()
     AND r.status = 'interested'
     AND (mine.id IS NULL OR mine.status = 'pending')
     AND NOT EXISTS (SELECT 1 FROM public.blocks b
                      WHERE (b.blocker_id = auth.uid() AND b.blocked_user_id = r.user_id)
                         OR (b.blocker_id = r.user_id AND b.blocked_user_id = auth.uid()))
   ORDER BY r.updated_at DESC
   LIMIT 20;
$$;


-- ── 4. Answer an incoming interest ──────────────────────────
-- Interested → my nudge becomes 'interested', which fires the handshake
-- above and creates the match. Not now → my nudge becomes 'skipped'
-- (silent; the sender is not notified and will not be asked again).
CREATE OR REPLACE FUNCTION public.respond_smart_interest(p_nudge_id uuid, p_interested boolean)
RETURNS TABLE (matched boolean, match_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me     uuid := auth.uid();
  sender uuid;
  s      integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT r.user_id, r.score INTO sender, s
    FROM public.match_nudges r
   WHERE r.id = p_nudge_id AND r.candidate_id = me AND r.status IN ('interested', 'matched');
  IF sender IS NULL THEN RAISE EXCEPTION 'This invitation is no longer available'; END IF;
  IF EXISTS (SELECT 1 FROM public.blocks b
              WHERE (b.blocker_id = me AND b.blocked_user_id = sender)
                 OR (b.blocker_id = sender AND b.blocked_user_id = me)) THEN
    RAISE EXCEPTION 'This invitation is no longer available';
  END IF;

  INSERT INTO public.match_nudges (user_id, candidate_id, score, reason, status)
  VALUES (me, sender, coalesce(s, 50), 'Interested in connecting with you', 'pending')
  ON CONFLICT (user_id, candidate_id) DO NOTHING;

  IF p_interested THEN
    UPDATE public.match_nudges SET status = 'interested', updated_at = now()
     WHERE user_id = me AND candidate_id = sender AND status IN ('pending', 'skipped');
  ELSE
    UPDATE public.match_nudges SET status = 'skipped', updated_at = now()
     WHERE user_id = me AND candidate_id = sender AND status = 'pending';
  END IF;

  RETURN QUERY
    SELECT true, m.id FROM public.matches m
     WHERE m.status = 'active'
       AND ((m.requester_user_id = me AND m.helper_user_id = sender)
         OR (m.requester_user_id = sender AND m.helper_user_id = me))
     ORDER BY m.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.incoming_smart_interests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_smart_interest(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incoming_smart_interests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_smart_interest(uuid, boolean) TO authenticated;


-- ── Verify ──────────────────────────────────────────────────
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'notifications_type_check';
--     -- expect every previous type plus 'smart_match_interest'
--   SELECT proname FROM pg_proc WHERE proname IN ('incoming_smart_interests', 'respond_smart_interest');
--     -- expect 2 rows
--
-- ── Rollback (manual) ───────────────────────────────────────
--   Re-run migration-smart-match-handshake.sql (restores the silent trigger), then:
--   DROP FUNCTION IF EXISTS public.incoming_smart_interests();
--   DROP FUNCTION IF EXISTS public.respond_smart_interest(uuid, boolean);
--   The extra notification type can stay; it is harmless.
