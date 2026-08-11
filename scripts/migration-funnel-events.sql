-- ============================================================
-- Mutu / ReciRing: Matching-funnel analytics (append-only event log)
--
-- Phase 1.1 — establishes a measurement baseline BEFORE any change
-- to the matching algorithm, so later work (Smart Match, Event Goal)
-- can be judged against real exposure→completion numbers.
--
-- The funnel (event_name values):
--   discover_card_exposed  → a discover card reached the top slot
--   discover_card_opened   → user opened the card detail
--   discover_swipe_right   → user swiped right ("interested")
--   match_created          → a match row was created
--   we_met_tapped          → a participant tapped "We met"
--   exchange_completed     → BOTH participants confirmed (help happened)
--
-- Design: one row per event, an append-only log. Ad-hoc ids (post_id,
-- match_id, score, tier) live inside `properties` jsonb — deliberately
-- NO foreign keys to posts/matches, so (a) deleting a post never wipes
-- historical analytics and (b) an insert never fails because a
-- referenced row is gone. This is a second-class observability table,
-- not a source of truth for feed/match state.
--
-- Idempotent. Safe to re-run. Run once in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  text NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_name_time
  ON public.funnel_events (event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user
  ON public.funnel_events (user_id);


-- ── RLS ──────────────────────────────────────────────────────
-- Clients may INSERT only their own events. There is intentionally
-- NO client SELECT/UPDATE/DELETE policy: the log is write-only from
-- the app, and only the service role (Supabase dashboard / admin
-- queries) reads it. This keeps one user's funnel private from others
-- and prevents tampering with historical events.

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own funnel events" ON public.funnel_events;
CREATE POLICY "Users insert own funnel events"
  ON public.funnel_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- ── Example read queries (run as service role in the SQL Editor) ──
--
-- Whole-funnel counts, last 30 days:
--   SELECT event_name, count(*)
--   FROM public.funnel_events
--   WHERE created_at > now() - interval '30 days'
--   GROUP BY event_name ORDER BY count(*) DESC;
--
-- Exposure → completion conversion:
--   SELECT
--     count(*) FILTER (WHERE event_name='discover_card_exposed') AS exposed,
--     count(*) FILTER (WHERE event_name='discover_swipe_right')  AS interested,
--     count(*) FILTER (WHERE event_name='match_created')         AS matched,
--     count(*) FILTER (WHERE event_name='exchange_completed')    AS completed
--   FROM public.funnel_events
--   WHERE created_at > now() - interval '30 days';


-- ── Sanity check ─────────────────────────────────────────────
--   SELECT count(*) FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='funnel_events';
--   -- expect 1
