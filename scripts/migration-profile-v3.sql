-- ─────────────────────────────────────────────────────────────────────────
-- Profile redesign v3 — professional + personal matching
--
-- ADDITIVE and idempotent. This migration only ADDS columns/tables; it does
-- NOT drop or rewrite any legacy column. The legacy fields
--   industry_interests, can_help_with, skills_to_learn, networking_intent,
--   prompt_ask_me, prompt_weekend
-- stay exactly as-is so the current app keeps working and the change is fully
-- reversible until the new Profile is switched on for production.
--
-- The VALUE backfill (mapping legacy labels → canonical taxonomy ids, logging
-- anything unmapped, and flipping profile_v3_reviewed) is done in the app via
-- an idempotent one-time pass, NOT here, so ids stay canonical and every
-- dropped value is recorded. See src/lib/profileMigrateV3.js (Phase 5).
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────

-- 1 ── New structured + array columns on profiles (all additive) ───────────
alter table public.profiles
  -- Professional snapshot
  add column if not exists graduation_year      integer,
  add column if not exists title                text        not null default '',  -- current role/title (legacy `headline` migrates here)
  add column if not exists professional_headline text       not null default '',  -- 120-char one-liner (new; legacy `headline` was the role)
  add column if not exists company              text        not null default '',
  add column if not exists location             text        not null default '',
  -- Directional industries (replace the single, non-directional industry_interests)
  add column if not exists industries_known     text[] not null default '{}',
  add column if not exists industries_exploring text[] not null default '{}',
  -- Knowledge exchange — canonical TOPIC ids (NOT interaction formats)
  add column if not exists expertise_offered text[] not null default '{}',
  add column if not exists help_wanted       text[] not null default '{}',
  -- Life beyond work
  add column if not exists personal_interests    text[] not null default '{}',
  add column if not exists activity_preferences  text[] not null default '{}',
  -- Connection preferences — interaction formats (coffee chat, referral, …)
  add column if not exists helping_preferences   text[] not null default '{}',
  -- New free-text prompt ("Something I'd love to find people for…").
  -- prompt_ask_me + prompt_weekend already exist and are reused.
  add column if not exists prompt_seeking text not null default '',
  -- One-time "Review your updated profile" gate + audit stamp
  add column if not exists profile_v3_reviewed    boolean not null default false,
  add column if not exists profile_v3_migrated_at  timestamptz;

comment on column public.profiles.expertise_offered is 'Canonical TOPIC ids (src/data/profileTaxonomy.js) someone can genuinely come to this person for.';
comment on column public.profiles.help_wanted      is 'Canonical TOPIC ids this person is trying to learn/solve — the directional partner of expertise_offered.';
comment on column public.profiles.helping_preferences is 'Interaction formats (HELPING_PREFS ids). Kept separate from expertise on purpose.';

-- 2 ── Custom-tag review queue ─────────────────────────────────────────────
-- User "Add your own" submissions are sanitized client-side and queued here
-- for taxonomy review WITHOUT blocking profile completion.
create table if not exists public.profile_custom_tags (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('expertise','help','industry','interest','activity')),
  raw_label      text not null,
  sanitized_label text not null,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  promoted_to_id text,                      -- canonical id once approved
  created_at     timestamptz not null default now()
);
create index if not exists idx_profile_custom_tags_user   on public.profile_custom_tags (user_id);
create index if not exists idx_profile_custom_tags_status on public.profile_custom_tags (status) where status = 'pending';

alter table public.profile_custom_tags enable row level security;
do $$ begin
  create policy "custom_tags_own_read"   on public.profile_custom_tags for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "custom_tags_own_insert" on public.profile_custom_tags for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- 3 ── Migration log — never silently discard a legacy value ───────────────
-- The app-side backfill writes one row here for every legacy value it could
-- not map to a canonical id, so nothing is lost and the review is auditable.
create table if not exists public.profile_migration_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  field        text not null,          -- e.g. 'industry_interests', 'can_help_with'
  legacy_value text not null,
  note         text,                   -- e.g. 'unmapped', 'moved to helping_preferences'
  created_at   timestamptz not null default now()
);
create index if not exists idx_profile_migration_log_user on public.profile_migration_log (user_id);

alter table public.profile_migration_log enable row level security;
do $$ begin
  create policy "migration_log_own_read" on public.profile_migration_log for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "migration_log_own_insert" on public.profile_migration_log for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Legacy columns intentionally left in place:
--   industry_interests, can_help_with, skills_to_learn, networking_intent,
--   prompt_ask_me, prompt_weekend, career_stage, headline
-- They are read by the app-side backfill and can be dropped in a LATER
-- migration only after the v3 Profile is fully live and verified.
