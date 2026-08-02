-- ReciRing / Mutu — Event memory CRM fields (Phase 4)
--
-- EXTENDS the existing public.event_encounters table (created in
-- migration-event-encounters.sql) rather than adding a second store — one
-- source of truth for "who I met". The base table already has topics,
-- private_note, status, source, followed_up_at, and owner-only RLS.
--
-- This adds the CRM fields the Prepare/Capture flow needs:
--   • person_name  — display name, so free-text captures work for people who
--     aren't Mutu members ("Tell Mutu what happened" can mention anyone)
--   • commitment   — what I promised them
--   • next_action  — my follow-up step (a follow-up = next_action set AND
--     followed_up_at IS NULL; no separate follow-ups table)
--   • due_at       — suggested deadline
-- and relaxes event_id / encountered_user_id to NULLable so an encounter can be
-- logged without a linked event or a linked Mutu profile.
--
-- RLS is inherited from the base table (author-only). Safe to re-run.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.event_encounters
  ADD COLUMN IF NOT EXISTS person_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS commitment  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_action text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS due_at      timestamptz;

-- Allow encounters that aren't tied to a specific event or a Mutu profile.
ALTER TABLE public.event_encounters ALTER COLUMN event_id            DROP NOT NULL;
ALTER TABLE public.event_encounters ALTER COLUMN encountered_user_id DROP NOT NULL;

-- Speeds up the dashboard's open-follow-ups query.
CREATE INDEX IF NOT EXISTS idx_encounters_followups
  ON public.event_encounters (user_id)
  WHERE next_action <> '' AND followed_up_at IS NULL;
