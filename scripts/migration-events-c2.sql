-- ============================================================
-- ReciRing: Events — minimum attendance + auto status
-- (Slice C-2 of the Meetup-style upgrade)
--
-- Adds:
--   events.min_attendees             — host's threshold (0 = none)
--   events.below_min_notified_at     — set when the cron pings host;
--                                      stays NULL otherwise (dedupe)
--   notifications.type 'event_below_min'
--   Auto-status trigger: keep status in sync with capacity
--                        (only flips between 'upcoming' and 'full';
--                        'cancelled' and 'completed' are terminal)
--
-- The 'completed' status is set by the daily Vercel cron sweep, not a
-- DB trigger — Postgres has no clean way to schedule "fire X hours
-- after this row's start_at" without pg_cron, which we don't have.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. New columns on events ────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS min_attendees integer NOT NULL DEFAULT 0
    CHECK (min_attendees >= 0 AND min_attendees <= max_attendees);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS below_min_notified_at timestamptz;


-- ── 2. notifications enum extension ────────────────────────

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'new_match',
      'new_message',
      'feedback_request',
      'meeting_confirmed',
      'review_received',
      'event_cancelled',
      'event_joined',
      'event_message',
      'event_below_min'
    ));


-- ── 3. Auto-status: 'full' / 'upcoming' transitions ────────
-- Fires after each event_attendees INSERT / DELETE. Only flips
-- between 'upcoming' <-> 'full'. Never touches 'cancelled' or
-- 'completed' (those are terminal — host already decided, or the
-- event is in the past). Runs SECURITY DEFINER to bypass RLS on
-- the events update.

CREATE OR REPLACE FUNCTION public.recompute_event_capacity_status()
RETURNS trigger AS $$
DECLARE
  v_event_id uuid;
  v_status   text;
  v_cap      integer;
  v_count    integer;
  v_new_status text;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  IF v_event_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT status, max_attendees INTO v_status, v_cap
  FROM public.events WHERE id = v_event_id;
  IF v_status IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Terminal states — leave alone.
  IF v_status IN ('cancelled','completed') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO v_count
  FROM public.event_attendees WHERE event_id = v_event_id;

  v_new_status := CASE
    WHEN v_count >= v_cap THEN 'full'
    ELSE 'upcoming'
  END;

  IF v_new_status <> v_status THEN
    UPDATE public.events SET status = v_new_status WHERE id = v_event_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recompute_event_capacity_insert ON public.event_attendees;
CREATE TRIGGER trg_recompute_event_capacity_insert
  AFTER INSERT ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.recompute_event_capacity_status();

DROP TRIGGER IF EXISTS trg_recompute_event_capacity_delete ON public.event_attendees;
CREATE TRIGGER trg_recompute_event_capacity_delete
  AFTER DELETE ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.recompute_event_capacity_status();

-- One-time backfill so existing events at capacity get marked 'full'.
UPDATE public.events e
SET status = 'full'
WHERE e.status = 'upcoming'
  AND (SELECT count(*) FROM public.event_attendees ea WHERE ea.event_id = e.id) >= e.max_attendees;
