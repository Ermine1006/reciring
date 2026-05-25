-- ============================================================
-- ReciRing: Mutual identity reveal
-- Run this in the Supabase SQL Editor.
--
-- Adds a consent-based identity-reveal flow to matches:
--   - status: 'none' (default), 'pending', 'accepted', 'declined'
--   - requested_by: who initiated the reveal
--   - requested_at / accepted_at: audit timestamps
--
-- Privacy enforcement is client-side (peer name/email is only displayed
-- after status='accepted'). The profiles SELECT policy stays open, in
-- line with the existing leaderboard / ranking flows that read peer
-- stats. If you later need DB-level email privacy, gate the column
-- via a view or RPC — not by tightening profiles SELECT broadly.
-- ============================================================

-- ── 1. Columns ───────────────────────────────────────────────

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS identity_reveal_status       text        NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS identity_reveal_requested_by uuid,
  ADD COLUMN IF NOT EXISTS identity_reveal_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_reveal_accepted_at  timestamptz;

-- CHECK constraint on allowed status values. Drop-and-recreate so re-runs
-- pick up changes if we extend the enum later.
ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_identity_reveal_status_check;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_identity_reveal_status_check
    CHECK (identity_reveal_status IN ('none','pending','accepted','declined'));


-- ── 2. Trigger: enforce who can transition what ──────────────
-- Only the OTHER participant (not the requester) may accept/decline a
-- pending request. Once 'accepted', the state is terminal. This blocks
-- a client bug where the requester self-accepts and exposes the peer
-- without consent.

CREATE OR REPLACE FUNCTION public.guard_identity_reveal()
RETURNS trigger AS $$
BEGIN
  -- Skip if reveal fields didn't change
  IF NEW.identity_reveal_status IS NOT DISTINCT FROM OLD.identity_reveal_status THEN
    RETURN NEW;
  END IF;

  -- Terminal: never leave 'accepted'
  IF OLD.identity_reveal_status = 'accepted' THEN
    RAISE EXCEPTION 'Identity reveal is already accepted and cannot be changed';
  END IF;

  -- Transitioning TO 'pending' — caller must be a participant (RLS covers)
  -- and must set themselves as requested_by.
  IF NEW.identity_reveal_status = 'pending' THEN
    IF NEW.identity_reveal_requested_by IS NULL
       OR NEW.identity_reveal_requested_by <> auth.uid() THEN
      RAISE EXCEPTION 'identity_reveal_requested_by must match auth.uid()';
    END IF;
    IF NEW.identity_reveal_requested_by NOT IN (NEW.requester_user_id, NEW.helper_user_id) THEN
      RAISE EXCEPTION 'Only match participants can request reveal';
    END IF;
    RETURN NEW;
  END IF;

  -- Transitioning TO 'accepted' or 'declined' — only the OTHER participant
  IF NEW.identity_reveal_status IN ('accepted','declined') THEN
    IF OLD.identity_reveal_status <> 'pending' THEN
      RAISE EXCEPTION 'Can only accept/decline a pending reveal request';
    END IF;
    IF auth.uid() IS NULL OR auth.uid() = OLD.identity_reveal_requested_by THEN
      RAISE EXCEPTION 'The requester cannot respond to their own reveal request';
    END IF;
    IF auth.uid() NOT IN (NEW.requester_user_id, NEW.helper_user_id) THEN
      RAISE EXCEPTION 'Only match participants can respond';
    END IF;
    RETURN NEW;
  END IF;

  -- Transitioning back to 'none' (reset after decline) — either party
  IF NEW.identity_reveal_status = 'none' THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_identity_reveal ON public.matches;
CREATE TRIGGER trg_guard_identity_reveal
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.guard_identity_reveal();


-- ── 3. Realtime ──────────────────────────────────────────────
-- The matches table should already be in the supabase_realtime
-- publication (from migration-unmatch). REPLICA IDENTITY FULL is
-- already set there too. Re-asserting both is safe / idempotent.

ALTER TABLE public.matches REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matches'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.matches';
  END IF;
END $$;
