-- ============================================================
-- ReciRing: Email subscription audit table
--
-- One row per subscribe / unsubscribe event for compliance and
-- analytics. The current per-user state still lives on
-- profiles.email_subscribed for fast reads — this table is the
-- append-only history of how that flag got to its current value.
--
-- Why both: profiles.email_subscribed is denormalized for query
-- speed (every broadcast does a single column read). This table
-- holds the audit log (who, when, why) required for CAN-SPAM and
-- for future opt-in proof.
--
-- Sources:
--   user_unsubscribe_link  — clicked link in email
--   user_settings_toggle   — toggled in profile settings
--   admin_resubscribe      — admin reactivated via dashboard
--   admin_unsubscribe      — admin opted out (rare)
--
-- Idempotent. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('subscribed','unsubscribed')),
  source      text NOT NULL CHECK (source IN (
                'user_unsubscribe_link',
                'user_settings_toggle',
                'admin_resubscribe',
                'admin_unsubscribe'
              )),
  acted_by    uuid,  -- the user who performed the action; null for system events
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_subscriptions_user_created
  ON public.email_subscriptions (user_id, created_at DESC);


-- ── RLS ──────────────────────────────────────────────────────
-- Users see their own subscription history and can insert events
-- they perform on themselves (settings toggle). Admin / link
-- endpoints write via the service-role key, bypassing RLS.

ALTER TABLE public.email_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own subscription events" ON public.email_subscriptions;
CREATE POLICY "Users read own subscription events"
  ON public.email_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own subscription events" ON public.email_subscriptions;
CREATE POLICY "Users insert own subscription events"
  ON public.email_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND acted_by = auth.uid()
    AND source = 'user_settings_toggle'
  );
