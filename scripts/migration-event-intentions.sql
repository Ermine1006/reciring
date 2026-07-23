-- ReciRing / Mutu — Event intentions (need / offer per event)
--
-- Before registering for an event, each attendee states what they need and
-- what they can offer AT THIS EVENT — distinct from their global profile,
-- because someone wants different things at "SF AGI Summit" than at a campus
-- coffee chat. These per-event intentions are what the in-event matcher scores
-- attendees against each other on.
--
-- Stored on event_attendees (one row per person per event), so they're scoped
-- to the event and cleared automatically if the person leaves (ON DELETE
-- CASCADE from the existing table).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.event_attendees
  ADD COLUMN IF NOT EXISTS need_text  text,
  ADD COLUMN IF NOT EXISTS offer_text text;

-- The matcher reads every attendee's need/offer for an event to rank who each
-- person should meet. attendees can already read the roster (existing RLS), so
-- no new policy is needed — these are just two more columns on rows they can
-- already see. Contact details stay gated by the existing includeContact path.
