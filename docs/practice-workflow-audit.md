# Mutu — Practice Workflow Audit

**Date:** 2026-08-25
**Scope:** Read-only audit of the `reciring` app repo + the Supabase schema as recorded in `scripts/*.sql`.
**Status:** No source code, database configuration, or production data was changed. No migration was run.

---

## 1. Current architecture summary

### 1.1 Frontend

| Concern | Reality |
|---|---|
| Build | Vite 5 + React 18, plain **JavaScript/JSX** (no TypeScript anywhere in `src/`) |
| Routing | **No router.** `react-router-dom@6` is in `package.json` but is imported nowhere. Navigation is a single `const [tab, setTab] = useState(...)` in [App.jsx:150](src/App.jsx:150) |
| Shell | [App.jsx](src/App.jsx) is **1,394 lines** and holds nearly all app state: tab, matches, requests, chat, event sub-views, modals, realtime subscriptions, and ~15 handlers |
| Bottom nav | 5 tabs defined in `TABS` at [App.jsx:90](src/App.jsx:90): **Home · Discover · Post · Matches · Events**. Profile is *not* a tab — it is reached by `setTab('profile')` from the header avatar |
| Sub-navigation | Nested `useState` flags, not routes. Events alone uses `viewingEventId`, `editingEventId`, `preparingEventId`, `eventsTopView`, `eventsFilter`, `eventInitialView` — all rendered by chained ternaries at [App.jsx:1180–1230](src/App.jsx:1180) |
| Deep links | Only two URL-aware paths: password recovery ([App.jsx:1342](src/App.jsx:1342)) and query-param handling ([App.jsx:321](src/App.jsx:321)). `vercel.json` rewrites everything to `/` |
| Styling | Tailwind is configured but **most components use inline styles** with a locally re-declared gold token object `const C = { gold: '#C9A33B', … }` — duplicated in ~25 files. `src/components/ui.js` is a stale dark-theme kit, effectively unused |
| Animation | `framer-motion` (card drag, sheets, modals) |
| Native | Capacitor 8 (iOS `com.muturing.mutu`, Android). `supabase.js` has a WKWebView-specific auth lock workaround |
| Serverless | Vercel functions in `/api` (email via Resend, AI rewrite, broadcast, unsubscribe) + one daily cron |

### 1.2 Key component map

| Area | Files |
|---|---|
| Discover | [CardStack.jsx](src/components/CardStack.jsx) (574 lines — swipe, deck, promos), [RequestCard.jsx](src/components/RequestCard.jsx), [RequestDetailModal.jsx](src/components/RequestDetailModal.jsx), [MatchModal.jsx](src/components/MatchModal.jsx) |
| Posting | [PostHub.jsx](src/components/PostHub.jsx), [SubmitRequest.jsx](src/components/SubmitRequest.jsx), [MyPostsPage.jsx](src/components/MyPostsPage.jsx) |
| Matching / reveal | [MatchesList.jsx](src/components/MatchesList.jsx), [NewMatchModal.jsx](src/components/NewMatchModal.jsx), [IdentityRevealRequestModal.jsx](src/components/IdentityRevealRequestModal.jsx), [PeerProfileCard.jsx](src/components/PeerProfileCard.jsx) |
| Chat + scheduling | [ChatView.jsx](src/components/ChatView.jsx), **[CoffeeChatModal.jsx](src/components/CoffeeChatModal.jsx)** (date + time + location sheet — the *only* scheduling UI in the app) |
| Completion | **[RecognitionCard.jsx](src/components/RecognitionCard.jsx)** (the "We met" → both-confirm → recognize flow, rendered inside `ChatView`) |
| Profile | [ProfilePage.jsx](src/components/ProfilePage.jsx), [SettingsPage.jsx](src/components/SettingsPage.jsx), [SettingsTab.jsx](src/components/SettingsTab.jsx), `src/components/profile/*` (V3, flag-disabled) |
| Events | 20+ components (`Event*.jsx`), incl. [EventDetailPage.jsx](src/components/EventDetailPage.jsx), [EventPreparePage.jsx](src/components/EventPreparePage.jsx) |
| Networking dashboard | [MyNetworkingDashboard.jsx](src/components/MyNetworkingDashboard.jsx) — reached via **Events tab → "My Networking"** sub-tab, not its own tab |
| Admin | [AdminEventReview.jsx](src/components/AdminEventReview.jsx), [AdminEmailTest.jsx](src/components/AdminEmailTest.jsx), [AdminEmailComposer.jsx](src/components/AdminEmailComposer.jsx). Gated by a hard-coded email allowlist in [src/data/adminEmails.js](src/data/adminEmails.js) / [api/_lib/admin.js](api/_lib/admin.js) |
| Analytics | [src/lib/analytics.js](src/lib/analytics.js) — a single fire-and-forget `track(name, props)` writing to `funnel_events` |

### 1.3 Data layer

`src/lib/*.js` — 40 modules, each a thin Supabase wrapper. A strict, consistent house style worth matching:

```js
export async function doThing(args) {
  if (!isSupabaseConfigured) return { data: null, error: new Error('Supabase not configured.') }
  const { data, error } = await supabase.from('table')…
  return { data, error }
}
```

Every function returns `{ data, error }` (or `{ error }`), guards on `isSupabaseConfigured`, and never throws.

### 1.4 Supabase environment

| Concern | Reality |
|---|---|
| Supabase CLI project | **None.** No `supabase/config.toml`, no `supabase/migrations/`. Only `supabase/functions/` (4 Edge Functions) |
| Migrations | **60 hand-written `.sql` files in `scripts/`**, run manually in the Supabase SQL Editor. No ordering, no version table, no CI. Convention: idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), header comment explaining intent |
| Dev vs prod separation | **None.** `.env.local` holds one `VITE_SUPABASE_URL` + one anon key. There is no staging project, no `.env.production`, no branch-based project switching. **Development runs against production data.** |
| Generated TS types | **None.** No `database.types.ts`, no `Database` generic on `createClient` |
| Client credentials | Anon key only. All privileged work is done by (a) `SECURITY DEFINER` functions, (b) Vercel functions holding `SUPABASE_SERVICE_ROLE_KEY`, or (c) the founder in the SQL Editor |
| Schema drift | **Confirmed.** `interactions.js` performs `DELETE` on `post_interactions`, but `migration-post-interactions.sql` explicitly creates *no* DELETE policy ("No DELETE policy by design"). Either the delete silently no-ops or a policy was added ad-hoc in the dashboard and never written back to `scripts/`. **`scripts/` is not a reliable mirror of the live schema.** |
| Realtime | Enabled on `matches`, `messages`, `notifications`, `event_marketplace_*` via `supabase_realtime` publication + `REPLICA IDENTITY FULL` |
| Test infrastructure | **None.** No test script, no vitest/jest/testing-library in `package.json` |

---

## 2. Current matching-flow diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. POST                                                                  │
│    PostHub / SubmitRequest → createPost()  [src/lib/posts.js:60]         │
│    → INSERT posts { created_by, need_text, offer_text, help_type[],      │
│                     industry_tag[], time_commitment, urgency,            │
│                     expires_at, is_anonymous }                           │
│    NOTE: help_type already includes 'Mock Interview'                     │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. SWIPE                                                                 │
│    CardStack.handleSwipeLeft  → recordPostInteraction(…,'swiped_left')   │
│                                 → UPSERT post_interactions               │
│    CardStack.handleSwipeRight → track('discover_swipe_right')            │
│                               → onMatchConfirm(request)                  │
│    ⚠ A right-swipe is NOT persisted as "interested". There is no         │
│      intermediate state — it goes straight to step 3.                    │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. "MATCH"  ← *** THERE IS NO MUTUAL MATCH ***                           │
│    App.handleMatchConfirm  [App.jsx:786] → createMatch()                 │
│    → UPSERT matches { post_id, requester_user_id = post.created_by,      │
│                       helper_user_id = me, status:'active' }             │
│      onConflict (post_id, helper_user_id)                                │
│    This is a ONE-SIDED PICK-UP. The post author never consents.          │
│    Trigger trg_notify_new_match → notifications row for the author.      │
│    Realtime INSERT on matches → author sees "It's a match!" popup.       │
│                                                                          │
│    Two genuinely mutual paths DO exist, but not in Discover:             │
│      • match_nudges (Smart Match): both sides 'interested' →             │
│        handle_mutual_nudge() SECURITY DEFINER trigger → matches row      │
│        with source='smart_match'                                         │
│      • event_marketplace_interest: owner accepts → matches row with      │
│        marketplace_post_id                                               │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. CHAT                                                                  │
│    ChatView ↔ messages { match_id, sender_user_id, body,                 │
│                          type:'text'|'meeting_proposal'|'system',        │
│                          metadata jsonb, read_at }                       │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. SCHEDULING  ← *** LIVES INSIDE A CHAT MESSAGE ***                     │
│    CoffeeChatModal → sendMeetingProposal()                               │
│    → INSERT messages { type:'meeting_proposal',                          │
│                        metadata: { datetime, location, status } }        │
│    Peer confirms → updateMeetingStatus() patches metadata.status         │
│    ⚠ No meetings table. No duration. No timezone. No reminders.          │
│    ⚠ A Google Calendar link is string-built inline at ChatView.jsx:181.  │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. IDENTITY REVEAL                                                       │
│    matches.identity_reveal_status: none → pending → accepted | declined  │
│    Guarded by trigger guard_identity_reveal() — the requester CANNOT     │
│    accept their own request (this is the security pattern to copy).      │
│    Bypass path: reveal_match_after_meeting(match_id) SECURITY DEFINER    │
│    RPC, allowed only when an event_encounters row proves they met.       │
│    Legacy path: ChatView auto-reveals on the day of a confirmed meeting. │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 7. COMPLETION  ← *** THE FLOW ENDS HERE ***                              │
│    RecognitionCard (inside ChatView) → confirmExchange()                 │
│    → INSERT exchange_confirmations { match_id, user_id } PK(both)        │
│    Both rows present ⇒ "the exchange happened". This is the             │
│    North-Star metric and the ONLY two-sided completion primitive.        │
│    Then optionally: recognition_events { chips[], free_text }            │
│                                                                          │
│    ⚠ NOT recorded anywhere: what was scheduled, when it was scheduled,   │
│      whether it happened at that time, who no-showed, cancellations,     │
│      duration, or session type.                                          │
│    ⚠ 'We met' can be tapped at any moment, with no meeting on record.    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Dead ends found (do not build on these):**
- `matches.status = 'completed'` — allowed by the CHECK constraint, **never written by any code path**.
- `reviews` table + `point_ledger` + `on_review_created()` trigger + `leaderboard` view — **fully built, entirely dormant.** No client submits a review. `profiles.total_points` / `meetings_scheduled` / `meetings_completed` are therefore ~always 0, yet [posts.js:130](src/lib/posts.js:130) still reads them onto every card.
- `event_attendees.attendance_status` (`going|attended|no_show|left`) — **never read or written in `src/`.** RSVP only; there is no check-in.

---

## 3. Existing tables relevant to Practice

Reconstructed from `scripts/*.sql`. **`posts` and `profiles` predate the script folder and have no `CREATE TABLE` on record** — they were created in the dashboard and only ever `ALTER`ed.

### Core spine

| Table | Key columns | Notes for Practice |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `email`, `name`, `avatar_url`, `program` (free text), `visibility` (`private`/`public`), `member_type`, `access_type`, `access_status`, `premium_until`, `headline`, `career_stage`, `industry_interests[]`, `can_help_with[]`, `skills_to_learn[]`, `networking_intent[]`, `goal`, `working_style[]`, `timeline`, `onboarding_done`, `total_points`, `meetings_scheduled`, `meetings_completed` | **No `timezone` column.** `created_at` is `timestamp WITHOUT time zone` — the only table that is not `timestamptz` |
| `posts` | `id`, `created_by`, `need_text`, `offer_text`, `help_type[]`, `industry_tag[]`, `time_commitment`, `urgency`, `expires_at`, `is_anonymous`, `created_at` | `help_type` already contains **`'Mock Interview'`** ([requestOptions.js:6](src/data/requestOptions.js:6)) |
| `matches` | `id`, `post_id` (nullable), `marketplace_post_id`, `event_id`, `requester_user_id`, `helper_user_id`, `source` (default `'post'`), `status` (`active\|completed\|cancelled\|unmatched`), `identity_reveal_status/_requested_by/_requested_at/_accepted_at`, `created_at` | UNIQUE `(post_id, helper_user_id)` — **does not constrain rows where `post_id IS NULL`**, so post-less matches can duplicate. CHECK `matches_source_chk`: `post_id IS NOT NULL OR marketplace_post_id IS NOT NULL OR source <> 'post'` |
| `messages` | `id`, `match_id`, `sender_user_id`, `body`, `type` (`text\|meeting_proposal\|system`), `metadata` jsonb, `read_at`, `created_at` | Meeting proposals live in `metadata` |
| `exchange_confirmations` | PK `(match_id, user_id)`, `confirmed_at` | **The two-sided completion primitive.** Insert-only: no UPDATE/DELETE policy exists |
| `recognition_events` | `id`, `match_id`, `giver_id`, `receiver_id`, `chips[]`, `free_text`, UNIQUE `(match_id, giver_id)` | Immutable. `free_text` hidden from receiver via the `recognition_received` view |
| `post_interactions` | `id`, `user_id`, `post_id`, `interaction_type` (`viewed\|swiped_left`), `last_interaction_at`, UNIQUE `(user_id, post_id)` | Discover ranking tiers |
| `notifications` | `id`, `user_id`, `type` (CHECK list), `title`, `body`, `payload` jsonb, `read_at`, `created_at` | Realtime-subscribed; bell UI already built |
| `funnel_events` | `id`, `user_id`, `event_name`, `properties` jsonb, `created_at` | Append-only. **INSERT-only RLS — no client SELECT** |

### Events cluster

`events` (incl. `status upcoming|cancelled|full|completed`, `moderation_status`, `attendee_visibility`, `min/max_attendees`, `start_at timestamptz`), `event_attendees` (`attendance_status` unused), `event_marketplace_posts`, `event_marketplace_interest` (`pending|accepted|declined`), `event_messages`, `event_goals`, `event_encounters`, `encounter_confirmation_requests`, `event_promo_events`, `luma_sync_log`.

### Access / ops

`user_emails`, `invites`, `access_codes`, `access_code_redemptions`, `email_logs`, `email_subscriptions`, `ask_mutu_messages`, `profile_custom_tags`, `profile_migration_log`, `match_nudges`.

### Dormant

`reviews`, `point_ledger`, `leaderboard` (view), `trust_signal` (view), `recognition_received` (view).

### Conventions to follow

- PK: `uuid PRIMARY KEY DEFAULT gen_random_uuid()`. Junction tables use composite PKs (`exchange_confirmations`).
- Timestamps: `timestamptz NOT NULL DEFAULT now()` named `created_at`; state stamps named `<state>_at` and left nullable.
- **Status is always `text` + a named CHECK constraint. There are no Postgres `ENUM` types in this database.** CHECK constraints are drop-and-recreate so they can be extended.
- FKs: `ON DELETE CASCADE` for owned rows, `ON DELETE SET NULL` for references that must survive. Analytics tables (`funnel_events`) deliberately have *no* FKs.
- `updated_at` only where needed, maintained by a `touch_*` BEFORE UPDATE trigger (`match_nudges` is the model).
- Cross-user writes are done by `SECURITY DEFINER` functions, never by relaxing RLS.

---

## 4. Reusable components and services

| Asset | Reuse verdict | Detail |
|---|---|---|
| **`matches` records** | ✅ Reuse as the chat anchor, ❌ not as the session record | `source` already supports non-post matches (`'smart_match'`, direct). Add `source='practice'` and link from the session. **Do not overload `matches.status` with practice states** — it drives Discover filtering, unmatch, and the relationship layer |
| **`messages` + `ChatView`** | ✅ Reuse wholesale | Anchor a practice session to a `matches` row and chat works with zero changes, including read receipts and realtime |
| **`exchange_confirmations`** | ⚠️ Reuse the *pattern*, not the table | It is keyed on `match_id` and has no outcome column, no no-show, no time anchor. A parallel `practice_session_confirmations` table keyed on `session_id` is the correct move — and gives Practice a clean funnel separate from the Discover North-Star metric |
| **`RecognitionCard`** | ✅ Reuse after a small generalisation | Already implements exactly the loading → cta → waiting → recognize → done state machine Practice needs. It is hard-wired to `matchId`; parameterising the confirm/status functions makes it work for sessions |
| **`CoffeeChatModal`** | ⚠️ Reuse as a visual/UX template | Good date/time/location sheet, but it emits only `{ datetime, location }`, has no duration, no timezone, and a hard-coded `'Madison Pub'` default. Treat it as the starting point for a `PracticeSlotComposer`, not a drop-in |
| **`event_attendees`** | ❌ Do not reuse | RSVP only. `attendance_status` is dead. A capacity trigger exists but the semantics (many-to-one) do not fit a 1:1 booking |
| **`event_encounters`** | ❌ Do not reuse for sessions | It records "I met this person", is owner-only, and has no scheduled time. Its *confirmation-request* table is however the best existing model for two-party consent without leaking private fields |
| **`notifications`** | ✅ Reuse | Table, RLS, realtime subscription, bell UI, and read/unread all exist. **Requires extending the `notifications_type_check` CHECK** — see the landmine in §10 |
| **Email (`/api/send-email` + Resend + `_templates/`)** | ✅ Reuse | Templates are plain JS modules; `email_subscriptions` + unsubscribe tokens already handled. Add `practice-reminder` / `practice-booked` templates |
| **Vercel cron** | ✅ Reuse the mechanism | `/api/cron/event-attendance-check` already runs daily with `CRON_SECRET` + service-role client. Practice needs a similar sweep (expire slots, nudge unconfirmed sessions, auto-close). **A daily cadence is too coarse for session reminders** — a second, hourly cron entry will be needed |
| **Admin export** | ❌ Does not exist | There is **no in-app export**. The current process is: founder runs SQL in the Supabase SQL Editor and downloads CSVs into `analytics_input/` (13 files, last refreshed 2026-08-12). Admin UI is limited to event moderation + email testing |
| **`funnel_events` / `track()`** | ✅ Reuse directly | Add `practice_*` event names. No schema change needed (`event_name` is free text, `properties` is jsonb). Note it is fire-and-forget and under-counts |
| **`relationships.js`** | ✅ Reuse, then extend | `fetchConnections` / `fetchKnownPeopleIds` / `fetchRelationshipTimeline` already union matches + encounters. Practice sessions should become a fourth milestone source in the timeline |
| **`AppScreen`, `Chip`, `PeerAvatar`, `AnonymousAvatar`, `NotificationBell`, `ErrorBoundary`** | ✅ Reuse | Generic |
| **`isProfileV3Enabled` flag pattern** | ✅ Reuse | `featureFlags.js` gives allowlist + `localStorage` override with no redeploy. Ideal for a Rotman pilot cohort |
| **Auth / U of T gate** | ✅ Leave untouched | `src/config/auth.js` + `src/lib/access.js`. Practice needs no change here |

---

## 5. Gaps between Match and completed Session

| # | Gap | Consequence for Practice |
|---|---|---|
| 1 | **No scheduled-time entity.** A meeting is a jsonb blob inside a chat message | Cannot query "sessions this week", cannot remind, cannot detect a missed session, cannot report |
| 2 | **No duration and no timezone.** `CoffeeChatModal` builds `new Date(\`${date}T${time}:00\`)` in the *browser's* local zone | A 45-minute case interview cannot be expressed. A Toronto/overseas peer pair will silently mis-schedule |
| 3 | **No role asymmetry.** `matches` has `requester`/`helper`; both are symmetric peers thereafter | Practice needs a real interviewer vs candidate distinction, and the same pair will swap roles between sessions |
| 4 | **No supply-side object.** Nothing in the schema represents "I am free Tuesday 3–4pm" | Availability and booking must be built from scratch |
| 5 | **No cancellation, no-show, or dispute state.** `matches.status='cancelled'` exists but is never written; `unmatched` is the real soft-delete | The founder's `cancelled` / `no_show` / `disputed` outcomes have no home |
| 6 | **Confirmation is unanchored.** `exchange_confirmations` has no reference to a scheduled time and no outcome | "We met" can be tapped with nothing ever scheduled. It cannot express "we booked but they didn't show" |
| 7 | **Right-swipe intent is not persisted.** Discover jumps from swipe straight to an active match | There is no existing "requested / pending" pattern in Discover to copy for practice requests. The closest models are `event_marketplace_interest` and `encounter_confirmation_requests` |
| 8 | **No session type taxonomy.** `posts.help_type` has a flat `'Mock Interview'` string | case / behavioral / technical needs its own dimension |
| 9 | **No concurrency guard on 1:1 booking.** The only DB-level race guard in the codebase is `check_event_capacity()` on `event_attendees` | Two users can book the same slot without a `SECURITY DEFINER` booking RPC |
| 10 | **No admin reporting surface.** | The pilot's key deliverable (verified-session counts by cohort) has no query path other than the SQL Editor |
| 11 | **No reminder infrastructure at session granularity.** One daily cron only | A session booked for 3pm tomorrow gets at best a ~24h-granularity ping |

---

## 6. Recommended Practice data model

### 6.1 Design decisions

**Three new tables, not six.** The founder's preliminary `PracticeSession` is close to right; my changes are:

1. **Split confirmation into its own table.** The preliminary model puts `interviewer_confirmed_at` / `candidate_confirmed_at` as columns on the session. Postgres RLS is *row*-level — it **cannot stop user A from writing the column belonging to user B**. Doing it with columns requires a `guard_*` BEFORE UPDATE trigger (the `guard_identity_reveal()` pattern). Doing it with rows makes it structurally impossible: `WITH CHECK (user_id = auth.uid())` is the entire enforcement. The codebase already proves the row approach works (`exchange_confirmations`). **Recommend rows.** Keep a derived `completed_at` / `verified_at` on the session, stamped by a trigger, so admin queries stay cheap.

2. **Merge "practice request" and "available slot" into one `practice_slots` table** distinguished by `host_role`. A request *is* an availability posting where the host is the candidate rather than the interviewer. Two tables with identical shape, identical RLS, and identical booking logic is duplicated surface for no gain. The founder's `origin: availability_slot | practice_request` then derives from `slot.host_role` rather than needing its own column.

3. **`status` as `text` + CHECK, not an enum type.** Matches every existing table; lets the value list be extended by drop-and-recreate.

4. **Practice sessions are not anonymous.** A mock interview with a stranger you cannot name is not the product. Recommend Practice sessions create their `matches` row already `identity_reveal_status='accepted'`, exactly as `openOrCreateDirectMatch()` does. **This needs founder confirmation** (§10).

### 6.2 Proposed schema

```sql
-- ── practice_slots ──────────────────────────────────────────
-- Supply AND demand. host_role='interviewer' → "I'll interview you"
--                    host_role='candidate'   → "Interview me" (a request)
--                    host_role='either'      → happy to do both
create table public.practice_slots (
  id                uuid primary key default gen_random_uuid(),
  host_user_id      uuid not null references public.profiles(id) on delete cascade,
  host_role         text not null check (host_role in ('interviewer','candidate','either')),
  session_types     text[] not null default '{}',   -- subset of case|behavioral|technical
  start_at          timestamptz not null,
  duration_minutes  integer not null default 45 check (duration_minutes between 15 and 180),
  timezone          text not null default 'America/Toronto',  -- IANA; for display
  location_type     text not null default 'virtual'
                      check (location_type in ('virtual','in_person')),
  location_detail   text not null default '',
  notes             text not null default '',
  status            text not null default 'open'
                      check (status in ('open','booked','withdrawn','expired')),
  booked_session_id uuid,                              -- FK added after sessions exists
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── practice_sessions ───────────────────────────────────────
create table public.practice_sessions (
  id                   uuid primary key default gen_random_uuid(),
  session_type         text not null check (session_type in ('case','behavioral','technical')),
  interviewer_user_id  uuid not null references public.profiles(id) on delete cascade,
  candidate_user_id    uuid not null references public.profiles(id) on delete cascade,
  created_by_user_id   uuid not null references public.profiles(id) on delete set null,
  slot_id              uuid references public.practice_slots(id) on delete set null,
  origin               text not null default 'availability_slot'
                         check (origin in ('availability_slot','practice_request','direct')),
  -- Chat reuse: the existing matches/messages/ChatView stack.
  match_id             uuid references public.matches(id) on delete set null,
  scheduled_start      timestamptz not null,
  duration_minutes     integer not null default 45 check (duration_minutes between 15 and 180),
  timezone             text not null default 'America/Toronto',
  location_type        text not null default 'virtual'
                         check (location_type in ('virtual','in_person')),
  location_detail      text not null default '',
  status               text not null default 'booked'
                         check (status in ('booked','completed_pending_confirmation',
                                           'verified','cancelled','no_show','disputed')),
  completed_at         timestamptz,   -- first confirmation
  verified_at          timestamptz,   -- both confirmations agree on 'completed'
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.profiles(id) on delete set null,
  cancellation_reason  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint practice_sessions_distinct_parties
    check (interviewer_user_id <> candidate_user_id)
);

-- ── practice_session_confirmations ──────────────────────────
-- One row per participant. RLS alone guarantees you can only speak
-- for yourself. Insert-only, like exchange_confirmations.
create table public.practice_session_confirmations (
  session_id    uuid not null references public.practice_sessions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  outcome       text not null default 'completed'
                  check (outcome in ('completed','no_show','cancelled')),
  no_show_of    uuid references public.profiles(id) on delete set null, -- who failed to show
  confirmed_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);
```

Plus: a partial unique index preventing double-booking, indexes on `(host_user_id, start_at)`, `(status, start_at)`, `(interviewer_user_id)`, `(candidate_user_id)`, and `touch_*` triggers for `updated_at`.

### 6.3 `open` is a slot state, not a session state

The founder's flow `open → booked → completed_pending_confirmation → verified` mixes two objects. `open` belongs to `practice_slots`; a `practice_sessions` row **only exists once a booking has happened**. Corrected lifecycle:

```
practice_slots:    open ──► booked ──► (terminal)
                     └─► withdrawn / expired

practice_sessions:        booked ──► completed_pending_confirmation ──► verified
                            │                    │
                            ├─► cancelled        └─► disputed  (outcomes disagree)
                            └─► no_show
```

Status is **derived, never client-written**. A trigger on `practice_session_confirmations` sets:
- 1 row, `outcome='completed'` → `completed_pending_confirmation`, stamp `completed_at`
- 2 rows, both `'completed'` → `verified`, stamp `verified_at`
- 2 rows, disagreeing → `disputed` (admin resolves; no automated penalty in MVP)
- either row `'no_show'` → `no_show`

This keeps `verified` un-forgeable by a single participant — the direct analogue of `guard_identity_reveal()`.

### 6.4 Separate vs combined — explicit answers

| Concern | Verdict |
|---|---|
| Practice requests | **Combine** into `practice_slots` via `host_role='candidate'` |
| Available slots | `practice_slots` |
| Session bookings | **Separate** — `practice_sessions` |
| Two-sided confirmation | **Separate** — `practice_session_confirmations` (security, not tidiness) |
| Cancellations | **Combine** into `practice_sessions` (`cancelled_at`/`_by`/`_reason`) |
| No-shows | **Combine** — a `status` value + the `outcome` on the confirmation row. No separate table |
| Admin reporting | **No table.** A `practice_admin_report` **view** over the three tables, granted to the service role only |
| Ratings / credits / leaderboard | **Not built.** Per MVP constraints |

**Total: 3 tables + 1 view + 2 triggers + 1 booking RPC.** No existing table is renamed, dropped, or altered — except a single `notifications_type_check` CHECK extension (§10).

---

## 7. Recommended RLS policies

All tables `ENABLE ROW LEVEL SECURITY`, all policies scoped `TO authenticated`.

### `practice_slots`

| Op | Rule |
|---|---|
| SELECT | `status = 'open' AND start_at > now()` **OR** `host_user_id = auth.uid()` **OR** the caller is a participant of the slot's booked session. Open slots are visible to every authenticated member — this exposes the host's identity, which is intentional for Practice (see §10 Q1) |
| INSERT | `host_user_id = auth.uid()` |
| UPDATE | `host_user_id = auth.uid()` — **and** a BEFORE UPDATE trigger refusing any client transition into `'booked'` (only the booking RPC may do that) |
| DELETE | `host_user_id = auth.uid() AND status = 'open'` — a booked slot is never deletable |

### `practice_sessions`

| Op | Rule |
|---|---|
| SELECT | `auth.uid() IN (interviewer_user_id, candidate_user_id)` |
| INSERT | **No client policy.** Sessions are created *only* by `book_practice_slot()` (`SECURITY DEFINER`), which atomically re-checks the slot is still `'open'` and flips it to `'booked'`. This is the double-booking guard and the analogue of `check_event_capacity()` |
| UPDATE | Participants only, and restricted by a `guard_practice_session()` BEFORE UPDATE trigger to exactly one legal client transition: `booked → cancelled` (stamping `cancelled_by = auth.uid()`). Every other status change must come from the confirmation trigger. Terminal states (`verified`, `cancelled`) are immutable |
| DELETE | None. Sessions are the audit record |

### `practice_session_confirmations`

| Op | Rule |
|---|---|
| SELECT | Either participant of the session may read **both** rows — needed for "waiting for the other person" (same as `ExchConf: participants can read`) |
| INSERT | `user_id = auth.uid()` **AND** `EXISTS (SELECT 1 FROM practice_sessions s WHERE s.id = session_id AND auth.uid() IN (s.interviewer_user_id, s.candidate_user_id))` **AND** `session.status = 'booked' OR 'completed_pending_confirmation'` **AND** `now() >= session.scheduled_start` (you cannot confirm a session that has not started) |
| UPDATE / DELETE | **No policies → forbidden.** Confirmations are immutable, like `exchange_confirmations` and `recognition_events` |

**How one user is prevented from confirming for the other:** the PK is `(session_id, user_id)` and the only INSERT policy requires `user_id = auth.uid()`. There is no column another user could write, and no UPDATE path. This is strictly stronger than a column-based design, which would depend on a trigger being correct.

### Admin export

Admin identity is a **code-side email allowlist**, not a DB role — there is no `is_admin()` in Postgres today. Two options:

- **Recommended for MVP:** a `practice_admin_report` view with **no `GRANT` to `authenticated`**, queried by the founder in the SQL Editor (service role) — matching how analytics is done today.
- **If in-app export is wanted:** a Vercel function under `/api/admin/` holding `SUPABASE_SERVICE_ROLE_KEY`, gated by `isAdmin(session.user.email)` from `api/_lib/admin.js`. **Never** grant a broad SELECT policy keyed on `auth.jwt() ->> 'email'` — `migration-event-moderation.sql:56` already does this with a hard-coded address and it does not scale.

### `funnel_events`

No change. It is INSERT-only for clients and already accepts arbitrary `event_name`.

---

## 8. Recommended frontend architecture

### 8.1 Navigation — a decision is required

Current bar: **Home · Discover · Post · Matches · Events** (Profile via header avatar; Networking is a sub-tab of Events).
Requested bar: **Discover · Practice · Matches · Events · Networking/Profile**.

That request removes **Home** and **Post** from the bar. `Post` is the primary content-creation entry for the entire Discover supply side, and `Home` is a built surface with Ask Mutu, promos, and People cards. Three options:

| Option | Bar | Trade-off |
|---|---|---|
| **A (recommended)** | Home · Discover · **Practice** · Matches · Events | Replace `Post` with `Practice`; move post creation to a floating "+" button on Discover (`PostHub` is already a standalone screen, so this is a call-site change, not a rewrite). Smallest blast radius, preserves both Discover supply and Home |
| B | Discover · Practice · Matches · Events · Networking | Exactly as requested. Costs: Home is demoted or deleted, `Post` must be relocated anyway, and `MyNetworkingDashboard` must be lifted out of `EventsList`'s `topView` state. Largest change, touches four existing surfaces |
| C | Six tabs | Do not. 6 tabs at iPhone SE width (`justify-around`, 22px icons) will crowd and wrap labels |

**Recommendation: Option A for the pilot**, revisit the full re-shuffle once Practice has proven usage. Either way, Practice is **its own tab, never filters inside Discover** — that constraint is respected.

### 8.2 Routes

**Do not introduce `react-router` for this feature.** The app has no routes at all; adding a router now means rewriting `App.jsx`'s render tree, the recovery-route detection, and the Capacitor deep-link handling — a large, high-risk refactor orthogonal to Practice. Instead mirror the Events pattern exactly:

```js
const [tab, setTab] = useState('home')                 // + 'practice'
const [practiceView, setPracticeView] = useState('browse')
       // 'browse' | 'my-sessions' | 'slot-detail' | 'session-detail' | 'create-slot'
const [viewingSlotId, setViewingSlotId]       = useState(null)
const [viewingSessionId, setViewingSessionId] = useState(null)
```

If shareable URLs are needed later, add them as query params (`?practice=<id>`) using the existing `URLSearchParams` handling at [App.jsx:321](src/App.jsx:321).

### 8.3 New files

```
src/lib/practice.js                       # data layer — mirrors matches.js house style
src/components/practice/PracticeHub.jsx           # tab root; Browse | My sessions sub-tabs
src/components/practice/PracticeSlotList.jsx      # open slots, filtered by type/date
src/components/practice/PracticeSlotCard.jsx      # one slot; role + type + time + Book
src/components/practice/PracticeSlotComposer.jsx  # create a slot (adapted CoffeeChatModal)
src/components/practice/PracticeSessionCard.jsx   # a booked session row
src/components/practice/PracticeSessionDetail.jsx # detail: peer, time, chat link, cancel
src/components/practice/SessionConfirmCard.jsx    # generalised RecognitionCard
src/components/practice/PracticeFilters.jsx       # case | behavioral | technical + date
src/data/practiceOptions.js               # SESSION_TYPES, DURATIONS, canonical labels
```

### 8.4 Reused as-is

`AppScreen`, `Chip`, `PeerAvatar`, `AnonymousAvatar`, `NotificationBell`, `ErrorBoundary`, `ChatView` (via the linked `matches` row), `RecognitionCard` (after parameterisation), the `C` gold token object, `matchaCta`, `featureFlags.js`, `track()`.

### 8.5 Minimum first-version user flow

```
Practice tab
 └─ Browse
     ├─ [filters: case | behavioral | technical]
     ├─ Slot card: "Alice · will interview you · Case · Tue Aug 26, 3:00–3:45 PM EDT · Virtual"
     └─ tap Book  → confirm sheet → book_practice_slot() RPC
                  → session created + matches row (reveal accepted) + notification to host
 └─ My sessions
     ├─ Upcoming:  card + "Message" (opens existing ChatView) + "Cancel"
     └─ Past/awaiting: SessionConfirmCard
          "Did your case interview with Alice happen?"
             [Yes, it happened]  → confirmation row, outcome='completed'
             [They didn't show]  → confirmation row, outcome='no_show'
          → waiting for peer → verified ✓
 └─ Offer a slot (+)
     → role (interview / be interviewed) · type(s) · date · time · duration · virtual/in-person
```

Everything else — reminders, calendar export, ratings, credits, leaderboard, AI matching — is out of the first version.

---

## 9. Phased implementation plan

> **Prerequisite for every phase:** dump the live schema (`information_schema` + `pg_policies`) into `scripts/` **before** writing any migration. `scripts/` is known to have drifted (§1.4) and cannot be trusted as the baseline.

### Phase 1 — Database foundation

| | |
|---|---|
| **Files** | `scripts/migration-practice-core.sql` (new). Nothing in `src/` |
| **DB** | 3 tables, indexes, `touch_*` triggers, RLS policies, `book_practice_slot()` RPC, `sync_practice_session_status()` trigger, `guard_practice_session()` trigger, `practice_admin_report` view, `notifications_type_check` extension |
| **Dependencies** | Live schema dump. Decision on Q1/Q2/Q3 (§10) |
| **Risks** | **Highest-risk phase.** Runs against production (no staging). The `notifications_type_check` drop-and-recreate will break existing notification triggers if any current value is omitted |
| **Tests** | SQL assertion script run as service role: create two throwaway users, verify (a) B cannot insert a confirmation with `user_id = A`, (b) a second `book_practice_slot()` on the same slot fails, (c) one confirmation → `completed_pending_confirmation`, two → `verified`, (d) a client `UPDATE … SET status='verified'` is rejected, (e) every pre-existing notification type still inserts. Roll back in a transaction |
| **Done when** | All assertions pass; `scripts/migration-practice-core.sql` is idempotent on a second run; zero rows changed in any pre-existing table |

### Phase 2 — Session creation and confirmation (data layer)

| | |
|---|---|
| **Files** | `src/lib/practice.js` (new), `src/data/practiceOptions.js` (new) |
| **DB** | None |
| **Dependencies** | Phase 1 |
| **Risks** | Duplicate `matches` rows — `matches` has no unique constraint when `post_id IS NULL`. Use the lookup-first pattern from `openOrCreateDirectMatch()` |
| **Tests** | Node script against a test account exercising create-slot → book → confirm ×2 → verified, plus cancel and no-show. Manually assert RLS denials from the client, not just the service role |
| **Done when** | A full lifecycle runs end-to-end from the client with no UI; every function returns `{ data, error }` and no-ops when `!isSupabaseConfigured` |

### Phase 3 — Practice UI

| | |
|---|---|
| **Files** | `src/App.jsx` (tab entry + `practiceView` state + `TABS`), `src/components/practice/*` (new), `src/components/RecognitionCard.jsx` (parameterise), `src/components/PostHub.jsx` call site if Option A |
| **DB** | None |
| **Dependencies** | Phase 2; navigation decision (§8.1) |
| **Risks** | `App.jsx` is already 1,394 lines — adding another ternary branch worsens it. Keep all Practice sub-view logic **inside `PracticeHub`**, exposing a single `{tab === 'practice' && <PracticeHub … />}` branch. Timezone display is easy to get wrong; always render with an explicit zone label |
| **Tests** | Manual on iPhone SE / iPad Safari + one Android device (the last two builds both shipped layout fixes for exactly this). Verify the tab bar does not wrap. Verify a slot created in one zone reads correctly in another |
| **Done when** | Two real accounts can complete browse → book → chat → confirm → verified entirely in the UI; Discover, Post, Matches, and Events are visually and behaviourally unchanged |

### Phase 4 — Availability and booking polish

| | |
|---|---|
| **Files** | `src/components/practice/PracticeSlotComposer.jsx`, `PracticeFilters.jsx`, `src/lib/practice.js`; `api/cron/practice-sweep.js` (new); `vercel.json` (second cron entry) |
| **DB** | Possibly `profiles.timezone` (additive column, default `'America/Toronto'`) |
| **Dependencies** | Phase 3 |
| **Risks** | Vercel Hobby plans cap cron frequency — confirm the plan supports hourly before designing reminders around it. Recurring availability is a scope trap: **keep slots single-instance for the pilot** |
| **Tests** | Cron invoked manually with the `CRON_SECRET` header; verify expired open slots flip to `'expired'` and that booked sessions are never touched |
| **Done when** | Slots expire automatically, reminders send at a defined lead time, and unauthenticated cron calls are rejected |

### Phase 5 — Admin reporting

| | |
|---|---|
| **Files** | `scripts/practice-admin-queries.sql` (new); optionally `api/admin/practice-export.js` + a Practice section in `SettingsTab.jsx` |
| **DB** | `practice_admin_report` view (from Phase 1) |
| **Dependencies** | Real pilot data |
| **Risks** | Any in-app export needs the service role and must be gated by `isAdmin()` server-side. Do not add a JWT-email RLS policy |
| **Tests** | Verify a non-admin authenticated user gets zero rows / 403 from every reporting path |
| **Done when** | The founder can produce sessions-booked, sessions-verified, no-show rate, and unique-participant counts for a date range without ad-hoc SQL |

### Phase 6 — Analytics and pilot

| | |
|---|---|
| **Files** | `src/lib/analytics.js` call sites across `practice/*`; `src/lib/featureFlags.js` (`isPracticeEnabled`) |
| **DB** | None (`funnel_events` needs no change) |
| **Dependencies** | Phases 3–5 |
| **Risks** | `track()` is fire-and-forget and under-counts — treat `practice_sessions` rows as the source of truth and `funnel_events` as directional only |
| **Tests** | Confirm each `practice_*` event lands with the expected `properties`; confirm the flag hides the tab entirely for non-pilot accounts |
| **Done when** | A named Rotman pilot cohort has the tab, the funnel `practice_slot_viewed → practice_slot_booked → practice_session_verified` returns non-zero, and no non-pilot user can see Practice |

---

## 10. Risks and unresolved decisions

### Risks

1. **No staging environment.** One Supabase project serves dev and production. Every Practice migration will be applied to live user data on first run. *Mitigation: create a second Supabase project seeded from a schema-only dump and validate there first. If that is refused, wrap each migration in `BEGIN; … ROLLBACK;` for a dry run and keep a written down-migration.*
2. **`scripts/` has drifted from the live schema.** Proven by the `post_interactions` DELETE case. Any migration written against `scripts/` alone may conflict with reality.
3. **The `notifications_type_check` landmine.** That constraint is drop-and-recreate in four different migrations, each re-listing the full set. A Practice migration that adds `practice_booked` must re-list **all nine existing values** (`new_match, new_message, feedback_request, meeting_confirmed, review_received, event_cancelled, event_joined, event_message, event_below_min, marketplace_interest`) or several existing `SECURITY DEFINER` triggers will start raising and break event joins and marketplace interest.
4. **No tests, no types.** Zero test infrastructure and zero TypeScript. Correctness rests on manual QA. *Mitigation: add `vitest` for pure logic (status derivation, timezone formatting) only; do not attempt a broad testing retrofit inside this feature.*
5. **`App.jsx` size.** At 1,394 lines it is the single largest maintenance risk in the repo. Practice must not add more than one branch to it.
6. **Timezone correctness.** No `timezone` column exists anywhere, and the only existing scheduling UI builds dates in browser-local time. A Toronto-based pilot masks this until the first remote participant.
7. **Booking races.** Without the `SECURITY DEFINER` RPC, two simultaneous bookings both succeed.
8. **Duplicate practice chats.** `matches` UNIQUE `(post_id, helper_user_id)` does not apply when `post_id IS NULL`.
9. **Push/reminder reach.** Capacitor is installed but there is no push-notification plugin — reminders are email + in-app bell only.
10. **Pilot cold-start.** Practice only works if enough peers post availability. A slot marketplace with no supply looks broken. *Mitigation: seed the pilot with pre-committed interviewer slots before opening the tab.*

### Questions requiring founder confirmation

1. **Anonymity.** Are Practice slots and sessions always identity-visible (name + program shown before booking)? My model assumes **yes** — Discover's anonymity model does not fit a mock interview. Confirm.
2. **Navigation.** Option A (replace `Post` with `Practice`, keep `Home`) or Option B (the exact five requested tabs, which costs the `Home` surface and lifts `MyNetworkingDashboard` out of Events)?
3. **Chat.** Should a booked session auto-create a `matches` row so peers can message in the existing `ChatView`, or should the pilot ship without in-app messaging for Practice?
4. **Confirmation window.** How long after `scheduled_start` may a participant confirm — 7 days, 30 days, indefinitely? This determines whether the cron auto-closes stale sessions.
5. **Single-sided verification.** If one person confirms and the other never responds, does the session stay `completed_pending_confirmation` forever, or auto-verify after N days? (Auto-verify makes the metric forgeable; never auto-verifying under-counts real sessions.)
6. **Disputes.** When the two confirmations disagree, MVP marks it `disputed` and stops. Is founder-side manual resolution acceptable for the pilot?
7. **Cancellation policy.** Is there a lead-time rule (e.g. cancelling under 2h counts as a no-show), or is any cancellation neutral in the pilot?
8. **Recurring availability.** Single-instance slots only for v1 — confirm that weekly-recurring availability can wait.
9. **Practice requests.** Confirm that `host_role='candidate'` on `practice_slots` (a request *with* a proposed time) is acceptable, or whether an open, time-less "I need a case interview this week" request is required in v1. The latter needs a fourth table.
10. **Scope of "Rotman peer prep".** Is Practice restricted to institutional-email accounts, or open to every Mutu member? This affects the slot SELECT policy.

---

## Safe to reuse

- `matches` + `messages` + `ChatView` as the conversation layer for a session (link via `practice_sessions.match_id`, `matches.source = 'practice'`).
- `notifications` — table, RLS, realtime subscription, and `NotificationBell` UI.
- `funnel_events` + `track()` — no schema change needed.
- Email stack: `/api/send-email`, Resend, `api/_templates/*`, `email_subscriptions`, unsubscribe tokens.
- Vercel cron mechanism (`CRON_SECRET` + service-role client) in `api/cron/event-attendance-check.js`.
- `RecognitionCard` state machine — generalise from `matchId` to a pluggable subject.
- `CoffeeChatModal` as the visual template for a slot composer.
- `featureFlags.js` allowlist + `localStorage` override for pilot gating.
- `relationships.js` read-only union service — extend with a practice milestone.
- `AppScreen`, `Chip`, `PeerAvatar`, `AnonymousAvatar`, `ErrorBoundary`, `matchaCta`, the `C` gold tokens.
- `src/config/auth.js` + `src/lib/access.js` — the U of T gate needs no change.
- Security patterns worth copying verbatim: `guard_identity_reveal()` (transition guard), `check_event_capacity()` (DB-level race guard), `exchange_confirmations` (row-per-party consent), `recognition_received` (view-based column privacy).

## Must build

- `practice_slots`, `practice_sessions`, `practice_session_confirmations` (3 tables, indexes, RLS).
- `book_practice_slot()` `SECURITY DEFINER` RPC — the atomic booking + double-booking guard.
- `sync_practice_session_status()` trigger — derives `completed_pending_confirmation` / `verified` / `no_show` / `disputed`.
- `guard_practice_session()` BEFORE UPDATE trigger — restricts clients to `booked → cancelled`.
- `practice_admin_report` view (service-role only).
- `src/lib/practice.js` + `src/data/practiceOptions.js`.
- `src/components/practice/*` — hub, slot list, slot card, slot composer, session card, session detail, confirm card, filters.
- One new `App.jsx` tab branch + `TABS` entry.
- Timezone-aware date handling (nothing in the codebase does this today).
- `api/cron/practice-sweep.js` + a second `vercel.json` cron entry.
- Practice notification types (a CHECK extension that re-lists every existing value).
- A live-schema dump committed to `scripts/` as the migration baseline.

## Do not change

- `posts`, `profiles`, `matches`, `messages`, `post_interactions`, `exchange_confirmations`, `recognition_events`, `notifications` (columns and existing policies), and every `events*` table — **no renames, no drops, no column removals, no policy rewrites.** The only permitted touch is additive: the `notifications_type_check` value list.
- The Discover experience: `CardStack`, `RequestCard`, `RequestDetailModal`, `MatchModal`, the swipe → `createMatch` path, and the Discover ranking tiers.
- The identity-reveal system: `guard_identity_reveal()`, `reveal_match_after_meeting()`, and every `identity_reveal_*` column.
- Authentication and the U of T / invite gate: `src/config/auth.js`, `src/lib/access.js`, `src/lib/accessCodes.js`, `user_emails`, `invites`, `access_codes`.
- The Events feature and its 20+ components.
- The dormant `reviews` / `point_ledger` / `leaderboard` / `trust_signal` stack — leave it dormant; do not revive it and do not build Practice on it.
- Production data. No backfills, no updates to existing rows, no deletes.
- Per MVP constraints: no leaderboard, no ratings, no AI recommendations, no credit system, no workshop registration.

---

*Prepared as a read-only audit. No code, schema, or data was modified. Awaiting approval before any implementation.*
