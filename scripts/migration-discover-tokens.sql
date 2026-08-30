-- ============================================================
-- PROPOSAL (do not run without founder approval)
-- Mutu — mint a shared Token for a verified DISCOVER exchange
--
--   A moving Token means: you both completed and verified a
--   useful exchange.
--
-- Until now only a verified Together session minted a Token, so a
-- Discover exchange that BOTH people confirmed ("We met") thickened
-- the relationship line but had nothing moving on it. Founder
-- decision: those are real completed exchanges and deserve the same
-- shared Token.
--
-- WHAT MINTS
--   · a non-practice match where BOTH participants have an
--     exchange_confirmations row  →  exactly ONE shared token
--   · practice sessions keep minting exactly as before
--
-- WHAT DOES NOT MINT (deliberate)
--   · a mutually confirmed EVENT encounter. Both people confirmed
--     they MET; nobody confirmed a completed exchange. Meeting is
--     not helping, and the Token must keep one meaning. (An event
--     that leads to a match with two confirmations mints through
--     the rule above, like any other Discover exchange.)
--   · a unilateral confirmation, a swipe, a reveal on its own,
--     attendance, or an invitation.
--
-- SCOPING
--   matches carry no community, so the token is minted into the one
--   community where BOTH people are active members. If that is
--   ambiguous (more than one shared community) nothing is minted and
--   the exchange simply stays token-free — today Mutu runs a single
--   community, so this is a forward guard, not a live limitation.
--
-- RUN THIS BEFORE scripts/migration-community-network-graph.sql —
-- that file's read model filters tokens by the `source` column this
-- migration adds.
--
-- Idempotent. Includes a backfill of existing verified Discover
-- exchanges (real data, derived from confirmations that already
-- exist — it will raise some members' token counts the first time
-- it runs). Rollback at the bottom.
-- Assertions: scripts/practice-assertions-discover-tokens.sql
-- ============================================================

-- ── 1. The token table learns a second, equally real source ──────
ALTER TABLE public.practice_exchange_tokens
  ALTER COLUMN session_id DROP NOT NULL,
  ALTER COLUMN pairing_id DROP NOT NULL;

ALTER TABLE public.practice_exchange_tokens
  ADD COLUMN IF NOT EXISTS source   text NOT NULL DEFAULT 'practice',
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_source_valid') THEN
    ALTER TABLE public.practice_exchange_tokens
      ADD CONSTRAINT pet_source_valid CHECK (source IN ('practice', 'discover'));
  END IF;
  -- every token still points at the thing that produced it
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_source_shape') THEN
    ALTER TABLE public.practice_exchange_tokens
      ADD CONSTRAINT pet_source_shape CHECK (
        (source = 'practice' AND session_id IS NOT NULL AND pairing_id IS NOT NULL)
        OR
        (source = 'discover' AND match_id IS NOT NULL)
      );
  END IF;
END $$;

-- THE idempotent-mint guarantee for the new source: at most one
-- token per match, ever. (UNIQUE(session_id) still covers practice;
-- NULLs there are distinct, so Discover rows never collide.)
CREATE UNIQUE INDEX IF NOT EXISTS pet_one_per_match
  ON public.practice_exchange_tokens (match_id) WHERE match_id IS NOT NULL;

-- ── 2. The mint ──────────────────────────────────────────────────
-- SECURITY DEFINER and never granted to clients: minting stays a
-- server-side consequence of two confirmations, exactly like the
-- practice path. Non-transferable, non-spendable, non-purchasable.
CREATE OR REPLACE FUNCTION public.mint_discover_token(p_match_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m        record;
  v_lo     uuid;
  v_hi     uuid;
  v_comm   uuid;
  v_at     timestamptz;
  v_token  uuid;
BEGIN
  SELECT id, requester_user_id, helper_user_id, source, status
    INTO m
  FROM public.matches
  WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF coalesce(m.source, 'community') = 'practice' THEN RETURN NULL; END IF;
  IF m.requester_user_id = m.helper_user_id THEN RETURN NULL; END IF;

  v_lo := LEAST(m.requester_user_id, m.helper_user_id);
  v_hi := GREATEST(m.requester_user_id, m.helper_user_id);

  -- both sides must have confirmed the completed exchange
  SELECT max(c.confirmed_at) INTO v_at
  FROM public.exchange_confirmations c
  WHERE c.match_id = p_match_id
    AND c.user_id IN (m.requester_user_id, m.helper_user_id)
  HAVING count(DISTINCT c.user_id) = 2;
  IF v_at IS NULL THEN RETURN NULL; END IF;

  -- both must be active, and share EXACTLY one community
  IF (SELECT count(*) FROM public.profiles p
       WHERE p.id IN (v_lo, v_hi) AND p.access_status = 'active') <> 2 THEN
    RETURN NULL;
  END IF;
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(x.community_id))[1] END INTO v_comm
  FROM (
    SELECT DISTINCT cm.community_id
    FROM public.community_members cm
    JOIN public.community_members cm2
      ON cm2.community_id = cm.community_id AND cm2.user_id = v_hi AND cm2.status = 'member'
    WHERE cm.user_id = v_lo AND cm.status = 'member'
  ) x;
  IF v_comm IS NULL THEN RETURN NULL; END IF;          -- none, or ambiguous

  INSERT INTO public.practice_exchange_tokens
         (session_id, pairing_id, match_id, source, community_id,
          user_lo, user_hi, exchange_types, verified_at)
  VALUES (NULL, NULL, p_match_id, 'discover', v_comm,
          v_lo, v_hi, '{}', v_at)
  ON CONFLICT (match_id) WHERE match_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_token;

  RETURN v_token;
END $$;

REVOKE ALL ON FUNCTION public.mint_discover_token(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Mint at the moment the second confirmation lands ──────────
CREATE OR REPLACE FUNCTION public.tg_mint_discover_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.mint_discover_token(NEW.match_id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_mint_discover_token ON public.exchange_confirmations;
CREATE TRIGGER trg_mint_discover_token
  AFTER INSERT ON public.exchange_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.tg_mint_discover_token();

-- ── 4. Backfill exchanges that were already verified by both ─────
-- Derived from confirmations that already exist. Nothing invented.
INSERT INTO public.practice_exchange_tokens
       (session_id, pairing_id, match_id, source, community_id,
        user_lo, user_hi, exchange_types, verified_at)
SELECT NULL, NULL, m.id, 'discover', shared.community_id,
       LEAST(m.requester_user_id, m.helper_user_id),
       GREATEST(m.requester_user_id, m.helper_user_id),
       '{}', conf.verified_at
FROM public.matches m
JOIN LATERAL (
  SELECT max(c.confirmed_at) AS verified_at
  FROM public.exchange_confirmations c
  WHERE c.match_id = m.id
    AND c.user_id IN (m.requester_user_id, m.helper_user_id)
  HAVING count(DISTINCT c.user_id) = 2
) conf ON true
JOIN LATERAL (
  -- exactly one shared community, or nothing at all
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(x.community_id))[1] END AS community_id
  FROM (
    SELECT DISTINCT cm.community_id
    FROM public.community_members cm
    JOIN public.community_members cm2
      ON cm2.community_id = cm.community_id
     AND cm2.user_id = GREATEST(m.requester_user_id, m.helper_user_id)
     AND cm2.status = 'member'
    WHERE cm.user_id = LEAST(m.requester_user_id, m.helper_user_id)
      AND cm.status = 'member'
  ) x
) shared ON shared.community_id IS NOT NULL
JOIN public.profiles p1 ON p1.id = m.requester_user_id AND p1.access_status = 'active'
JOIN public.profiles p2 ON p2.id = m.helper_user_id    AND p2.access_status = 'active'
WHERE coalesce(m.source, 'community') <> 'practice'
  AND m.requester_user_id <> m.helper_user_id
ON CONFLICT (match_id) WHERE match_id IS NOT NULL DO NOTHING;

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP TRIGGER IF EXISTS trg_mint_discover_token ON public.exchange_confirmations;
-- DROP FUNCTION IF EXISTS public.tg_mint_discover_token();
-- DROP FUNCTION IF EXISTS public.mint_discover_token(uuid);
-- DELETE FROM public.practice_exchange_tokens WHERE source = 'discover';
-- DROP INDEX IF EXISTS public.pet_one_per_match;
-- ALTER TABLE public.practice_exchange_tokens
--   DROP CONSTRAINT IF EXISTS pet_source_shape,
--   DROP CONSTRAINT IF EXISTS pet_source_valid,
--   DROP COLUMN IF EXISTS match_id,
--   DROP COLUMN IF EXISTS source;
-- ALTER TABLE public.practice_exchange_tokens
--   ALTER COLUMN session_id SET NOT NULL,
--   ALTER COLUMN pairing_id SET NOT NULL;
-- ============================================================
