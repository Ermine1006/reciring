-- ============================================================
-- ReciRing: Per-user post interaction tracking for feed ranking
--
-- Backs the 4-tier Discover sort:
--   1. Unseen           (no interaction row)
--   2. Viewed           (user opened the detail modal)
--   3. Swiped-left      (user explicitly skipped)
--   4. Unmatched        (tracked separately via matches.status='unmatched')
--
-- 'matched' is intentionally NOT in the interaction_type enum — matched
-- posts are filtered out entirely via the matches table; storing them
-- here would be a redundant second source of truth.
--
-- Idempotent. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.post_interactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id             uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  interaction_type    text NOT NULL CHECK (interaction_type IN ('viewed','swiped_left')),
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_interactions_user
  ON public.post_interactions (user_id);


-- ── RLS ──────────────────────────────────────────────────────
-- Users only see / write their own rows. No DELETE policy by design
-- (clearing your history isn't an MVP feature; admin can clean up).

ALTER TABLE public.post_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own interactions" ON public.post_interactions;
CREATE POLICY "Users read own interactions"
  ON public.post_interactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own interactions" ON public.post_interactions;
CREATE POLICY "Users insert own interactions"
  ON public.post_interactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own interactions" ON public.post_interactions;
CREATE POLICY "Users update own interactions"
  ON public.post_interactions FOR UPDATE
  TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── Sanity check ─────────────────────────────────────────────
--   SELECT count(*) FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='post_interactions';
--   -- expect 1
