-- ============================================================
-- ReciRing: Event attendee visibility
--
-- Adds a per-event toggle that controls how the attendee list is
-- surfaced to non-host viewers:
--
--   'public'  — attendees + browsers see avatars + first names.
--               Defaults here because networking is the point of
--               most Rotman / community events.
--   'private' — non-hosts see only the attendee COUNT. No names,
--               no avatars. The host retains full visibility
--               (name, program, email, joined time) in every case.
--
-- Emails are NEVER surfaced to non-hosts regardless of this flag.
-- They live behind the same RLS profile-read policy used elsewhere;
-- the client-side UI is what enforces the host-only display.
--
-- Idempotent. Safe to re-run.
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS attendee_visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_attendee_visibility_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_attendee_visibility_check
    CHECK (attendee_visibility IN ('public', 'private'));
