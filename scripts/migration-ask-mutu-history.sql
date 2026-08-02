-- ReciRing / Mutu — Ask Mutu conversation history
--
-- Persists the user's Ask Mutu chat so it survives closing the sheet / reload.
-- Storage only — no AI cost. Only asking a NEW question calls the model.
-- Author-only (RLS). Safe to re-run.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ask_mutu_messages (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','mutu')),
  text       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ask_mutu_user ON public.ask_mutu_messages (user_id, created_at);

ALTER TABLE public.ask_mutu_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AskMutu: owner reads own" ON public.ask_mutu_messages;
CREATE POLICY "AskMutu: owner reads own"
  ON public.ask_mutu_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "AskMutu: owner inserts own" ON public.ask_mutu_messages;
CREATE POLICY "AskMutu: owner inserts own"
  ON public.ask_mutu_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "AskMutu: owner deletes own" ON public.ask_mutu_messages;
CREATE POLICY "AskMutu: owner deletes own"
  ON public.ask_mutu_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());
