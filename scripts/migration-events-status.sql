-- ============================================================
-- ReciRing: Events — status, cancellation, attendance state
-- (Slice A of the Meetup-style upgrade)
--
-- Adds:
--   events.status              — upcoming | cancelled (full + completed
--                                come in Slice C, kept out of CHECK for now
--                                so existing rows don't need backfill)
--   events.cancellation_reason — short text (e.g. "Weather")
--   events.cancelled_at        — when status flipped
--   event_attendees.attendance_status — for future RSVP / no-show tracking
--
-- Extends the public.notifications type enum to include event_cancelled,
-- and installs an AFTER UPDATE trigger that fans out a notification to
-- every attendee when an event is cancelled. Notifications use the
-- existing schema (title + body + payload jsonb) — no new table.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. New columns on events ────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status              text NOT NULL DEFAULT 'upcoming',
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz;

-- Drop/re-add the status CHECK so re-runs pick up changes if we extend
-- the enum later (e.g. adding 'full' / 'completed' in Slice C).
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
    CHECK (status IN ('upcoming','cancelled','full','completed'));


-- ── 2. attendance_status on event_attendees ────────────────
-- Slice A only uses the default 'going'. Slice C will set
-- 'attended' / 'no_show' after events complete.

ALTER TABLE public.event_attendees
  ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'going';

ALTER TABLE public.event_attendees
  DROP CONSTRAINT IF EXISTS event_attendees_status_check;
ALTER TABLE public.event_attendees
  ADD CONSTRAINT event_attendees_status_check
    CHECK (attendance_status IN ('going','attended','no_show','left'));


-- ── 3. Extend notifications.type enum ──────────────────────
-- Existing types stay; add event_cancelled. Drop + recreate so the
-- migration is idempotent and survives prior runs.

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
      'event_cancelled'
    ));


-- ── 4. Cancellation fan-out trigger ────────────────────────
-- When an event's status flips to 'cancelled', insert a notification
-- row for every attendee. Runs SECURITY DEFINER so it can bypass
-- RLS on notifications (which only allows users to self-insert
-- feedback_request rows).

CREATE OR REPLACE FUNCTION public.notify_event_cancellation()
RETURNS trigger AS $$
DECLARE
  v_reason  text;
  v_message text;
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status <> 'cancelled') THEN
    v_reason := COALESCE(NULLIF(trim(NEW.cancellation_reason), ''), 'No reason provided');
    v_message := NEW.title || ' has been cancelled. Reason: ' || v_reason || '. Hosted by ' || NEW.host_display_name || '.';

    INSERT INTO public.notifications (user_id, type, title, body, payload)
    SELECT
      ea.user_id,
      'event_cancelled',
      'Event cancelled',
      v_message,
      jsonb_build_object(
        'event_id',            NEW.id,
        'event_title',         NEW.title,
        'cancellation_reason', NEW.cancellation_reason,
        'host_display_name',   NEW.host_display_name
      )
    FROM public.event_attendees ea
    WHERE ea.event_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_event_cancellation ON public.events;
CREATE TRIGGER trg_notify_event_cancellation
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.notify_event_cancellation();


-- ── 5. cancelled_at convenience trigger ────────────────────
-- Auto-stamp cancelled_at when status becomes 'cancelled' so the
-- client doesn't have to remember to set it.

CREATE OR REPLACE FUNCTION public.stamp_event_cancelled_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status <> 'cancelled') THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stamp_event_cancelled_at ON public.events;
CREATE TRIGGER trg_stamp_event_cancelled_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.stamp_event_cancelled_at();
