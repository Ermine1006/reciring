-- ============================================================
-- ReciRing: Events — per-event group thread
-- (Slice B of the Meetup-style upgrade)
--
-- One thread per event. Anyone who is the host OR a current attendee
-- can read and post. This is the "Message Host" target — questions
-- about meeting point / parking / what to bring become public Q&A
-- so everyone benefits from one person's question.
--
-- Future hooks:
--   - reactions / threading: add reply_to_id and emoji_reactions later
--   - host-only announcements: add `is_announcement` boolean
--   - DMs to host: would need a separate table or `is_private` flag
--
-- Idempotent. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sender_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (length(trim(body)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_messages_event_created
  ON public.event_messages (event_id, created_at);

CREATE INDEX IF NOT EXISTS idx_event_messages_sender
  ON public.event_messages (sender_user_id);


-- ── RLS ──────────────────────────────────────────────────────
-- A user can READ messages for an event if they are either:
--   - the host (events.host_user_id = auth.uid()), OR
--   - a current attendee (row in event_attendees with their user_id)
-- The same predicate gates INSERT, plus the sender must be self.
-- DELETE: senders can remove their own messages (for typos / regret).

ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "EventMsg: read if host or attendee" ON public.event_messages;
CREATE POLICY "EventMsg: read if host or attendee"
  ON public.event_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.event_attendees ea
            WHERE ea.event_id = e.id AND ea.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "EventMsg: post if host or attendee" ON public.event_messages;
CREATE POLICY "EventMsg: post if host or attendee"
  ON public.event_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.event_attendees ea
            WHERE ea.event_id = e.id AND ea.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "EventMsg: delete own message" ON public.event_messages;
CREATE POLICY "EventMsg: delete own message"
  ON public.event_messages FOR DELETE
  TO authenticated
  USING (sender_user_id = auth.uid());


-- ── Realtime ────────────────────────────────────────────────
-- Add to the publication so the client can subscribe via
-- postgres_changes for live message updates. REPLICA IDENTITY FULL
-- gives us complete payloads on inserts (matches what the messages
-- table uses for chat).

ALTER TABLE public.event_messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'event_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.event_messages';
  END IF;
END $$;
