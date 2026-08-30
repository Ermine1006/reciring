-- ============================================================
-- Mutu — Reciprocal Practice + Communities · Phase 1 migration
--
-- Implements docs/practice-reciprocal-phase0.md (Rev. 3) with the
-- founder's approval decisions of 2026-08-26:
--   • General communities/community_members primitive (not a pilot
--     allowlist). Rotman is seeded as the first community.
--   • D1 (strict): only a VERIFIED rotman.utoronto.ca email
--     auto-enrolls. Generic UofT / personal emails need backfill,
--     a future community-scoped invite, or an admin grant.
--   • D2 (B1): one-time founder-attested backfill of all currently
--     ACTIVE profiles into Rotman. Guarded so it can NEVER re-run:
--     it only fires while the Rotman community has zero members.
--     It is not a standing rule — future actives need a real source.
--   • Practice is COMMUNITY-SCOPED end to end: requests, pairings,
--     sessions, tokens, edges, browse, analytics. Cross-community
--     combinations are impossible (RPC checks + composite FKs).
--   • Identity is hidden before mutual acceptance; acceptance
--     creates one NEW matches row (source='practice') born
--     identity-revealed; pre-existing matches are never touched.
--   • All state transitions via SECURITY DEFINER RPCs with
--     auth.uid() checks, FOR UPDATE row locks, expected-state
--     validation, atomic effects. Clients have NO write policies
--     on pairings/sessions/confirmations/tokens.
--   • One verified reciprocal session mints exactly one shared,
--     non-transferable Exchange Token (UNIQUE(session_id)).
--
-- Idempotent: safe to re-run. Run manually in the Supabase SQL
-- Editor AFTER scripts/schema-baseline-dump.sql pre-flight passes.
-- Rollback: see the commented ROLLBACK section at the bottom.
-- No existing table is altered except the additive
-- notifications_type_check re-list (§12).
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- §0. Safety prerequisite: public.blocks
-- The live baseline run (2026-08-26) proved public.blocks does NOT
-- exist in production, even though src/lib/safety.js has been calling
-- it (blockUser/unblockUser/fetchBlockedIds) — the app's Block button
-- has been silently failing. Practice's browse/invite exclusions
-- depend on this table, so it is created here: additive, starts
-- empty, and makes the existing safety feature actually work.
-- Shape matches safety.js exactly.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_user_id),
  CONSTRAINT blocks_distinct_parties CHECK (blocker_id <> blocked_user_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- You manage only your OWN block list (mirrors safety.js usage).
-- Nobody can read who blocked them.
DROP POLICY IF EXISTS "Blocks: read own" ON public.blocks;
CREATE POLICY "Blocks: read own"
  ON public.blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Blocks: create own" ON public.blocks;
CREATE POLICY "Blocks: create own"
  ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Blocks: delete own" ON public.blocks;
CREATE POLICY "Blocks: delete own"
  ON public.blocks FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- §1. Communities — the general membership primitive
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.communities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'member'
                 CHECK (status IN ('member','removed')),
  source       text NOT NULL
                 CHECK (source IN ('institutional_email','backfill','admin','invite')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  removed_at   timestamptz,
  PRIMARY KEY (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_user
  ON public.community_members (user_id) WHERE status = 'member';

ALTER TABLE public.communities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- Community names/slugs are not sensitive; members read their own rows.
-- NO client INSERT/UPDATE/DELETE policies on either table — membership
-- is written only by the D1 trigger, the B1 backfill, and admin/service
-- paths. (Deny-by-default is intentional; do not "fix" it.)
DROP POLICY IF EXISTS "Communities: readable" ON public.communities;
CREATE POLICY "Communities: readable"
  ON public.communities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "CommunityMembers: read own" ON public.community_members;
CREATE POLICY "CommunityMembers: read own"
  ON public.community_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ── §1.1 D1 — strict auto-enrollment trigger ─────────────────
-- Only a VERIFIED rotman.utoronto.ca email auto-enrolls. Generic
-- UofT domains (mail/alum.utoronto.ca) deliberately do NOT.
-- Defensive: never lets an enrollment problem break the email path.
CREATE OR REPLACE FUNCTION public.enroll_rotman_on_verified_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_comm uuid;
BEGIN
  IF NEW.is_verified IS TRUE AND NEW.email ILIKE '%@rotman.utoronto.ca' THEN
    SELECT id INTO v_comm FROM public.communities WHERE slug = 'rotman';
    IF v_comm IS NOT NULL THEN
      BEGIN
        -- ON CONFLICT DO NOTHING also preserves an admin's 'removed'
        -- row: auto-enroll never resurrects a removed member.
        INSERT INTO public.community_members (community_id, user_id, status, source)
        VALUES (v_comm, NEW.user_id, 'member', 'institutional_email')
        ON CONFLICT (community_id, user_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        NULL;  -- e.g. no profiles row yet (ghost user) — skip silently
      END;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enroll_rotman ON public.user_emails;
CREATE TRIGGER trg_enroll_rotman
  AFTER INSERT OR UPDATE OF is_verified ON public.user_emails
  FOR EACH ROW EXECUTE FUNCTION public.enroll_rotman_on_verified_email();


-- ── §1.2 Seed Rotman + D2/B1 one-time attested backfill ──────
INSERT INTO public.communities (slug, name)
VALUES ('rotman', 'Rotman School of Management')
ON CONFLICT (slug) DO NOTHING;

-- FOUNDER ATTESTATION (2026-08-26): the current active Mutu member
-- base was built through Rotman channels; all currently ACTIVE
-- profiles are enrolled once, source='backfill'.
-- GUARD: the INSERT runs ONLY while the Rotman community has zero
-- membership rows. Re-running this migration later (when members
-- exist) inserts nothing — "active Mutu member ⇒ Rotman" must not
-- become a standing rule. Future actives need institutional_email,
-- invite, or admin.
INSERT INTO public.community_members (community_id, user_id, status, source)
SELECT c.id, p.id, 'member', 'backfill'
FROM public.communities c
JOIN public.profiles p ON p.access_status = 'active'
WHERE c.slug = 'rotman'
  AND NOT EXISTS (
    SELECT 1 FROM public.community_members cm
    JOIN public.communities c2 ON c2.id = cm.community_id
    WHERE c2.slug = 'rotman'
  );


-- ── §1.3 Eligibility helpers ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_community_member(p_user uuid, p_community uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = p_community
      AND cm.user_id = p_user
      AND cm.status = 'member');
$$;

-- Practice eligibility = active Mutu access (the canonical rule used
-- by redeem_access_code(): profiles.access_status='active') AND
-- active membership in the SELECTED community. No 'rotman' hard-code:
-- any future community reuses this unchanged.
CREATE OR REPLACE FUNCTION public.practice_is_community_eligible(p_user uuid, p_community uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = p_user AND p.access_status = 'active')
     AND public.is_community_member(p_user, p_community);
$$;


-- ════════════════════════════════════════════════════════════
-- §2. Shared touch trigger for updated_at
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.touch_practice_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


-- ════════════════════════════════════════════════════════════
-- §3. practice_requests + availability windows
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.practice_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  community_id     uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  -- "I want to practise"
  want_types       text[] NOT NULL,
  want_focus       text NOT NULL DEFAULT '',
  -- "I can help with"
  help_types       text[] NOT NULL,
  help_focus       text NOT NULL DEFAULT '',
  help_context     text NOT NULL DEFAULT '',   -- non-identifying by policy (UI-enforced copy)
  -- format
  location_type    text NOT NULL DEFAULT 'virtual'
                     CHECK (location_type IN ('virtual','in_person','either')),
  duration_minutes integer NOT NULL DEFAULT 60
                     CHECK (duration_minutes BETWEEN 30 AND 180),
  timezone         text NOT NULL DEFAULT 'America/Toronto',
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','withdrawn','expired')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_want_types_nonempty  CHECK (cardinality(want_types) > 0),
  CONSTRAINT pr_help_types_nonempty  CHECK (cardinality(help_types) > 0),
  CONSTRAINT pr_want_types_canonical CHECK
    (want_types <@ ARRAY['case','behavioural','technical','product','finance','other']),
  CONSTRAINT pr_help_types_canonical CHECK
    (help_types <@ ARRAY['case','behavioural','technical','product','finance','other'])
);

-- One ACTIVE request per user PER COMMUNITY (founder correction).
CREATE UNIQUE INDEX IF NOT EXISTS uq_practice_request_active
  ON public.practice_requests (user_id, community_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_practice_requests_comm
  ON public.practice_requests (community_id, status);

DROP TRIGGER IF EXISTS trg_touch_practice_requests ON public.practice_requests;
CREATE TRIGGER trg_touch_practice_requests
  BEFORE UPDATE ON public.practice_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_practice_updated_at();

CREATE TABLE IF NOT EXISTS public.practice_availability_windows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.practice_requests(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  CONSTRAINT paw_valid_window CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_paw_request
  ON public.practice_availability_windows (request_id, starts_at);

ALTER TABLE public.practice_requests             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_availability_windows ENABLE ROW LEVEL SECURITY;

-- Stage B: owners only. Stage A browsing NEVER touches these tables —
-- it goes through browse_practice_requests(), which is what keeps the
-- request anonymous. (Intentional; do not add a broader SELECT.)
DROP POLICY IF EXISTS "PracticeReq: owner read" ON public.practice_requests;
CREATE POLICY "PracticeReq: owner read"
  ON public.practice_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "PracticeReq: owner insert" ON public.practice_requests;
CREATE POLICY "PracticeReq: owner insert"
  ON public.practice_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.practice_is_community_eligible(auth.uid(), community_id)
  );

DROP POLICY IF EXISTS "PracticeReq: owner update" ON public.practice_requests;
CREATE POLICY "PracticeReq: owner update"
  ON public.practice_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND public.practice_is_community_eligible(auth.uid(), community_id)
  );
-- No DELETE policy: withdraw instead (history preserved).

DROP POLICY IF EXISTS "PracticeWin: owner read" ON public.practice_availability_windows;
CREATE POLICY "PracticeWin: owner read"
  ON public.practice_availability_windows FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.practice_requests r
                  WHERE r.id = request_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "PracticeWin: owner write" ON public.practice_availability_windows;
CREATE POLICY "PracticeWin: owner write"
  ON public.practice_availability_windows FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.practice_requests r
                       WHERE r.id = request_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "PracticeWin: owner update" ON public.practice_availability_windows;
CREATE POLICY "PracticeWin: owner update"
  ON public.practice_availability_windows FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.practice_requests r
                  WHERE r.id = request_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "PracticeWin: owner delete" ON public.practice_availability_windows;
CREATE POLICY "PracticeWin: owner delete"
  ON public.practice_availability_windows FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.practice_requests r
                  WHERE r.id = request_id AND r.user_id = auth.uid()));


-- ════════════════════════════════════════════════════════════
-- §4. practice_pairings — invitation + mutual consent
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.practice_pairings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id       uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  requester_user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_lo uuid GENERATED ALWAYS AS (LEAST(requester_user_id, addressee_user_id))    STORED,
  user_hi uuid GENERATED ALWAYS AS (GREATEST(requester_user_id, addressee_user_id)) STORED,
  -- Immutable snapshots of the agreed context (incl. community_id).
  -- Written once by send_practice_invitation(); never updated.
  requester_snapshot jsonb NOT NULL,
  addressee_snapshot jsonb NOT NULL,
  status             text NOT NULL DEFAULT 'invited'
                       CHECK (status IN ('invited','accepted','declined','withdrawn','expired')),
  invited_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at        timestamptz,
  declined_at        timestamptz,
  match_id           uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pp_distinct_parties CHECK (requester_user_id <> addressee_user_id)
);

-- One LIVE pairing per unordered pair PER COMMUNITY.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pairing_live
  ON public.practice_pairings (community_id, user_lo, user_hi)
  WHERE status IN ('invited','accepted');
CREATE INDEX IF NOT EXISTS idx_pairings_addressee
  ON public.practice_pairings (addressee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_pairings_requester
  ON public.practice_pairings (requester_user_id, status);

-- Composite-FK target so sessions provably share the pairing's community.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_pairing_id_community') THEN
    ALTER TABLE public.practice_pairings
      ADD CONSTRAINT uq_pairing_id_community UNIQUE (id, community_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_touch_practice_pairings ON public.practice_pairings;
CREATE TRIGGER trg_touch_practice_pairings
  BEFORE UPDATE ON public.practice_pairings
  FOR EACH ROW EXECUTE FUNCTION public.touch_practice_updated_at();

ALTER TABLE public.practice_pairings ENABLE ROW LEVEL SECURITY;
-- NO POLICIES AT ALL (intentional): the base row carries both user ids,
-- which must stay hidden pre-acceptance. Reads go through the
-- my_practice_pairings view; writes go through the RPCs. Deny-by-default
-- is the security boundary — do not add policies here.


-- ════════════════════════════════════════════════════════════
-- §5. practice_sessions — mutual propose→confirm scheduling
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id                 uuid NOT NULL,
  community_id               uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  participant_a_user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_b_user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Round-level role only (who practises first); chosen at the call.
  round1_interviewee_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- proposer
  scheduled_start            timestamptz NOT NULL,
  duration_minutes           integer NOT NULL DEFAULT 60
                               CHECK (duration_minutes BETWEEN 30 AND 180),
  timezone                   text NOT NULL DEFAULT 'America/Toronto',
  location_type              text NOT NULL DEFAULT 'virtual'
                               CHECK (location_type IN ('virtual','in_person')),
  location_detail            text NOT NULL DEFAULT '',
  status                     text NOT NULL DEFAULT 'proposed'
                               CHECK (status IN ('proposed','scheduled','declined','withdrawn',
                                                 'expired','cancelled',
                                                 'completed_pending_confirmation',
                                                 'verified','no_show','disputed')),
  confirmed_at               timestamptz,   -- counterpart confirmed the proposed time
  completed_at               timestamptz,   -- first 'completed' confirmation
  verified_at                timestamptz,   -- both confirmed compatible
  cancelled_at               timestamptz,
  cancelled_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason        text NOT NULL DEFAULT '',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ps_distinct_parties CHECK (participant_a_user_id <> participant_b_user_id),
  CONSTRAINT ps_round1_is_participant CHECK (
    round1_interviewee_user_id IS NULL
    OR round1_interviewee_user_id IN (participant_a_user_id, participant_b_user_id)),
  -- DB-level cross-community guard: a session's community can only be
  -- its pairing's community (composite FK onto uq_pairing_id_community).
  CONSTRAINT ps_pairing_same_community
    FOREIGN KEY (pairing_id, community_id)
    REFERENCES public.practice_pairings (id, community_id) ON DELETE CASCADE
);

-- One live proposal-or-session per pairing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_live
  ON public.practice_sessions (pairing_id)
  WHERE status IN ('proposed','scheduled','completed_pending_confirmation','disputed');
CREATE INDEX IF NOT EXISTS idx_ps_participant_a
  ON public.practice_sessions (participant_a_user_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_ps_participant_b
  ON public.practice_sessions (participant_b_user_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_ps_comm_status
  ON public.practice_sessions (community_id, status, scheduled_start);

-- Composite-FK target so tokens provably share the session's community.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_session_id_community') THEN
    ALTER TABLE public.practice_sessions
      ADD CONSTRAINT uq_session_id_community UNIQUE (id, community_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_touch_practice_sessions ON public.practice_sessions;
CREATE TRIGGER trg_touch_practice_sessions
  BEFORE UPDATE ON public.practice_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_practice_updated_at();

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

-- Sessions exist only post-acceptance (identities already mutual), so
-- participants may read the base rows. Writes: RPCs only (no policies).
DROP POLICY IF EXISTS "PracticeSess: participants read" ON public.practice_sessions;
CREATE POLICY "PracticeSess: participants read"
  ON public.practice_sessions FOR SELECT TO authenticated
  USING (auth.uid() IN (participant_a_user_id, participant_b_user_id));


-- ════════════════════════════════════════════════════════════
-- §6. practice_session_confirmations — insert-only, RPC-written
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.practice_session_confirmations (
  session_id              uuid NOT NULL REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_own_round     boolean NOT NULL DEFAULT false, -- "I practised my round"
  completed_partner_round boolean NOT NULL DEFAULT false, -- "I ran my partner's round + gave feedback"
  outcome                 text NOT NULL
                            CHECK (outcome IN ('completed','no_show','cancelled')),
  no_show_of              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id),
  -- A reciprocal exchange requires BOTH directions attested.
  CONSTRAINT psc_completed_is_reciprocal CHECK (
    outcome <> 'completed' OR (completed_own_round AND completed_partner_round))
);

ALTER TABLE public.practice_session_confirmations ENABLE ROW LEVEL SECURITY;

-- Participants read BOTH rows ("waiting for your partner" UI).
-- No INSERT/UPDATE/DELETE policies: writes only via
-- submit_practice_confirmation(); rows are immutable forever.
DROP POLICY IF EXISTS "PracticeConf: participants read" ON public.practice_session_confirmations;
CREATE POLICY "PracticeConf: participants read"
  ON public.practice_session_confirmations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.practice_sessions s
                  WHERE s.id = session_id
                    AND auth.uid() IN (s.participant_a_user_id, s.participant_b_user_id)));


-- ════════════════════════════════════════════════════════════
-- §7. practice_exchange_tokens — one shared token per verified session
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.practice_exchange_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL,
  community_id   uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  pairing_id     uuid NOT NULL REFERENCES public.practice_pairings(id) ON DELETE CASCADE,
  user_lo        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_hi        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exchange_types text[] NOT NULL DEFAULT '{}',   -- safe skill tags only; never feedback text
  verified_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pet_distinct_parties CHECK (user_lo <> user_hi),
  -- THE idempotent-mint guarantee: at most one token per session, ever.
  CONSTRAINT pet_one_per_session UNIQUE (session_id),
  -- DB-level cross-community guard: token community = session community.
  CONSTRAINT pet_session_same_community
    FOREIGN KEY (session_id, community_id)
    REFERENCES public.practice_sessions (id, community_id) ON DELETE CASCADE
);

-- The relationship-edge key: one edge per community per pair.
CREATE INDEX IF NOT EXISTS idx_pet_edge
  ON public.practice_exchange_tokens (community_id, user_lo, user_hi, verified_at);

ALTER TABLE public.practice_exchange_tokens ENABLE ROW LEVEL SECURITY;

-- Shared: both participants see the same token. No client write path of
-- any kind — non-transferable/non-spendable/non-purchasable by
-- construction; minted only inside submit_practice_confirmation().
DROP POLICY IF EXISTS "PracticeToken: participants read" ON public.practice_exchange_tokens;
CREATE POLICY "PracticeToken: participants read"
  ON public.practice_exchange_tokens FOR SELECT TO authenticated
  USING (auth.uid() IN (user_lo, user_hi));


-- ════════════════════════════════════════════════════════════
-- §8. Views (definer-owned, self-scoped, security_barrier)
-- ════════════════════════════════════════════════════════════

-- Pairings as each participant may see them: counterpart identity is
-- NULL until the pairing is mutually accepted.
CREATE OR REPLACE VIEW public.my_practice_pairings
WITH (security_barrier = true) AS
SELECT p.id,
       p.community_id,
       p.status,
       p.invited_at, p.expires_at, p.accepted_at, p.declined_at,
       (p.requester_user_id = auth.uid())                             AS i_invited,
       CASE WHEN p.requester_user_id = auth.uid()
            THEN p.addressee_snapshot ELSE p.requester_snapshot END   AS their_snapshot,
       CASE WHEN p.requester_user_id = auth.uid()
            THEN p.requester_snapshot ELSE p.addressee_snapshot END   AS my_snapshot,
       CASE WHEN p.status = 'accepted'
            THEN CASE WHEN p.requester_user_id = auth.uid()
                      THEN p.addressee_user_id ELSE p.requester_user_id END
       END                                                            AS counterpart_user_id,
       CASE WHEN p.status = 'accepted' THEN p.match_id END            AS match_id
FROM public.practice_pairings p
WHERE auth.uid() IN (p.requester_user_id, p.addressee_user_id);

-- Live availability of BOTH sides of an ACCEPTED pairing (scheduling UI).
CREATE OR REPLACE VIEW public.practice_pairing_windows
WITH (security_barrier = true) AS
SELECT p.id AS pairing_id,
       r.user_id AS owner_user_id,
       (r.user_id = auth.uid()) AS is_mine,
       w.starts_at, w.ends_at, r.timezone
FROM public.practice_pairings p
JOIN public.practice_requests r
  ON r.community_id = p.community_id
 AND r.status = 'active'
 AND r.user_id IN (p.requester_user_id, p.addressee_user_id)
JOIN public.practice_availability_windows w
  ON w.request_id = r.id AND w.ends_at > now()
WHERE p.status = 'accepted'
  AND auth.uid() IN (p.requester_user_id, p.addressee_user_id);

-- Relationship edges: grouped by community + unordered pair. The same
-- two users have SEPARATE edges in separate communities (never merged).
CREATE OR REPLACE VIEW public.practice_relationship_edges
WITH (security_barrier = true) AS
SELECT t.community_id, t.user_lo, t.user_hi,
       count(*)::int    AS verified_exchange_count,
       min(t.verified_at) AS first_verified_at,
       max(t.verified_at) AS last_verified_at,
       (count(*) > 1)   AS is_repeat_pair
FROM public.practice_exchange_tokens t
WHERE auth.uid() IN (t.user_lo, t.user_hi)
GROUP BY t.community_id, t.user_lo, t.user_hi;

-- Admin/pilot funnel per community. NO grant to authenticated — the
-- founder queries it as service role in the SQL Editor.
CREATE OR REPLACE VIEW public.practice_admin_report AS
SELECT c.slug AS community,
       c.id   AS community_id,
       (SELECT count(*) FROM public.practice_requests r
         WHERE r.community_id = c.id)                                   AS requests_total,
       (SELECT count(*) FROM public.practice_requests r
         WHERE r.community_id = c.id AND r.status = 'active')           AS requests_active,
       (SELECT count(*) FROM public.practice_pairings p
         WHERE p.community_id = c.id AND p.status = 'invited')          AS invitations_open,
       (SELECT count(*) FROM public.practice_pairings p
         WHERE p.community_id = c.id AND p.status = 'accepted')         AS pairings_accepted,
       (SELECT count(*) FROM public.practice_pairings p
         WHERE p.community_id = c.id AND p.status = 'declined')         AS invitations_declined,
       (SELECT count(*) FROM public.practice_sessions s
         WHERE s.community_id = c.id AND s.status = 'scheduled')        AS sessions_scheduled,
       (SELECT count(*) FROM public.practice_sessions s
         WHERE s.community_id = c.id AND s.status = 'verified')         AS sessions_verified,
       (SELECT count(*) FROM public.practice_sessions s
         WHERE s.community_id = c.id AND s.status IN ('no_show','disputed')) AS sessions_problem,
       (SELECT count(*) FROM public.practice_exchange_tokens t
         WHERE t.community_id = c.id)                                   AS tokens_minted,
       (SELECT count(DISTINCT u) FROM (
           SELECT t.user_lo AS u FROM public.practice_exchange_tokens t WHERE t.community_id = c.id
           UNION
           SELECT t.user_hi FROM public.practice_exchange_tokens t WHERE t.community_id = c.id) x)
                                                                        AS unique_verified_participants,
       (SELECT count(*) FROM (
           SELECT 1 FROM public.practice_exchange_tokens t
            WHERE t.community_id = c.id
            GROUP BY t.user_lo, t.user_hi HAVING count(*) > 1) rp)      AS repeat_pairs
FROM public.communities c;


-- ════════════════════════════════════════════════════════════
-- §9. Sanitized, community-scoped browse RPC (Stage A)
-- ════════════════════════════════════════════════════════════
-- Fixed return shape: structurally cannot leak a column it does not
-- declare. NEVER returns user_id, profile ids, names, avatars, emails,
-- or any identity-bearing join key.
CREATE OR REPLACE FUNCTION public.browse_practice_requests(p_community_id uuid)
RETURNS TABLE (
  request_id       uuid,
  community_id     uuid,
  want_types       text[],
  want_focus       text,
  help_types       text[],
  help_focus       text,
  help_context     text,
  location_type    text,
  duration_minutes integer,
  timezone         text,
  windows          jsonb,
  mutual_fit       boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id,
         r.community_id,
         r.want_types, r.want_focus,
         r.help_types, r.help_focus, r.help_context,
         r.location_type, r.duration_minutes, r.timezone,
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'starts_at', w.starts_at, 'ends_at', w.ends_at)
                    ORDER BY w.starts_at), '[]'::jsonb)
            FROM public.practice_availability_windows w
           WHERE w.request_id = r.id AND w.ends_at > now())        AS windows,
         (SELECT (r.help_types && my.want_types) AND (my.help_types && r.want_types)
            FROM public.practice_requests my
           WHERE my.user_id = auth.uid()
             AND my.community_id = p_community_id
             AND my.status = 'active')                             AS mutual_fit
    FROM public.practice_requests r
   WHERE r.community_id = p_community_id
     AND r.status = 'active'
     AND r.user_id <> auth.uid()
     -- eligibility on BOTH sides, in THIS community: a blocked/expired/
     -- de-membered owner vanishes even while their request row is 'active'
     AND public.practice_is_community_eligible(auth.uid(), p_community_id)
     AND public.practice_is_community_eligible(r.user_id, p_community_id)
     -- existing safety system: blocks excluded in both directions, always
     -- (shape confirmed against the schema baseline: blocks(blocker_id, blocked_user_id))
     AND NOT EXISTS (SELECT 1 FROM public.blocks b
                      WHERE (b.blocker_id = auth.uid()  AND b.blocked_user_id = r.user_id)
                         OR (b.blocker_id = r.user_id   AND b.blocked_user_id = auth.uid()))
     -- live pairing, or declined within the 30-day cooldown, in THIS community
     AND NOT EXISTS (SELECT 1 FROM public.practice_pairings p
                      WHERE p.community_id = p_community_id
                        AND p.user_lo = LEAST(r.user_id, auth.uid())
                        AND p.user_hi = GREATEST(r.user_id, auth.uid())
                        AND (p.status IN ('invited','accepted')
                             OR (p.status = 'declined'
                                 AND p.declined_at > now() - interval '30 days')));
$$;


-- ════════════════════════════════════════════════════════════
-- §10. State-transition RPCs
-- All SECURITY DEFINER + SET search_path, auth.uid() role checks,
-- FOR UPDATE row locks, expected-state validation, atomic effects.
-- ════════════════════════════════════════════════════════════

-- ── 10.1 send_practice_invitation ────────────────────────────
-- Addresses a REQUEST, not a user: the caller never supplies or
-- receives the owner's user_id. Snapshots both sides; anonymous
-- notification; generic errors (no identity oracle).
CREATE OR REPLACE FUNCTION public.send_practice_invitation(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target  public.practice_requests%ROWTYPE;
  v_mine    public.practice_requests%ROWTYPE;
  v_pairing public.practice_pairings%ROWTYPE;
  v_req_snap jsonb; v_adr_snap jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_target FROM public.practice_requests
   WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'active' THEN
    RAISE EXCEPTION 'request_unavailable';
  END IF;
  IF v_target.user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;

  -- Both sides eligible in the REQUEST's community (single-community rule).
  IF NOT public.practice_is_community_eligible(auth.uid(), v_target.community_id)
     OR NOT public.practice_is_community_eligible(v_target.user_id, v_target.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  -- Opt-in + reciprocity basis: the caller's own ACTIVE request in the SAME community.
  SELECT * INTO v_mine FROM public.practice_requests
   WHERE user_id = auth.uid() AND community_id = v_target.community_id
     AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'own_request_required'; END IF;

  -- Deterministic two-direction fit.
  IF NOT ((v_target.help_types && v_mine.want_types)
      AND (v_mine.help_types && v_target.want_types)) THEN
    RAISE EXCEPTION 'no_mutual_fit';
  END IF;

  -- Safety: blocks in either direction.
  IF EXISTS (SELECT 1 FROM public.blocks b
              WHERE (b.blocker_id = auth.uid()        AND b.blocked_user_id = v_target.user_id)
                 OR (b.blocker_id = v_target.user_id  AND b.blocked_user_id = auth.uid())) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  -- 30-day decline cooldown, within this community.
  IF EXISTS (SELECT 1 FROM public.practice_pairings p
              WHERE p.community_id = v_target.community_id
                AND p.user_lo = LEAST(auth.uid(), v_target.user_id)
                AND p.user_hi = GREATEST(auth.uid(), v_target.user_id)
                AND p.status = 'declined'
                AND p.declined_at > now() - interval '30 days') THEN
    RAISE EXCEPTION 'already_invited';
  END IF;

  -- Immutable snapshots: the agreed context, incl. the community.
  v_req_snap := jsonb_build_object(
    'community_id', v_mine.community_id,
    'want_types',  to_jsonb(v_mine.want_types),  'want_focus',  v_mine.want_focus,
    'help_types',  to_jsonb(v_mine.help_types),  'help_focus',  v_mine.help_focus,
    'help_context', v_mine.help_context,
    'location_type', v_mine.location_type,
    'duration_minutes', v_mine.duration_minutes, 'timezone', v_mine.timezone,
    'snapshot_at', now(), 'source_request_id', v_mine.id);
  v_adr_snap := jsonb_build_object(
    'community_id', v_target.community_id,
    'want_types',  to_jsonb(v_target.want_types), 'want_focus',  v_target.want_focus,
    'help_types',  to_jsonb(v_target.help_types), 'help_focus',  v_target.help_focus,
    'help_context', v_target.help_context,
    'location_type', v_target.location_type,
    'duration_minutes', v_target.duration_minutes, 'timezone', v_target.timezone,
    'snapshot_at', now(), 'source_request_id', v_target.id);

  BEGIN
    INSERT INTO public.practice_pairings
           (community_id, requester_user_id, addressee_user_id,
            requester_snapshot, addressee_snapshot)
    VALUES (v_target.community_id, auth.uid(), v_target.user_id,
            v_req_snap, v_adr_snap)
    RETURNING * INTO v_pairing;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_invited';   -- generic: no identity in the error
  END;

  -- Anonymous notification: payload carries NO requester identity.
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_target.user_id, 'practice_invitation',
          'New practice invitation',
          'A member of your community wants to practise with you',
          jsonb_build_object('pairing_id', v_pairing.id,
                             'community_id', v_pairing.community_id));

  -- Sanitized return (mirrors my_practice_pairings pre-acceptance).
  RETURN jsonb_build_object(
    'id', v_pairing.id, 'community_id', v_pairing.community_id,
    'status', v_pairing.status, 'invited_at', v_pairing.invited_at,
    'expires_at', v_pairing.expires_at,
    'their_snapshot', v_pairing.addressee_snapshot,
    'my_snapshot',    v_pairing.requester_snapshot);
END $$;

-- ── 10.2 accept_practice_pairing ─────────────────────────────
-- Acceptance IS the mutual match + the contextual identity reveal:
-- one NEW matches row (source='practice') born reveal-accepted.
-- Never reads or modifies any pre-existing match.
CREATE OR REPLACE FUNCTION public.accept_practice_pairing(p_pairing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_match_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF v_pairing.addressee_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_addressee'; END IF;
  IF v_pairing.status <> 'invited' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF v_pairing.expires_at <= now() THEN RAISE EXCEPTION 'invitation_expired'; END IF;

  -- Both sides must STILL be eligible in the pairing's community.
  IF NOT public.practice_is_community_eligible(v_pairing.requester_user_id, v_pairing.community_id)
     OR NOT public.practice_is_community_eligible(v_pairing.addressee_user_id, v_pairing.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;

  -- Exactly one NEW Practice chat, born identity-revealed (contextual
  -- reveal). Same birth-state pattern as openOrCreateDirectMatch().
  INSERT INTO public.matches
         (requester_user_id, helper_user_id, status, source,
          identity_reveal_status, identity_reveal_accepted_at)
  VALUES (v_pairing.requester_user_id, v_pairing.addressee_user_id,
          'active', 'practice', 'accepted', now())
  RETURNING id INTO v_match_id;

  UPDATE public.practice_pairings
     SET status = 'accepted', accepted_at = now(), match_id = v_match_id
   WHERE id = p_pairing_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_pairing.requester_user_id, 'practice_invitation_accepted',
          'Practice invitation accepted',
          'Your practice invitation was accepted — say hi and pick a time',
          jsonb_build_object('pairing_id', p_pairing_id, 'match_id', v_match_id,
                             'community_id', v_pairing.community_id));

  RETURN jsonb_build_object('id', p_pairing_id, 'status', 'accepted',
                            'match_id', v_match_id,
                            'counterpart_user_id', v_pairing.requester_user_id,
                            'community_id', v_pairing.community_id);
END $$;

-- ── 10.3 decline / withdraw invitation ───────────────────────
CREATE OR REPLACE FUNCTION public.decline_practice_invitation(p_pairing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pairing public.practice_pairings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF v_pairing.addressee_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_addressee'; END IF;
  IF v_pairing.status <> 'invited' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  UPDATE public.practice_pairings
     SET status = 'declined', declined_at = now()
   WHERE id = p_pairing_id;
  -- No notification: a decline is silent by design (and anonymous).
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_practice_invitation(p_pairing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pairing public.practice_pairings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF v_pairing.requester_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_requester'; END IF;
  IF v_pairing.status <> 'invited' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  UPDATE public.practice_pairings
     SET status = 'withdrawn'
   WHERE id = p_pairing_id;
END $$;

-- ── 10.4 propose_practice_session ────────────────────────────
CREATE OR REPLACE FUNCTION public.propose_practice_session(
  p_pairing_id      uuid,
  p_scheduled_start timestamptz,
  p_duration_minutes integer  DEFAULT 60,
  p_timezone        text      DEFAULT 'America/Toronto',
  p_location_type   text      DEFAULT 'virtual',
  p_location_detail text      DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairing public.practice_pairings%ROWTYPE;
  v_session public.practice_sessions%ROWTYPE;
  v_other uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_pairing FROM public.practice_pairings
   WHERE id = p_pairing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pairing_not_found'; END IF;
  IF auth.uid() NOT IN (v_pairing.requester_user_id, v_pairing.addressee_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_pairing.status <> 'accepted' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF NOT public.practice_is_community_eligible(auth.uid(), v_pairing.community_id) THEN
    RAISE EXCEPTION 'not_eligible';
  END IF;
  IF p_scheduled_start <= now() THEN RAISE EXCEPTION 'start_in_past'; END IF;

  BEGIN
    INSERT INTO public.practice_sessions
           (pairing_id, community_id,
            participant_a_user_id, participant_b_user_id, created_by_user_id,
            scheduled_start, duration_minutes, timezone,
            location_type, location_detail)
    VALUES (v_pairing.id, v_pairing.community_id,
            v_pairing.requester_user_id, v_pairing.addressee_user_id, auth.uid(),
            p_scheduled_start, p_duration_minutes, p_timezone,
            p_location_type, p_location_detail)
    RETURNING * INTO v_session;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'session_already_live';
  END;

  v_other := CASE WHEN auth.uid() = v_pairing.requester_user_id
                  THEN v_pairing.addressee_user_id ELSE v_pairing.requester_user_id END;
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_other, 'practice_session_proposed',
          'Practice time proposed',
          'Your practice partner proposed a session time — confirm or suggest another',
          jsonb_build_object('pairing_id', p_pairing_id, 'session_id', v_session.id,
                             'community_id', v_pairing.community_id));

  RETURN to_jsonb(v_session);
END $$;

-- ── 10.5 confirm / decline / withdraw a proposal ─────────────
CREATE OR REPLACE FUNCTION public.confirm_practice_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_s public.practice_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_s.created_by_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_confirm_own_proposal'; END IF;
  IF v_s.status <> 'proposed' THEN RAISE EXCEPTION 'invalid_state'; END IF;

  UPDATE public.practice_sessions
     SET status = 'scheduled', confirmed_at = now()
   WHERE id = p_session_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_s.created_by_user_id, 'practice_session_scheduled',
          'Practice session scheduled',
          'Your proposed practice time was confirmed',
          jsonb_build_object('session_id', p_session_id, 'community_id', v_s.community_id));

  RETURN jsonb_build_object('id', p_session_id, 'status', 'scheduled');
END $$;

CREATE OR REPLACE FUNCTION public.decline_practice_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_s public.practice_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_s.created_by_user_id = auth.uid() THEN RAISE EXCEPTION 'use_withdraw'; END IF;
  IF v_s.status <> 'proposed' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  UPDATE public.practice_sessions SET status = 'declined' WHERE id = p_session_id;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_practice_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_s public.practice_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_s.created_by_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_proposer'; END IF;
  IF v_s.status <> 'proposed' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  UPDATE public.practice_sessions SET status = 'withdrawn' WHERE id = p_session_id;
END $$;

-- ── 10.6 cancel a scheduled session (no penalty — pilot rule) ─
CREATE OR REPLACE FUNCTION public.cancel_practice_session(
  p_session_id uuid, p_reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_s public.practice_sessions%ROWTYPE; v_other uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF v_s.status <> 'scheduled' THEN RAISE EXCEPTION 'invalid_state'; END IF;

  UPDATE public.practice_sessions
     SET status = 'cancelled', cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = coalesce(p_reason, '')
   WHERE id = p_session_id;

  v_other := CASE WHEN auth.uid() = v_s.participant_a_user_id
                  THEN v_s.participant_b_user_id ELSE v_s.participant_a_user_id END;
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_other, 'practice_session_cancelled',
          'Practice session cancelled',
          'Your practice partner cancelled the scheduled session',
          jsonb_build_object('session_id', p_session_id, 'community_id', v_s.community_id));
END $$;

-- ── 10.7 submit_practice_confirmation — two-sided completion ──
-- Atomic under the session row lock: inserts the caller's immutable
-- confirmation, derives the session status, and mints the shared
-- Exchange Token when (and only when) both sides verify.
CREATE OR REPLACE FUNCTION public.submit_practice_confirmation(
  p_session_id              uuid,
  p_outcome                 text,
  p_completed_own_round     boolean DEFAULT false,
  p_completed_partner_round boolean DEFAULT false,
  p_no_show_of              uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s       public.practice_sessions%ROWTYPE;
  v_pairing public.practice_pairings%ROWTYPE;
  v_other   uuid;
  v_count   integer;
  v_outcomes text[];
  v_new_status text;
  v_types   text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_outcome NOT IN ('completed','no_show','cancelled') THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;

  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF auth.uid() NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  -- Confirmable states: a scheduled/first-confirmed session, or a
  -- session whose no_show/cancelled status came from the FIRST
  -- confirmation (cancelled_by IS NULL distinguishes it from a
  -- pre-emptive cancel; the partner may still disagree → disputed).
  IF NOT ( v_s.status IN ('scheduled','completed_pending_confirmation')
        OR (v_s.status IN ('no_show','cancelled')
            AND v_s.cancelled_by IS NULL
            AND (SELECT count(*) FROM public.practice_session_confirmations c
                  WHERE c.session_id = p_session_id) = 1) ) THEN
    RAISE EXCEPTION 'invalid_state';
  END IF;
  IF now() < v_s.scheduled_start THEN RAISE EXCEPTION 'session_not_started'; END IF;
  IF p_no_show_of IS NOT NULL
     AND p_no_show_of NOT IN (v_s.participant_a_user_id, v_s.participant_b_user_id) THEN
    RAISE EXCEPTION 'invalid_no_show_of';
  END IF;

  BEGIN
    INSERT INTO public.practice_session_confirmations
           (session_id, user_id, outcome,
            completed_own_round, completed_partner_round, no_show_of)
    VALUES (p_session_id, auth.uid(), p_outcome,
            p_completed_own_round, p_completed_partner_round, p_no_show_of);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_confirmed';
  END;

  SELECT count(*), array_agg(outcome ORDER BY confirmed_at)
    INTO v_count, v_outcomes
    FROM public.practice_session_confirmations
   WHERE session_id = p_session_id;

  IF v_count = 1 THEN
    v_new_status := CASE p_outcome
                      WHEN 'completed' THEN 'completed_pending_confirmation'
                      WHEN 'no_show'   THEN 'no_show'
                      ELSE                  'cancelled'
                    END;
    UPDATE public.practice_sessions
       SET status = v_new_status,
           completed_at = CASE WHEN p_outcome = 'completed' THEN now() ELSE completed_at END
     WHERE id = p_session_id;

    v_other := CASE WHEN auth.uid() = v_s.participant_a_user_id
                    THEN v_s.participant_b_user_id ELSE v_s.participant_a_user_id END;
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_other, 'practice_partner_confirmed',
            'Your practice partner confirmed',
            'Confirm your side to verify the exchange',
            jsonb_build_object('session_id', p_session_id, 'community_id', v_s.community_id));

  ELSE  -- second confirmation: settle the final state
    IF v_outcomes[1] = 'completed' AND v_outcomes[2] = 'completed' THEN
      v_new_status := 'verified';
    ELSIF v_outcomes[1] = v_outcomes[2] THEN
      v_new_status := v_outcomes[1];             -- both no_show / both cancelled
    ELSE
      v_new_status := 'disputed';                -- frozen for manual founder review
    END IF;

    UPDATE public.practice_sessions
       SET status = v_new_status,
           verified_at = CASE WHEN v_new_status = 'verified' THEN now() ELSE verified_at END
     WHERE id = p_session_id;

    IF v_new_status = 'verified' THEN
      -- MINT: exactly one shared token per verified session, in the
      -- session's community. Idempotent via UNIQUE(session_id).
      SELECT * INTO v_pairing FROM public.practice_pairings WHERE id = v_s.pairing_id;
      v_types := ARRAY(
        SELECT DISTINCT t FROM (
          SELECT jsonb_array_elements_text(v_pairing.requester_snapshot->'want_types') AS t
          UNION
          SELECT jsonb_array_elements_text(v_pairing.addressee_snapshot->'want_types')
        ) s ORDER BY t);

      INSERT INTO public.practice_exchange_tokens
             (session_id, community_id, pairing_id, user_lo, user_hi,
              exchange_types, verified_at)
      VALUES (p_session_id, v_s.community_id, v_s.pairing_id,
              LEAST(v_s.participant_a_user_id, v_s.participant_b_user_id),
              GREATEST(v_s.participant_a_user_id, v_s.participant_b_user_id),
              v_types, now())
      ON CONFLICT (session_id) DO NOTHING;

      INSERT INTO public.notifications (user_id, type, title, body, payload)
      SELECT u, 'practice_session_verified',
             'Practice exchange verified',
             'Both of you confirmed — you earned a shared exchange token',
             jsonb_build_object('session_id', p_session_id, 'community_id', v_s.community_id)
        FROM unnest(ARRAY[v_s.participant_a_user_id, v_s.participant_b_user_id]) AS u;
    END IF;
  END IF;

  RETURN jsonb_build_object('session_id', p_session_id, 'status',
           (SELECT status FROM public.practice_sessions WHERE id = p_session_id));
END $$;

-- ── 10.8 practice_sweep_expired — cron/manual housekeeping ────
-- Flips: invitations past expires_at; active requests whose LAST
-- window has passed; unconfirmed proposals past their start time.
-- NEVER touches confirmations (no auto-expiry/auto-verify — pilot rule).
CREATE OR REPLACE FUNCTION public.practice_sweep_expired()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n_pair int; n_req int; n_sess int;
BEGIN
  UPDATE public.practice_pairings
     SET status = 'expired'
   WHERE status = 'invited' AND expires_at <= now();
  GET DIAGNOSTICS n_pair = ROW_COUNT;

  UPDATE public.practice_requests r
     SET status = 'expired'
   WHERE r.status = 'active'
     AND EXISTS (SELECT 1 FROM public.practice_availability_windows w
                  WHERE w.request_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM public.practice_availability_windows w
                      WHERE w.request_id = r.id AND w.ends_at > now());
  GET DIAGNOSTICS n_req = ROW_COUNT;

  UPDATE public.practice_sessions
     SET status = 'expired'
   WHERE status = 'proposed' AND scheduled_start <= now();
  GET DIAGNOSTICS n_sess = ROW_COUNT;

  RETURN jsonb_build_object('pairings_expired', n_pair,
                            'requests_expired', n_req,
                            'proposals_expired', n_sess);
END $$;


-- ════════════════════════════════════════════════════════════
-- §11. Grant hygiene sweep
-- Revoke the Supabase default broad grants; grant back exactly
-- what each surface needs. RLS remains the row-level boundary;
-- these grants are the role-level boundary.
-- ════════════════════════════════════════════════════════════

-- Tables: revoke EVERYTHING first — including from authenticated, which
-- Supabase's default privileges may have granted broadly — then grant
-- back exactly what each surface needs. Without the authenticated
-- revoke, a default-privilege UPDATE/INSERT grant would survive and
-- leave RLS as the only barrier (caught by assertion S4).
REVOKE ALL ON public.blocks,
              public.communities,
              public.community_members,
              public.practice_requests,
              public.practice_availability_windows,
              public.practice_pairings,
              public.practice_sessions,
              public.practice_session_confirmations,
              public.practice_exchange_tokens
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE         ON public.blocks                         TO authenticated;

GRANT SELECT                         ON public.communities                    TO authenticated;
GRANT SELECT                         ON public.community_members              TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.practice_requests              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_availability_windows  TO authenticated;
GRANT SELECT                         ON public.practice_sessions              TO authenticated;
GRANT SELECT                         ON public.practice_session_confirmations TO authenticated;
GRANT SELECT                         ON public.practice_exchange_tokens       TO authenticated;

-- Views.
REVOKE ALL ON public.my_practice_pairings,
              public.practice_pairing_windows,
              public.practice_relationship_edges,
              public.practice_admin_report
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.my_practice_pairings,
                public.practice_pairing_windows,
                public.practice_relationship_edges
  TO authenticated;
-- practice_admin_report: intentionally NO grant — service role only.

-- Functions.
REVOKE ALL ON FUNCTION public.is_community_member(uuid, uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.practice_is_community_eligible(uuid, uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.browse_practice_requests(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_practice_invitation(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_practice_pairing(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_practice_invitation(uuid)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_practice_invitation(uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.propose_practice_session(uuid, timestamptz, integer, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_practice_session(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_practice_session(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_practice_session(uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_practice_session(uuid, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.practice_sweep_expired()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enroll_rotman_on_verified_email()               FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.practice_is_community_eligible(uuid, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.browse_practice_requests(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_practice_invitation(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_practice_pairing(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_practice_invitation(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_practice_invitation(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.propose_practice_session(uuid, timestamptz, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_practice_session(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_practice_session(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_practice_session(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_practice_session(uuid, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.practice_sweep_expired()                     TO service_role;


-- ════════════════════════════════════════════════════════════
-- §12. notifications_type_check — additive re-list
-- Re-lists ALL TEN existing values (verified against the live
-- constraint in schema-baseline-dump.sql §0.3) plus the seven
-- Practice types. If the baseline showed MORE existing values,
-- add them here before running.
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      -- existing values (do not remove any):
      'new_match',
      'new_message',
      'feedback_request',
      'meeting_confirmed',
      'review_received',
      'event_cancelled',
      'event_joined',
      'event_message',
      'event_below_min',
      'marketplace_interest',
      -- practice:
      'practice_invitation',
      'practice_invitation_accepted',
      'practice_session_proposed',
      'practice_session_scheduled',
      'practice_session_cancelled',
      'practice_partner_confirmed',
      'practice_session_verified'
    ));


-- ════════════════════════════════════════════════════════════
-- Done. Now run scripts/practice-assertions.sql (it wraps itself
-- in BEGIN … ROLLBACK) to prove every invariant before letting
-- any client near the feature.
-- ════════════════════════════════════════════════════════════


-- ============================================================
-- ROLLBACK (manual; run only to remove the Practice feature)
-- ============================================================
-- Order matters (reverse dependencies). matches rows with
-- source='practice' are real user conversations and are LEFT IN
-- PLACE — they are inert without these tables. public.blocks is
-- ALSO kept: it is the app's safety table (src/lib/safety.js), not
-- a Practice-only object.
--
-- -- 1. Restore the pre-Practice notifications CHECK (the exact
-- --    ten-value list captured in the baseline):
-- ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
-- ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
--   CHECK (type IN ('new_match','new_message','feedback_request','meeting_confirmed',
--                   'review_received','event_cancelled','event_joined','event_message',
--                   'event_below_min','marketplace_interest'));
-- -- (If practice notifications were already inserted, delete them first:
-- --  DELETE FROM public.notifications WHERE type LIKE 'practice_%';)
--
-- -- 2. Drop RPCs and views:
-- DROP FUNCTION IF EXISTS public.practice_sweep_expired();
-- DROP FUNCTION IF EXISTS public.submit_practice_confirmation(uuid, text, boolean, boolean, uuid);
-- DROP FUNCTION IF EXISTS public.cancel_practice_session(uuid, text);
-- DROP FUNCTION IF EXISTS public.withdraw_practice_session(uuid);
-- DROP FUNCTION IF EXISTS public.decline_practice_session(uuid);
-- DROP FUNCTION IF EXISTS public.confirm_practice_session(uuid);
-- DROP FUNCTION IF EXISTS public.propose_practice_session(uuid, timestamptz, integer, text, text, text);
-- DROP FUNCTION IF EXISTS public.withdraw_practice_invitation(uuid);
-- DROP FUNCTION IF EXISTS public.decline_practice_invitation(uuid);
-- DROP FUNCTION IF EXISTS public.accept_practice_pairing(uuid);
-- DROP FUNCTION IF EXISTS public.send_practice_invitation(uuid);
-- DROP FUNCTION IF EXISTS public.browse_practice_requests(uuid);
-- DROP VIEW IF EXISTS public.practice_admin_report;
-- DROP VIEW IF EXISTS public.practice_relationship_edges;
-- DROP VIEW IF EXISTS public.practice_pairing_windows;
-- DROP VIEW IF EXISTS public.my_practice_pairings;
--
-- -- 3. Drop Practice tables (reverse dependency order):
-- DROP TABLE IF EXISTS public.practice_exchange_tokens;
-- DROP TABLE IF EXISTS public.practice_session_confirmations;
-- DROP TABLE IF EXISTS public.practice_sessions;
-- DROP TABLE IF EXISTS public.practice_pairings;
-- DROP TABLE IF EXISTS public.practice_availability_windows;
-- DROP TABLE IF EXISTS public.practice_requests;
-- DROP FUNCTION IF EXISTS public.practice_is_community_eligible(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.touch_practice_updated_at();
--
-- -- 4. FULL ROLLBACK ONLY — communities is a GENERAL Mutu
-- --    primitive that other features may adopt. Drop it only if
-- --    nothing else uses it and you intend to erase membership:
-- -- DROP TRIGGER IF EXISTS trg_enroll_rotman ON public.user_emails;
-- -- DROP FUNCTION IF EXISTS public.enroll_rotman_on_verified_email();
-- -- DROP FUNCTION IF EXISTS public.is_community_member(uuid, uuid);
-- -- DROP TABLE IF EXISTS public.community_members;
-- -- DROP TABLE IF EXISTS public.communities;
-- ============================================================
