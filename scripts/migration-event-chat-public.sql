-- ReciRing / Mutu — Host-controlled public event chat
--
-- By default an event's discussion is private: only the host and attendees can
-- read or post (existing "host or attendee" policies). This lets the host open
-- the chat to everyone — anyone viewing the event can read and post without
-- joining — via a toggle in the app. Private stays the default.
--
-- chat_public = false (default) → host + attendees only (unchanged)
-- chat_public = true            → any authenticated viewer too
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS chat_public boolean NOT NULL DEFAULT false;

-- Read: host, attendee, OR the event's chat is public.
DROP POLICY IF EXISTS "EventMsg: read if host or attendee" ON public.event_messages;
DROP POLICY IF EXISTS "EventMsg: read if host, attendee, or public" ON public.event_messages;
CREATE POLICY "EventMsg: read if host, attendee, or public"
  ON public.event_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.chat_public = true
          OR e.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.event_attendees ea
            WHERE ea.event_id = e.id AND ea.user_id = auth.uid()
          )
        )
    )
  );

-- Post: same gate, plus the sender must be themselves.
DROP POLICY IF EXISTS "EventMsg: post if host or attendee" ON public.event_messages;
DROP POLICY IF EXISTS "EventMsg: post if host, attendee, or public" ON public.event_messages;
CREATE POLICY "EventMsg: post if host, attendee, or public"
  ON public.event_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
        AND (
          e.chat_public = true
          OR e.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.event_attendees ea
            WHERE ea.event_id = e.id AND ea.user_id = auth.uid()
          )
        )
    )
  );
