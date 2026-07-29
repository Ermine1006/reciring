-- ReciRing / Mutu — Recognition Engine · Slice 1 (schema only, no UI)
--
-- Two tables behind the recognition loop:
--   • exchange_confirmations — each participant taps "We met"; both rows must
--     exist before either can recognize the other.
--   • recognition_events — the recognition itself (chips + an optional private
--     line), one per (match, giver).
--
-- Column-privacy note: RLS is row-level and cannot hide a single column, but
-- the spec requires the RECEIVER to see chips + created_at and NEVER free_text.
-- So the base table's SELECT policy is giver-only, and receivers read through
-- the `recognition_received` view, which projects only the safe columns. A
-- receiver querying the base table directly gets zero rows; the free_text they
-- can never reach. free_text stays readable to the giver who wrote it and to
-- the service role (for the Phase-2 nightly labeling job).
--
-- References the real matches columns: requester_user_id / helper_user_id.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- ── 1. exchange_confirmations ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.exchange_confirmations (
  match_id     uuid NOT NULL REFERENCES public.matches(id)   ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

ALTER TABLE public.exchange_confirmations ENABLE ROW LEVEL SECURITY;

-- A user confirms only their OWN participation, and only in a match they're in.
DROP POLICY IF EXISTS "ExchConf: confirm own participation" ON public.exchange_confirmations;
CREATE POLICY "ExchConf: confirm own participation"
  ON public.exchange_confirmations FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND auth.uid() IN (m.requester_user_id, m.helper_user_id)
    )
  );

-- Both participants of the match can see BOTH confirmation rows (needed for the
-- "waiting for the other person" → "both confirmed" state).
DROP POLICY IF EXISTS "ExchConf: participants can read" ON public.exchange_confirmations;
CREATE POLICY "ExchConf: participants can read"
  ON public.exchange_confirmations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND auth.uid() IN (m.requester_user_id, m.helper_user_id)
    )
  );
-- No UPDATE / DELETE policies → neither is permitted.


-- ── 2. recognition_events ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recognition_events (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id    uuid NOT NULL REFERENCES public.matches(id)  ON DELETE CASCADE,
  giver_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chips       text[] NOT NULL DEFAULT '{}',
  free_text   text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- one recognition per giver per match (blocks a second attempt at the DB level)
  UNIQUE (match_id, giver_id)
);

-- Aggregating "what people say stood out" queries by receiver_id.
CREATE INDEX IF NOT EXISTS idx_recognition_receiver ON public.recognition_events (receiver_id);
CREATE INDEX IF NOT EXISTS idx_recognition_match    ON public.recognition_events (match_id);

ALTER TABLE public.recognition_events ENABLE ROW LEVEL SECURITY;

-- Insert: the giver recognizes the OTHER participant of a match they're in.
DROP POLICY IF EXISTS "Recog: giver inserts own" ON public.recognition_events;
CREATE POLICY "Recog: giver inserts own"
  ON public.recognition_events FOR INSERT
  TO authenticated
  WITH CHECK (
    giver_id = auth.uid()
    AND receiver_id <> giver_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
        AND giver_id    IN (m.requester_user_id, m.helper_user_id)
        AND receiver_id IN (m.requester_user_id, m.helper_user_id)
    )
  );

-- Select on the base table: giver only (they can read back what they wrote,
-- free_text included). Receivers get NOTHING here — they use the view below,
-- which is how free_text stays unreadable to them.
DROP POLICY IF EXISTS "Recog: giver reads own" ON public.recognition_events;
CREATE POLICY "Recog: giver reads own"
  ON public.recognition_events FOR SELECT
  TO authenticated
  USING (giver_id = auth.uid());
-- No UPDATE / DELETE policies → recognitions are immutable.

-- Receiver-safe projection: chips + created_at only. Owned by the migration
-- role (not security_invoker), so it bypasses the giver-only base RLS but
-- self-scopes to the caller's own received rows. free_text and giver_id are
-- not columns of this view, so a receiver can never read them.
DROP VIEW IF EXISTS public.recognition_received;
CREATE VIEW public.recognition_received AS
  SELECT id, receiver_id, chips, created_at
  FROM public.recognition_events
  WHERE receiver_id = auth.uid();

GRANT SELECT ON public.recognition_received TO authenticated;
