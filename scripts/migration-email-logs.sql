-- ============================================================
-- ReciRing: Email log table
--
-- One row per email send attempt (success OR failure). Used to:
--   - Debug delivery issues
--   - Show users a "your inbox" history (Slice B)
--   - Power admin email center analytics (Slice B)
--
-- INSERTS come exclusively from the Vercel /api/send-email function
-- via the Supabase service-role key (which bypasses RLS). No INSERT
-- policy for `authenticated` — clients cannot fabricate log rows.
--
-- Idempotent. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient   text NOT NULL,
  template    text NOT NULL,
  subject     text,
  status      text NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent','failed','queued')),
  error       text,
  resend_id   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_created
  ON public.email_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_template_created
  ON public.email_logs (template, created_at DESC);


-- ── RLS ──────────────────────────────────────────────────────
-- Users can read their own send history. Inserts are service-role only.

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own emails" ON public.email_logs;
CREATE POLICY "Users read own emails"
  ON public.email_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
