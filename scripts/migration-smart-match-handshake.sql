-- ============================================================
-- Mutu / ReciRing: Smart Match — mutual-interest handshake
--
-- Turns two one-sided "Interested" taps into a real connection.
-- Because match_nudges RLS lets a user read ONLY their own rows, a client
-- can't tell whether the other person is also interested. So the handshake
-- runs server-side: a SECURITY DEFINER trigger sees both rows and, on a
-- mutual match, creates a `matches` row that flows into the existing
-- Matches list + chat (anonymous, using the normal identity-reveal flow).
--
-- Idempotent. Run once in the Supabase SQL Editor.
-- ============================================================

-- ── 1. Mark the source of a match ───────────────────────────
-- Existing matches are born from a post or a marketplace post. Smart Match
-- connections have neither, so we tag them. Default 'post' keeps every
-- existing row unchanged.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'post';

-- ── 2. Relax the source CHECK so non-post matches are allowed ─
-- Original guard: a match must reference a post or a marketplace post.
-- New guard: still required for source='post', but a non-post source
-- (smart_match / direct) may have neither.
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_source_chk;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_source_chk
  CHECK (post_id IS NOT NULL OR marketplace_post_id IS NOT NULL OR source <> 'post');

-- ── 3. Handshake trigger function ───────────────────────────
-- Fires when a nudge becomes 'interested'. If the reciprocal nudge is also
-- 'interested', flip both to 'matched' and create the connection (once).
-- SECURITY DEFINER so it can read the other user's nudge row + insert a
-- match spanning two users, both of which RLS would otherwise block.
CREATE OR REPLACE FUNCTION public.handle_mutual_nudge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reciprocal_interested boolean;
  match_already_exists  boolean;
BEGIN
  -- Only act on the transition into 'interested'.
  IF NEW.status <> 'interested' THEN
    RETURN NEW;
  END IF;

  -- Does the candidate already say they're interested in me?
  SELECT EXISTS (
    SELECT 1 FROM public.match_nudges r
    WHERE r.user_id = NEW.candidate_id
      AND r.candidate_id = NEW.user_id
      AND r.status = 'interested'
  ) INTO reciprocal_interested;

  IF NOT reciprocal_interested THEN
    RETURN NEW;  -- one-sided so far; nothing to do
  END IF;

  -- Mutual: promote BOTH nudge rows to 'matched'. (These UPDATEs re-fire this
  -- trigger with NEW.status='matched', which the WHEN clause below filters out,
  -- so there's no recursion.)
  UPDATE public.match_nudges
     SET status = 'matched'
   WHERE (user_id = NEW.user_id      AND candidate_id = NEW.candidate_id)
      OR (user_id = NEW.candidate_id AND candidate_id = NEW.user_id);

  -- Create the connection once (skip if these two already have a live match).
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

-- ── 4. Trigger ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_nudge_mutual ON public.match_nudges;
CREATE TRIGGER trg_nudge_mutual
  AFTER UPDATE OF status ON public.match_nudges
  FOR EACH ROW
  WHEN (NEW.status = 'interested')
  EXECUTE FUNCTION public.handle_mutual_nudge();


-- ── Verify ──────────────────────────────────────────────────
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_nudge_mutual';   -- expect 1 row
--   SELECT conname FROM pg_constraint WHERE conname = 'matches_source_chk';
-- End-to-end: set two reciprocal match_nudges rows to 'interested' →
--   both flip to 'matched' and one matches row (source='smart_match') appears.
