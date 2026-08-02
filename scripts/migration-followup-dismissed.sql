-- ReciRing / Mutu — Follow-up "dismissed" state (Event CRM P4)
--
-- A follow-up (an encounter with a next_action) can now be pending, completed,
-- or dismissed — without a separate follow_ups table. Reuses event_encounters:
--   pending    = next_action set, followed_up_at NULL, followup_dismissed_at NULL
--   completed  = followed_up_at set
--   dismissed  = followup_dismissed_at set
-- Both completed and dismissed drop out of "open follow-ups" but stay in the
-- person's history. RLS is inherited (author-only). Safe to re-run.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.event_encounters
  ADD COLUMN IF NOT EXISTS followup_dismissed_at timestamptz;
