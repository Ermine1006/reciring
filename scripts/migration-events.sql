-- ============================================================
-- ReciRing: Events / Community feature (Phase 1 MVP)
--
-- Two tables:
--   events            — the event itself (one row per upcoming meetup)
--   event_attendees   — who's joined (one row per (event, user) pair)
--
-- Capacity guard is enforced at the DB layer via a BEFORE INSERT
-- trigger on event_attendees, so race conditions can't overflow
-- max_attendees even if the client fires multiple joins simultaneously.
--
-- Host can be: individual (default) / club / business — schema is
-- ready for sponsor flows, payment + dashboard logic deferred.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. events ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  description        text NOT NULL DEFAULT '',
  -- Combined timestamptz instead of separate date + time columns.
  -- The UI splits them on the form; the DB stores one timestamp
  -- for clean sorting + timezone-correct comparisons.
  start_at           timestamptz NOT NULL,
  location           text NOT NULL DEFAULT '',
  category           text NOT NULL CHECK (category IN (
                       'Sports','Career','Networking','Wellness',
                       'Social','Study Group','Startup','Other'
                     )),
  max_attendees      integer NOT NULL CHECK (max_attendees > 0 AND max_attendees <= 500),
  host_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Host's chosen display name at creation time. Frozen — does NOT
  -- update if the user later renames their profile, so the event
  -- attribution stays consistent.
  host_display_name  text NOT NULL,
  host_type          text NOT NULL DEFAULT 'individual'
                       CHECK (host_type IN ('individual','club','business')),
  image_url          text,
  is_sponsored       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_upcoming
  ON public.events (start_at)
  WHERE start_at > now();

CREATE INDEX IF NOT EXISTS idx_events_host
  ON public.events (host_user_id);


-- ── 2. event_attendees ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_attendees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),

  -- A user can join an event at most once. The UNIQUE constraint
  -- gives us a clean error code (23505) on duplicate join attempts.
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event
  ON public.event_attendees (event_id);

CREATE INDEX IF NOT EXISTS idx_event_attendees_user
  ON public.event_attendees (user_id, joined_at DESC);


-- ── 3. Capacity trigger ────────────────────────────────────
-- Refuses inserts that would push attendance past max_attendees.
-- Runs in a single transaction so concurrent joins can't both succeed.

CREATE OR REPLACE FUNCTION public.check_event_capacity()
RETURNS trigger AS $$
DECLARE
  cap        integer;
  filled     integer;
BEGIN
  SELECT max_attendees INTO cap FROM public.events WHERE id = NEW.event_id;
  IF cap IS NULL THEN
    RAISE EXCEPTION 'Event % does not exist', NEW.event_id;
  END IF;

  SELECT count(*) INTO filled FROM public.event_attendees WHERE event_id = NEW.event_id;
  IF filled >= cap THEN
    RAISE EXCEPTION 'Event is at capacity (%/%)', filled, cap;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_capacity ON public.event_attendees;
CREATE TRIGGER trg_event_capacity
  BEFORE INSERT ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.check_event_capacity();


-- ── 4. RLS ─────────────────────────────────────────────────
-- Events are public to authenticated users (anyone can browse).
-- Only the host can edit / delete their own event.
-- Attendee rows: anyone authenticated can read (for the capacity
-- counter); users can only insert / delete their own attendance.

ALTER TABLE public.events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendees  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Events: anyone authenticated can read"    ON public.events;
CREATE POLICY "Events: anyone authenticated can read"
  ON public.events FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Events: authenticated users can create"   ON public.events;
CREATE POLICY "Events: authenticated users can create"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_user_id);

DROP POLICY IF EXISTS "Events: host can update own event"        ON public.events;
CREATE POLICY "Events: host can update own event"
  ON public.events FOR UPDATE
  TO authenticated
  USING      (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);

DROP POLICY IF EXISTS "Events: host can delete own event"        ON public.events;
CREATE POLICY "Events: host can delete own event"
  ON public.events FOR DELETE
  TO authenticated
  USING (auth.uid() = host_user_id);


DROP POLICY IF EXISTS "Attendees: anyone authenticated can read" ON public.event_attendees;
CREATE POLICY "Attendees: anyone authenticated can read"
  ON public.event_attendees FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Attendees: users can join (insert own)"   ON public.event_attendees;
CREATE POLICY "Attendees: users can join (insert own)"
  ON public.event_attendees FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Attendees: users can leave (delete own)"  ON public.event_attendees;
CREATE POLICY "Attendees: users can leave (delete own)"
  ON public.event_attendees FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
