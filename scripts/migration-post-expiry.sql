-- ReciRing / Mutu — Optional post expiry
--
-- Beta feedback: "This post is for a date already passed … add an expiry date
-- so expired information falls off." Posts get an optional `expires_at`; the
-- Discover feed hides posts whose expiry is in the past. NULL = never expires
-- (unchanged behaviour for existing posts).
--
-- No RLS change: the existing posts policies already govern read/write. Safe
-- to re-run.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Speeds up "not expired" feed filtering once there are many posts.
CREATE INDEX IF NOT EXISTS idx_posts_expires_at
  ON public.posts (expires_at)
  WHERE expires_at IS NOT NULL;
