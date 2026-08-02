-- ReciRing / Mutu — Separate "message" from "next action"
--
-- "follow-up" conflated two things on one field (followed_up_at): a MESSAGE
-- sent to someone, and a NEXT ACTION / commitment being completed. Split them:
--
--   Communication (message) — NEW columns:
--     message_status  : 'none' | 'draft' | 'sent' | 'dismissed'
--     message_draft   : the drafted text
--     message_drafted_at, message_sent_at
--
--   Next action / commitment — EXISTING columns keep their meaning ONLY:
--     next_action           : the task text
--     due_at                : when
--     followed_up_at        : next action COMPLETED
--     followup_dismissed_at : next action DISMISSED
--
-- One event_encounters row still = one person you met at one event (the
-- interaction + connection). Reuses that table; RLS inherited (author-only).
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.event_encounters
  ADD COLUMN IF NOT EXISTS message_status text NOT NULL DEFAULT 'none'
    CHECK (message_status IN ('none','draft','sent','dismissed')),
  ADD COLUMN IF NOT EXISTS message_draft      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS message_drafted_at timestamptz,
  ADD COLUMN IF NOT EXISTS message_sent_at    timestamptz;
