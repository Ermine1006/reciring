-- ReciRing / Mutu — Event preparation goals (Phase 2)
--
-- Stores the private "My goal for this event" selections a user makes on the
-- Prepare page (e.g. Meet founders / Find collaborators / Learn / Offer help).
--
-- Reuse note: "I'm looking for" / "I can offer" are NOT stored here — they are
-- the user's Event Marketplace need/offer posts (event_marketplace_posts), so
-- there's a single source of truth for what appears on the Opportunity Board.
-- This table holds only the multi-select goals, which are private to the user.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_goals (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id   uuid NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  goals      text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE public.event_goals ENABLE ROW LEVEL SECURITY;

-- A user sees and manages ONLY their own goals — these are private prep notes.
DROP POLICY IF EXISTS "EventGoals: owner reads own" ON public.event_goals;
CREATE POLICY "EventGoals: owner reads own"
  ON public.event_goals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "EventGoals: owner inserts own" ON public.event_goals;
CREATE POLICY "EventGoals: owner inserts own"
  ON public.event_goals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "EventGoals: owner updates own" ON public.event_goals;
CREATE POLICY "EventGoals: owner updates own"
  ON public.event_goals FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "EventGoals: owner deletes own" ON public.event_goals;
CREATE POLICY "EventGoals: owner deletes own"
  ON public.event_goals FOR DELETE TO authenticated
  USING (user_id = auth.uid());
