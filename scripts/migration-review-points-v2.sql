-- ============================================================
-- Migration: Unique review index + rating-based points
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ── 1. Unique index: one review per reviewer per match ────────
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_match_per_reviewer
  ON public.reviews (match_id, reviewer_user_id);


-- ── 2. Updated trigger: points based on star rating ───────────
--
--   5 stars = +10
--   4 stars = +7
--   3 stars = +4
--   2 stars = +0
--   1 star  = +0

CREATE OR REPLACE FUNCTION public.on_review_created()
RETURNS trigger AS $$
DECLARE
  v_pts   integer;
  v_label text;
BEGIN
  -- Map star rating → points
  v_pts := CASE NEW.rating
    WHEN 5 THEN 10
    WHEN 4 THEN 7
    WHEN 3 THEN 4
    ELSE 0
  END;

  v_label := 'Rated ' || NEW.rating || '★ → +' || v_pts || ' pts';

  -- Only award points if rating >= 3
  IF v_pts > 0 THEN
    INSERT INTO public.point_ledger (user_id, points, event_type, match_id, review_id, label)
    VALUES (NEW.reviewed_user_id, v_pts, 'review_received', NEW.match_id, NEW.id, v_label);

    UPDATE public.profiles
    SET total_points = total_points + v_pts
    WHERE id = NEW.reviewed_user_id;
  END IF;

  -- Increment meetings_completed for both users
  UPDATE public.profiles
  SET meetings_completed = meetings_completed + 1
  WHERE id IN (NEW.reviewer_user_id, NEW.reviewed_user_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS trg_review_created ON public.reviews;
CREATE TRIGGER trg_review_created
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_created();
