-- ─────────────────────────────────────────────────────────────────────────
-- LinkedIn-assisted profile — connection metadata (additive, idempotent).
--
-- Stores ONLY the minimum needed to show connection status and protect against
-- duplicate links. No access/refresh tokens are ever stored here — those stay
-- in Supabase Auth's identity storage. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists linkedin_subject          text,          -- OIDC `sub`; identity dedupe only
  add column if not exists linkedin_profile_url       text,          -- user-typed/confirmed URL (never scraped)
  add column if not exists linkedin_connected_at       timestamptz,
  add column if not exists linkedin_imported_fields     text[] not null default '{}',
  add column if not exists profile_source_updated_at    timestamptz;

-- Duplicate-account protection: one LinkedIn subject maps to at most one Mutu
-- profile. (Partial index so the many NULLs don't collide.)
create unique index if not exists profiles_linkedin_subject_unique
  on public.profiles (linkedin_subject)
  where linkedin_subject is not null;

comment on column public.profiles.linkedin_subject is 'LinkedIn OIDC subject (sub). Connection/dedupe only — not shown in public profile reads.';
comment on column public.profiles.linkedin_imported_fields is 'Field names the user accepted from the LinkedIn import, for audit/analytics.';
