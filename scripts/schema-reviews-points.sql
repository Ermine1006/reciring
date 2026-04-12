-- ============================================================
-- ReciRing: Reviews + Points system
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ── 1. Reviews table ───────────────────────────────────────
-- One review per direction per match:
--   after a coffee chat, User A reviews User B AND User B reviews User A.

CREATE TABLE IF NOT EXISTS public.reviews (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id          uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  reviewer_user_id  uuid NOT NULL,
  reviewed_user_id  uuid NOT NULL,
  rating            smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment           text DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- one review per reviewer per match
  UNIQUE (match_id, reviewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewed ON public.reviews (reviewed_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON public.reviews (reviewer_user_id);


-- ── 2. Point ledger ────────────────────────────────────────
-- Every point-earning event gets a row. Total points = SUM(points).
-- This is an append-only audit log — never update or delete rows.
--
-- Point values by event:
--   match_created      +2   (helper offered to help)
--   meeting_confirmed  +3   (both users)
--   review_received    +4 to +12 depending on help_type:
--       Referral        +12
--       Intro           +10
--       Coffee Chat     +5
--       Mock Interview  +5
--       Resume Review   +4
--       Study Group     +4
--       Advice          +4

CREATE TABLE IF NOT EXISTS public.point_ledger (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL,
  points      integer NOT NULL,
  event_type  text NOT NULL
                CHECK (event_type IN (
                  'match_created',
                  'meeting_confirmed',
                  'review_received'
                )),
  match_id    uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  review_id   uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  label       text NOT NULL DEFAULT '',   -- human-readable: "Coffee chat with MBA peer"
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_ledger_user ON public.point_ledger (user_id, created_at DESC);


-- ── 3. Add stats columns to profiles ──────────────────────
-- These are denormalized counters updated by triggers for fast reads.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_points     integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS meetings_scheduled integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS meetings_completed integer NOT NULL DEFAULT 0;


-- ── 4. Trigger: award points when a review is submitted ───
-- Determines point value from the match's post help_type.

CREATE OR REPLACE FUNCTION public.on_review_created()
RETURNS trigger AS $$
DECLARE
  v_help_type text[];
  v_primary   text;
  v_pts       integer;
  v_label     text;
BEGIN
  -- Look up the help_type from the post linked to this match
  SELECT p.help_type INTO v_help_type
  FROM public.matches m
  JOIN public.posts p ON p.id = m.post_id
  WHERE m.id = NEW.match_id;

  v_primary := COALESCE(v_help_type[1], 'Other');

  -- Map help type → points
  v_pts := CASE v_primary
    WHEN 'Referral'       THEN 12
    WHEN 'Intro'          THEN 10
    WHEN 'Coffee Chat'    THEN 5
    WHEN 'Mock Interview' THEN 5
    WHEN 'Resume Review'  THEN 4
    WHEN 'Study Group'    THEN 4
    WHEN 'Advice'         THEN 4
    ELSE 4
  END;

  v_label := v_primary || ' — rated ' || NEW.rating || '★';

  -- Award points to the REVIEWED user (the one who helped)
  INSERT INTO public.point_ledger (user_id, points, event_type, match_id, review_id, label)
  VALUES (NEW.reviewed_user_id, v_pts, 'review_received', NEW.match_id, NEW.id, v_label);

  -- Update the reviewed user's total_points
  UPDATE public.profiles
  SET total_points = total_points + v_pts
  WHERE id = NEW.reviewed_user_id;

  -- Increment meetings_completed for both users
  UPDATE public.profiles
  SET meetings_completed = meetings_completed + 1
  WHERE id IN (NEW.reviewer_user_id, NEW.reviewed_user_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_review_created ON public.reviews;
CREATE TRIGGER trg_review_created
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_created();


-- ── 5. Trigger: award points when a match is created ──────
-- Helper gets +2 for offering to help.

CREATE OR REPLACE FUNCTION public.on_match_created()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.point_ledger (user_id, points, event_type, match_id, label)
  VALUES (NEW.helper_user_id, 2, 'match_created', NEW.id, 'Offered to help');

  UPDATE public.profiles
  SET total_points = total_points + 2,
      meetings_scheduled = meetings_scheduled + 1
  WHERE id = NEW.helper_user_id;

  -- Also count the requester's scheduled meetings
  UPDATE public.profiles
  SET meetings_scheduled = meetings_scheduled + 1
  WHERE id = NEW.requester_user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_match_created ON public.matches;
CREATE TRIGGER trg_match_created
  AFTER INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.on_match_created();


-- ── 6. Trigger: award points when a meeting is confirmed ──
-- Both users get +3 when a meeting_proposal message status → confirmed.

CREATE OR REPLACE FUNCTION public.on_meeting_confirmed()
RETURNS trigger AS $$
DECLARE
  v_requester uuid;
  v_helper    uuid;
BEGIN
  -- Only fire when metadata->status changes to 'confirmed'
  IF NEW.type = 'meeting_proposal'
     AND (NEW.metadata->>'status') = 'confirmed'
     AND (OLD.metadata->>'status') IS DISTINCT FROM 'confirmed'
  THEN
    SELECT m.requester_user_id, m.helper_user_id
    INTO v_requester, v_helper
    FROM public.matches m
    WHERE m.id = NEW.match_id;

    -- Award both participants
    INSERT INTO public.point_ledger (user_id, points, event_type, match_id, label)
    VALUES
      (v_requester, 3, 'meeting_confirmed', NEW.match_id, 'Meeting confirmed'),
      (v_helper,    3, 'meeting_confirmed', NEW.match_id, 'Meeting confirmed');

    UPDATE public.profiles
    SET total_points = total_points + 3
    WHERE id IN (v_requester, v_helper);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_meeting_confirmed ON public.messages;
CREATE TRIGGER trg_meeting_confirmed
  AFTER UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_meeting_confirmed();


-- ── 7. Leaderboard view ────────────────────────────────────
-- Fast materialized query for the leaderboard page.

CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  p.id,
  p.name,
  p.avatar_url,
  p.is_anonymous,
  p.total_points,
  p.meetings_scheduled,
  p.meetings_completed,
  RANK() OVER (ORDER BY p.total_points DESC) AS rank
FROM public.profiles p
WHERE p.total_points > 0
ORDER BY p.total_points DESC
LIMIT 50;


-- ── 8. RLS policies ───────────────────────────────────────

-- Reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reviews they gave or received"
  ON public.reviews FOR SELECT
  TO authenticated
  USING (auth.uid() = reviewer_user_id OR auth.uid() = reviewed_user_id);

CREATE POLICY "Users can create reviews for their own matches"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND (m.requester_user_id = auth.uid() OR m.helper_user_id = auth.uid())
    )
  );

-- Point ledger: read-only for the user (triggers do inserts via SECURITY DEFINER)
ALTER TABLE public.point_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own points"
  ON public.point_ledger FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Leaderboard view: readable by all authenticated users
-- (Views inherit the base table's RLS, so we need a policy on profiles
--  that allows reading the leaderboard columns. The existing
--  "Profiles are viewable by authenticated users" policy covers this.)
