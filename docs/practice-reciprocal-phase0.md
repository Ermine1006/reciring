# Mutu — Reciprocal Practice + Relationship Capital · Phase 0 Report (Rev. 3)

**Date:** 2026-08-26 (Rev. 3 — Rev. 2 approved in product direction; mandatory scope corrections applied)
**Scope:** Architecture only. No application code edited, no SQL run, no Supabase or production data touched. Analysis of membership composition below reads only the local `analytics_input/` CSV snapshots already committed to the repo.
**Supersedes:** Rev. 1–2 of this document, and §6–§8 of `docs/practice-workflow-audit.md` (2026-08-25).

> **⚠ Phase 1 gate: STOPPED.** The founder's condition — "prepare the Phase 1 migration files only if the live schema provides a reliable Rotman/community-membership rule" — is **not met**. Inspection of the schema and the production snapshot (§4) shows no reliable structured Rotman-affiliation signal exists, and 28 of 43 active members have no institutional record at all. Per instruction, this report returns the proposed general community-membership model (§4.3) and stops. No migration files were written.

**What changed in Rev. 3** (founder corrections on Rev. 2):

| # | Correction | Where applied |
|---|---|---|
| 1 | Eligibility ≠ `access_status='active'` alone; must prove Rotman affiliation via a structured signal; if none exists, stop and propose a general community primitive | §4 (findings + proposal), §1 |
| 2 | Eligibility applies to **both sides** of browse — an ineligible request owner must vanish even if their request is `active` | §3 (RPC predicate), §9 (P10) |
| 3 | Rev. 2 visibility flow confirmed unchanged | §2 |
| 4 | Declined pair: **30-day cooldown**, not permanent exclusion; blocks stay excluded indefinitely via the existing safety system | §3, §9 (P11) |
| 5 | Duplicate ordinary + Practice conversations accepted; **`Practice` badge** required in Matches and ChatView | §8 |
| 6 | Browse surface hardening: fixed-shape SECURITY DEFINER RPC, `SET search_path = public`, explicit REVOKE from `public`/`anon`, no identity-bearing columns, tests | §3, §5.2, §9 |
| 7 | Open items resolved (blocked-table names at baseline step; no workshop gate; no allowlist; opt-in by request creation; founder runs all SQL manually) | §11 |

---

## 1. Pilot scope — Rotman Consulting Peer Practice Pilot

- **Eligibility (corrected):** all **approved Rotman community members** interested in consulting practice. This is *narrower* than "active Mutu member": `profiles.access_status='active'` proves Mutu access, but invite codes, premium, and future community expansion can admit non-Rotman users — so Practice eligibility is `active` **AND** structured Rotman community membership (§4). No workshop gate, no invitation list, **no `practice_pilot_members` table** — membership is a general Mutu community primitive.
- **Opt-in by construction:** a user becomes discoverable in Practice by creating an active consulting Practice request, and stops being discoverable when it is paused/withdrawn/expired. Browsing is open to all eligible Rotman members even without a request; *inviting* requires an active request of your own.
- **Use case:** reciprocal consulting interview preparation — consulting **case** and **behavioural/fit** interviews.
- **Taxonomy extensible, UI focused:** `src/data/practiceOptions.js` and the DB CHECK carry the full canonical list (`case`, `behavioural`, `technical`, `product`, `finance`, `other`); the pilot composer surfaces only `case` and `behavioural` with consulting-oriented prompts. Widening later is a UI change, not a migration.
- `isPracticeEnabled()` is a plain rollout switch (ship dark → flip on), not an allowlist.

### 1.1 Gap analysis (established in Rev. 1, unchanged)

The repo contains **zero Practice code and zero `practice_*` SQL** — the obsolete one-way slot model (`practice_slots`, `host_role`, `interviewer_user_id`/`candidate_user_id`, `book_practice_slot()`) exists only as a proposal in the old audit and was never implemented. Green-field build. Surviving foundations: the `exchange_confirmations` row-per-party pattern, status-derived-by-trusted-logic, `text`+CHECK/`timestamptz` conventions, reuse of `matches`/`messages`/`ChatView`, `notifications`, `funnel_events`, email, cron, `relationships.js`, and all audit §10 risks (no staging, `scripts/` drift, the `notifications_type_check` landmine).

---

## 2. Identity data flow: anonymous before match, revealed after (confirmed)

### 2.1 The three visibility stages

```
STAGE A — Eligible Rotman browser (practice_is_rotman_eligible(auth.uid()), §4)
  reads ONLY the sanitized browse RPC:
    request_id · want (types + focus) · can-help (types + focus + non-identifying
    context) · consulting category · EXACT availability windows · timezone ·
    virtual/in-person · duration · mutual-fit flag vs their own request
  NEVER: name, avatar, user_id, email, or any identity-bearing join key.
  UI renders AnonymousAvatar (the platform's existing bean rule).

STAGE B — Request owner
  sees/manages their own complete request, windows, invitations, identity
  (base-table RLS: user_id = auth.uid()).

STAGE C — Mutually accepted Practice pair (pairing.status='accepted')
  each sees: the other's identity (name, avatar, permitted profile via the existing
  fetchPeerProfile path) · complete pairing info incl. both snapshots · each
  other's live windows · scheduling proposals · the Practice-specific chat ·
  session + confirmation state · the shared Exchange Token after verification.
```

### 2.2 End-to-end flow with the reveal point marked

```
A creates request ──▶ anonymous card enters browse (Stage A for all eligible members)
B browses ──▶ anonymous card + two-direction fit + exact windows
B invites ──▶ send_practice_invitation(request_id)   ← B addresses a REQUEST, not a user
A sees invitation ──▶ B's snapshot, still ANONYMOUS in both directions
A accepts ──▶ accept_practice_pairing(pairing_id) — atomic:
      1. exactly one NEW matches row, source='practice'
      2. identity_reveal_status='accepted' on that new row ONLY
      3. pairing → accepted  ⇒ identities mutually visible (Stage C)
      4. Practice ChatView opens on the new match (badged "Practice")
      5. pair proceeds to mutual propose→confirm scheduling
A declines ──▶ declined; B never learns who A was. 30-DAY COOLDOWN: neither sees the
      other's anonymous request; after 30 days it may reappear if both still have
      active, mutually compatible requests (§3). Blocked users: excluded forever
      via the existing safety system.
14 days pass unanswered ──▶ expired (re-invite allowed; spam bounded by the 14-day cycle)
```

**No identity-reveal request step exists inside Practice** — acceptance *is* the reveal, contextual to the new Practice match only. Pre-existing anonymous or ordinary matches between the same two users are never read, revealed, or modified (§8).

### 2.3 Anonymity leak audit

| Leak vector | Closure |
|---|---|
| `SELECT user_id FROM practice_requests` by a browser | Base SELECT is owner-only; browsers get zero rows; the browse RPC's fixed return shape has no identity column |
| Windows → owner join | Windows base SELECT owner-only; browse windows arrive pre-aggregated inside the RPC row, keyed by `request_id` only |
| Pairing row exposes user ids pre-acceptance | No client SELECT policy on `practice_pairings`; reads via `my_practice_pairings`, which nulls counterpart identity until `accepted` |
| Invitation notification names the inviter | RPC inserts an anonymous notification; payload = `{pairing_id}` only |
| RPC return values | `send_practice_invitation` returns the sanitized pairing shape |
| Error-message oracle | Browse excludes pairs in cooldown/live states, so the unique index is unreachable from normal flow; residual conflicts map to a generic `already_invited` |
| `anon` / `public` roles | Explicit `REVOKE` on every practice view and RPC; `GRANT` only to `authenticated`, with the Rotman check enforced in-body (§3) |
| Realtime | No realtime publication on any `practice_*` table; invitation UX rides the existing notifications bell |
| Ineligible request owners lingering | Both-sides eligibility check in the browse predicate (§3) — a blocked/expired owner vanishes even while their request row still says `active` |
| Self-authored context text | `help_context`/`want_focus` are user-written; composer copy instructs "don't include your name/email"; residual risk accepted (same class as anonymous `posts.need_text`) |

---

## 3. The sanitized browse surface (hardened per correction 6)

**Chosen form: a fixed-shape, self-scoped `SECURITY DEFINER` RPC** (functions support `SET search_path`, explicit `REVOKE EXECUTE`, and a declared `RETURNS TABLE` shape that structurally cannot leak a column that isn't declared). The supporting pairing/edge reads stay definer-owned self-scoped views (the proven `recognition_received` pattern) with the same grant hygiene.

```sql
create or replace function public.browse_practice_requests()
returns table (
  request_id       uuid,
  want_types       text[],  want_focus  text,
  help_types       text[],  help_focus  text,  help_context text,
  location_type    text,    duration_minutes int,  timezone text,
  windows          jsonb,   -- [{starts_at, ends_at}, …], future windows only
  mutual_fit       boolean  -- null when the caller has no active request
)
language sql stable
security definer
set search_path = public
as $$
  select r.id,
         r.want_types, r.want_focus,
         r.help_types, r.help_focus, r.help_context,
         r.location_type, r.duration_minutes, r.timezone,
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'starts_at', w.starts_at, 'ends_at', w.ends_at)
                   order by w.starts_at), '[]'::jsonb)
            from public.practice_availability_windows w
           where w.request_id = r.id and w.ends_at > now()),
         (select (r.help_types && my.want_types) and (my.help_types && r.want_types)
            from public.practice_requests my
           where my.user_id = auth.uid() and my.status = 'active')
    from public.practice_requests r
   where r.status = 'active'
     and r.user_id <> auth.uid()
     -- eligibility on BOTH sides (correction 2): a blocked/expired/no-longer-
     -- Rotman owner disappears even while their request row is still 'active'
     and public.practice_is_rotman_eligible(auth.uid())
     and public.practice_is_rotman_eligible(r.user_id)
     -- existing safety system: blocks excluded in both directions, forever
     -- (exact table/column names resolved at the schema-baseline step, §11)
     and not exists ( /* blocked_users either direction */ )
     -- live pairing, or declined within the 30-day cooldown (correction 4)
     and not exists (select 1 from public.practice_pairings p
                      where p.user_lo = least(r.user_id, auth.uid())
                        and p.user_hi = greatest(r.user_id, auth.uid())
                        and (p.status in ('invited','accepted')
                             or (p.status = 'declined'
                                 and p.declined_at > now() - interval '30 days')));
$$;

revoke all on function public.browse_practice_requests() from public, anon;
grant execute on function public.browse_practice_requests() to authenticated;
```

- **Grant hygiene applies to every practice surface:** each view/RPC gets `REVOKE … FROM public, anon; GRANT … TO authenticated;`. Postgres cannot grant "only to Rotman members" at role level (all signed-in users share the `authenticated` role), so the Rotman gate is the in-body `practice_is_rotman_eligible(auth.uid())` predicate — ineligible authenticated callers get zero rows / a clean error, and this is asserted in §9.
- **Cooldown mechanics:** `uq_pairing_live` covers only `invited`/`accepted`, so after the 30-day window a fresh invitation simply creates a new pairing row; the old `declined` row remains as history. `withdrawn`/`expired` pairings impose no cooldown (a withdrawal is the inviter's own act; an expired invite can be retried at most once per 14 days).
- The plain-language two-direction explanation is composed client-side in `src/lib/practiceMatching.js` from the returned arrays + the caller's own request — deterministic, no AI ranking, pure-function-testable.
- **Write path** unchanged from Rev. 2: `send_practice_invitation(p_request_id)` resolves the owner server-side (caller never supplies or receives a `user_id`), asserts both-side eligibility, asserts the caller's own active request and mutual fit, snapshots both sides (§7), sets `expires_at = now() + interval '14 days'`, and emits the anonymous notification.
- **Stage-C reads:** `my_practice_pairings` (counterpart identity nulled until `accepted`) and `practice_pairing_windows` (both sides' live windows, `accepted` only) — definer views, self-scoped, same revoke/grant treatment.

---

## 4. Rotman eligibility: findings, and the proposed community-membership model

### 4.1 What the schema and access logic actually provide (inspected, not guessed)

| Candidate signal | Verdict as a Rotman boundary |
|---|---|
| `profiles.access_status='active'` (used verbatim in existing SECURITY DEFINER SQL, [migration-access-codes.sql:224](scripts/migration-access-codes.sql)) | Proves **Mutu access only**. Invite codes, premium, and future expansion admit non-Rotman users. Necessary but not sufficient |
| `profiles.program` | Free text, self-reported, nullable — **banned as a security boundary** (founder instruction; correct) |
| `user_emails` rows with `email_type='institutional' AND is_verified` / `profiles.institutional_verified_at` | Structured and verified, but (a) derived from the `INSTITUTIONAL_DOMAINS` list in [src/config/auth.js](src/config/auth.js), which is **U of T-wide** (`utoronto.ca`, `mail.utoronto.ca`, `alum.utoronto.ca`), not Rotman-specific; and (b) **misses invited/legacy Rotman members on personal email** — exactly the case the founder flagged |
| `profiles.member_type` (`student`/`alumni`/`premium`/`invited`/`admin`) | Status, not affiliation |
| A community/cohort/campus table | **Does not exist anywhere in the schema** |

### 4.2 Documented membership composition (production snapshot, `analytics_input/` refresh of 2026-08-12)

43 profiles have `access_status='active'`. Of these:

- **15 have a verified institutional email** — 9 `mail.utoronto.ca` (U of T-wide), 6 `rotman.utoronto.ca` (Rotman-specific).
- **28 of 43 (65%) have no institutional record at all** — 26 personal Gmail + 2 internal domains, almost all `access_type='legacy'` (grandfathered before the access-model migration).

**Conclusion the founder asked to have documented:** it is *plausible* that today's 43 active members are all Rotman-affiliated (the community was built through Rotman channels), but the database **cannot confirm it** for 28 of them, and nothing prevents future non-Rotman admissions via invite codes or premium. The assumption "active ⇒ Rotman" is not structurally true today and must not be silently relied on. **Therefore, per the founder's gate, Phase 1 migration files were not written.** The proposal below goes to the founder for approval first.

### 4.3 Proposed general community-membership model (smallest additive primitive)

A reusable Mutu primitive for future university communities — not a Practice-specific or pilot-specific table:

```sql
-- ── communities ─────────────────────────────────────────────
create table if not exists public.communities (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,          -- 'rotman'; later: other schools
  name       text not null,                 -- 'Rotman School of Management'
  created_at timestamptz not null default now()
);

-- ── community_members ───────────────────────────────────────
create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.profiles(id)    on delete cascade,
  status       text not null default 'member'
                 check (status in ('member','removed')),
  source       text not null
                 check (source in ('institutional_email',  -- auto: verified inst. email
                                   'backfill',             -- founder-attested seed
                                   'admin',                -- manual grant (e.g. invited Rotman member on Gmail)
                                   'invite')),             -- future: community-scoped invite codes
  joined_at    timestamptz not null default now(),
  removed_at   timestamptz,
  primary key (community_id, user_id)
);

-- RLS: users may read their OWN memberships; no client writes of any kind
-- (grants flow through service role / SECURITY DEFINER system paths only).

-- ── generic helper + the Practice eligibility function ─────
create or replace function public.is_community_member(p_user uuid, p_slug text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1
                    from public.community_members cm
                    join public.communities c on c.id = cm.community_id
                   where cm.user_id = p_user and c.slug = p_slug
                     and cm.status = 'member') $$;

-- Name reflects Rotman/community eligibility, not generic Mutu access
-- (founder correction 2): Mutu access AND Rotman membership.
create or replace function public.practice_is_rotman_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles p
                   where p.id = p_user and p.access_status = 'active')
      and public.is_community_member(p_user, 'rotman') $$;

revoke all on function public.is_community_member(uuid, text)      from public, anon;
revoke all on function public.practice_is_rotman_eligible(uuid)    from public, anon;
grant execute on function public.practice_is_rotman_eligible(uuid) to authenticated;
```

**Enrollment paths:**

1. **Seed:** insert the `rotman` community row.
2. **Backfill (one-time, founder-run, founder-attested):** two options —
   - **B1 (recommended for the pilot):** enroll all 43 current `active` members with `source='backfill'`, on the founder's explicit attestation that today's community was built through Rotman channels. This is a conscious, documented decision — not a silent assumption — and it is the only option that doesn't strand the 28 legacy-Gmail members.
   - **B2 (strict):** enroll only the 15 institutionally verified members automatically; the founder admin-adds the rest case by case.
3. **Forward auto-enroll:** when an institutional email is verified, enroll into `rotman` with `source='institutional_email'` (a small extension of the existing verification path; can land with the Practice migration or immediately after).
4. **Manual:** `source='admin'` for invited Rotman members on personal email; `status='removed'` (never row deletion) revokes membership without touching Mutu access.

**Sub-decisions needed with the approval (both change one line each, neither blocks the model):**

- **D1 — Domain scope of auto-enroll:** does a verified **U of T-wide** email (`mail.utoronto.ca`, `alum.utoronto.ca`) count as Rotman community, or only `rotman.utoronto.ca`? Today's members include 9 U of T-wide verifications; strict Rotman-only would exclude them from auto-enroll (backfill covers them either way). Recommendation: U of T-wide counts for the pilot, revisit when a second community exists.
- **D2 — Backfill choice:** B1 (all 43, attested) or B2 (15 auto + manual adds). Recommendation: B1.

Everything else in this report is written against `practice_is_rotman_eligible()` and is unaffected by D1/D2.

---

## 5. Data model and RLS (delta from Rev. 2)

Tables, snapshots, RPC-only transitions, deny-by-default policies, `ON DELETE CASCADE` everywhere, and the concurrency guards are unchanged from Rev. 2. Deltas:

- **+ `communities`, `community_members`** (§4.3) ahead of everything else in the migration order.
- Every occurrence of `practice_is_eligible()` becomes **`practice_is_rotman_eligible()`**; it now gates: request INSERT, the browse RPC (both sides), and every state-transition RPC.
- **Grant hygiene everywhere:** every practice function and view ships with `REVOKE … FROM public, anon` + `GRANT … TO authenticated` (`practice_admin_report` gets no grant at all — service role only).
- Browse is an RPC (§3), not a view; `my_practice_pairings`, `practice_pairing_windows`, `practice_relationship_edges` remain definer views, self-scoped, revoked from `public`/`anon`.

Policy matrix (unchanged rows abbreviated):

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `communities` | authenticated (names/slugs are not sensitive) | none (service role) | none | none |
| `community_members` | `user_id = auth.uid()` | **none** — service-role/system paths only | **none** | **none** |
| `practice_requests` | owner only | owner AND `practice_is_rotman_eligible(auth.uid())` | owner | none |
| `practice_availability_windows` | owner of parent | owner | owner | owner |
| `practice_pairings` | **none** — view only | **none** — RPC only | **none** | none |
| `practice_sessions` | participants | **none** — RPC only | **none** | none |
| `practice_session_confirmations` | session participants | **none** — RPC only | **none** — immutable | **none** |
| `practice_exchange_tokens` | `auth.uid() in (user_lo, user_hi)` | **none** — mint inside `submit_practice_confirmation()` only | none | none |

The ten state-transition RPCs and their role/expected-state assertions are exactly as Rev. 2 §5.3 (send/accept/decline/withdraw invitation · propose/confirm/decline/withdraw/cancel session · submit confirmation with atomic verify+mint under the session row lock), each additionally asserting `practice_is_rotman_eligible(auth.uid())`.

---

## 6. Mutual scheduling state machine (unchanged from Rev. 2)

```
 pairing accepted ─▶ proposed ──confirm (non-proposer)──▶ scheduled ──cancel──▶ cancelled
        (propose_practice_session,   ├─ decline (non-proposer) ▶ declined
         either participant,         ├─ withdraw (proposer)    ▶ withdrawn
         one live per pairing)       └─ cron: start passed     ▶ expired
                                        (all three free the slot → new proposal allowed)
 scheduled ─▶ confirmations: 1st completed ▶ completed_pending_confirmation
              2nd compatible ▶ verified + MINT (atomic) · conflict ▶ disputed (frozen)
              no_show / cancelled outcomes ▶ no token, ever
```

Invariants held: proposer cannot confirm own proposal; one confirmation never verifies; confirmations never auto-expire or auto-verify; cancellation carries no penalty; disputes freeze for manual founder review.

---

## 7. Immutable snapshot design (unchanged from Rev. 2)

`practice_pairings.requester_snapshot` / `addressee_snapshot` (jsonb, NOT NULL): self-contained copies of want/help types + focus + non-identifying context + format/duration/timezone, written once by `send_practice_invitation()`, never updated by any path (no client UPDATE exists; no RPC writes them after insert). FKs to the editable request rows are provenance only. Token `exchange_types` derive from the snapshots at mint time. Snapshots contain no identity fields — they *are* the anonymous invitation card.

---

## 8. Practice-specific chat (correction 5 applied)

`accept_practice_pairing()` always inserts a **new** `matches` row — `source='practice'`, `status='active'`, born `identity_reveal_status='accepted'` (the established birth-state pattern of `openOrCreateDirectMatch()`, [matches.js:147](src/lib/matches.js:147); the reveal *guard* governs transitions, not creation, and is untouched). No lookup, no reuse: any pre-existing ordinary or anonymous conversation between the pair remains byte-identical, and the two conversations coexist by design.

**Badge requirement:** `matchToUI()` already surfaces `source`; the Practice chat renders a visible **`Practice` badge in both `MatchesList` and `ChatView`** (mirroring the existing `isSmartMatch` treatment), so the duplicate-conversation case is legible rather than confusing. The reveal-request UI never renders for a chat born accepted (existing behaviour for direct matches).

---

## 9. Security and privacy assertion suite (complete, updated)

Run by the founder as service role inside `BEGIN; … ROLLBACK;`, with throwaway users: **A**, **B** (both `access_status='active'` AND Rotman members), **P** (`access_status='pending'`), and **N** (`access_status='active'` but **not** a Rotman community member — the new case).

**Privacy / anonymity / eligibility:**

| # | Assertion |
|---|---|
| P1 | As B: `browse_practice_requests()` returns A's active request with exact windows, timezone, format, duration, fit — and the declared return shape contains no identity column |
| P2 | As B: `select user_id from practice_requests where id=:a_req` → 0 rows; `practice_availability_windows` → 0 rows. **A browser sees availability but cannot resolve the anonymous owner by any granted path** |
| P3 | As B post-invite: `my_practice_pairings` shows `counterpart_user_id IS NULL`, `match_id IS NULL`; direct `select * from practice_pairings` → 0 rows |
| P4 | As A (addressee, pre-accept): B's snapshot visible, `counterpart_user_id IS NULL`; the `practice_invitation` notification payload contains only `{pairing_id}` |
| P5 | As P (not active): browse RPC and every practice RPC raise/return nothing |
| P6 | After acceptance: both sides resolve counterpart id + `match_id`; `practice_pairing_windows` returns both sides' live windows (0 rows pre-acceptance) |
| P7 | Pre-seeded anonymous A–B match is byte-identical after acceptance; exactly one new match exists with `source='practice'`, reveal accepted |
| P8 | Unrelated eligible user C sees 0 rows of the A–B tokens/edges |
| P9 | `practice_admin_report` as any authenticated user → permission denied |
| **P10** | **Both-sides eligibility:** N (active Mutu, non-Rotman) gets 0 rows from browse and errors from `send_practice_invitation`; conversely, when A's `access_status` is set to `'blocked'` (or A's community row to `'removed'`) while A's request is still `'active'`, A's request **immediately disappears from B's browse** |
| **P11** | **Cooldown:** after A declines B, browse hides each from the other in **both directions**; with `declined_at` back-dated 31 days, the request reappears (both still active + compatible) and a fresh invitation succeeds as a new pairing row. A blocked A–B relationship stays hidden regardless of the 30 days |
| **P12** | **Grant hygiene:** as `anon`, executing `browse_practice_requests()` and selecting from every practice view → permission denied; `has_function_privilege`/`has_table_privilege` checks confirm no `public`/`anon` grants remain on any practice object |

**Consent / integrity (unchanged from Rev. 2, renumbered):**

| # | Assertion |
|---|---|
| S1 | Invite without own active request → raises; without mutual fit → raises |
| S2 | Crossed invitations → second fails generically (`uq_pairing_live`), no identity in the error |
| S3 | Requester self-accept → raises; accept after `expires_at` (14 d) → raises; double accept → raises |
| S4 | Direct DML on pairings/sessions/confirmations/tokens as any user → denied (no policies), incl. `update … set status='verified'` |
| S5 | Proposer self-confirm → raises; non-participant → raises; second live proposal → clean `uq_session_live` error |
| S6 | Confirm before `scheduled_start` → raises; `completed` without both round attestations → CHECK violation; spoofed `user_id` impossible (RPC uses `auth.uid()`; no direct INSERT); duplicate → `already_confirmed` |
| S7 | One confirmation → `completed_pending_confirmation`, 0 tokens; second compatible → `verified`, exactly 1 token; mint re-run → still 1; conflict → `disputed`, 0 tokens, processing stops |
| S8 | Owner edits request post-invitation → pairing snapshots unchanged |
| S9 | Deleting throwaway user A cascades cleanly — no `ON DELETE RESTRICT` blocks account deletion |
| S10 | After the `notifications_type_check` re-list, one INSERT per pre-existing type (all ten) still succeeds |

---

## 10. Migration order, rollback, file plan (updated; files NOT yet written)

**Order** for `scripts/migration-practice-reciprocal.sql` (idempotent, founder-run; live-schema baseline dump remains step 0 and resolves the blocked-users table names): ① `communities` + `community_members` + seed + backfill (per approved D1/D2) → ② `is_community_member()` + `practice_is_rotman_eligible()` → ③ practice tables in dependency order with indexes/partial uniques/touch triggers → ④ RLS enable + policies (deny-by-default commented as intentional) → ⑤ `browse_practice_requests()` RPC + the three definer views + edges/admin views → ⑥ the ten transition RPCs → ⑦ **grant sweep** — `REVOKE … FROM public, anon` and explicit `GRANT` on every object created above → ⑧ `notifications_type_check` re-list (all ten existing + the seven `practice_*` types) → ⑨ the full §9 assertion suite as a commented block.

**Rollback** (commented section, reverse order): drop RPCs → views → practice tables (tokens, confirmations, sessions, pairings, windows, requests) → practice helper functions → restore `notifications_type_check` verbatim to the ten current values. **`communities`/`community_members` are general Mutu primitives — the rollback section drops them only under a separately-commented "full rollback" variant**, since other features may adopt them; `matches` rows with `source='practice'` stay (real conversations, inert without the tables). The forward migration's only writes to existing tables are the CHECK re-list and the backfill INSERTs into the new membership table.

**Frontend plan** — as Rev. 2, plus: `MatchesList`/`ChatView` gain the `Practice` badge (via existing `source` plumbing); `src/lib/practice.js` browse call becomes `supabase.rpc('browse_practice_requests')`; analytics unchanged (twelve brief events + `practice_session_proposed`/`…_confirmed`). Cron sweep (Phase 4): invitations past `expires_at`, requests past their final window, proposals past `scheduled_start`; never touches confirmations or cooldowns (the cooldown is a query predicate, not state).

**Relationship Capital / Home foundation** — unchanged: edge-native tokens (`user_lo`/`user_hi`), self-scoped edges view, person-level breadth/depth/recency/reciprocity from own tokens (reciprocity structural), reliability from sessions, verified-only by construction, dormant points/reviews/leaderboard stack untouched.

---

## 11. Resolution log and the single remaining gate

Resolved by founder (this revision): blocked-users table names → schema-baseline step, blocks excluded both directions · declined pairing → 30-day cooldown · duplicate chats → accepted with `Practice` badge · workshop attendance → not required · separate pilot allowlist → not required · consulting opt-in → by creating a request · all SQL → founder-run manually.

**Remaining gate (blocks Phase 1):** approval of the community-membership model (§4.3) plus its two sub-decisions — **D1** (U of T-wide vs strict `rotman.utoronto.ca` auto-enroll) and **D2** (backfill B1: all 43 attested, vs B2: 15 verified + manual). On approval, Phase 1 delivers `scripts/schema-baseline-dump.sql` + `scripts/migration-practice-reciprocal.sql` with idempotent DDL, the rollback section, and the complete §9 assertion suite — for the founder to run manually.

---

*Phase 0 (Rev. 3) complete. No code edited, no SQL executed, no Supabase state touched.*

---

**Post-approval addendum (2026-08-26):** the founder approved §4.3 with **D1 = strict** (`rotman.utoronto.ca`-only auto-enroll), **D2 = B1** (one-time attested backfill of all current actives), and required Practice to be **community-scoped end to end** (`community_id` on requests, pairings, sessions, tokens, edges, browse, analytics; cross-community combinations impossible). Phase 1 was delivered accordingly: `scripts/schema-baseline-dump.sql`, `scripts/migration-practice-reciprocal.sql` (idempotent, with rollback), and `scripts/practice-assertions.sql` (27 assertion groups) — all verified end to end on a local scratch PostgreSQL 17 against a stub of the live schema (migration idempotent; all assertions pass; rollback clean; nothing run against Supabase). See `docs/practice-phase1-execution-guide.md` for the founder's manual run procedure.
