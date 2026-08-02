-- ReciRing / Mutu — Direct 1:1 matches (message someone you met)
--
-- Until now a match required a post or a marketplace opportunity. To let a user
-- message a person they logged meeting (Event Mode / Recap / capture), allow a
-- match anchored on just the event_id. Reuses the existing matches + messages +
-- ChatView stack — no second messaging system.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_source_chk;
ALTER TABLE public.matches ADD CONSTRAINT matches_source_chk
  CHECK (post_id IS NOT NULL OR marketplace_post_id IS NOT NULL OR event_id IS NOT NULL);
