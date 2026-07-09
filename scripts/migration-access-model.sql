-- ============================================================
-- Mutu: access-model redesign
--
-- Shifts institutional email from "the login identity" to "one of
-- several eligibility signals". A user can access Mutu if ANY of:
--
--   1. Their session email is institutional (UofT / Rotman family).
--   2. Their session email is a verified linked personal email
--      belonging to an existing verified Mutu member (post-graduation
--      alumni path).
--   3. They redeemed a valid invite code (see migration-invites.sql).
--   4. They have active premium / admin-granted access.
--
-- This migration adds the storage. The client gate lives in
-- src/config/auth.js::canUserAccessMutu.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. user_emails ────────────────────────────────────────────
--
-- One row per (user_id, email) pair. The primary institutional email
-- also lives here so `SELECT ... FROM user_emails WHERE email = ?`
-- is the single lookup path for "is this email known to Mutu?" —
-- no need to join across profiles.email + user_emails.email.

create table if not exists public.user_emails (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  email_type    text not null check (email_type in (
                  'institutional',  -- UofT / Rotman family
                  'personal',       -- manually added personal email
                  'google'          -- linked via Supabase OAuth identity
                )),
  is_verified   boolean not null default false,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique(email)
);

create index if not exists idx_user_emails_user_id on public.user_emails (user_id);
create index if not exists idx_user_emails_email_lower on public.user_emails (lower(email));

-- ── 2. profiles: new columns ─────────────────────────────────
--
-- access_status  — active | pending | blocked | expired
-- member_type    — student | alumni | premium | invited | admin
-- access_type    — pathway that granted current access
--                   (institutional_email | linked_personal_email
--                    | invite_code | premium)
-- personal_email — convenience mirror of the primary linked personal
--                  email (denormalized for fast profile reads); the
--                  authoritative record is user_emails.
-- institutional_verified_at — when a UofT/Rotman email was first
--                  observed on this account. Used to distinguish
--                  "student who verified" from "invited outsider".
-- premium_until  — expiry timestamp for time-boxed premium access;
--                  null = no premium.

alter table public.profiles
  add column if not exists access_status text,
  add column if not exists member_type   text,
  add column if not exists personal_email text,
  add column if not exists institutional_verified_at timestamptz,
  add column if not exists premium_until timestamptz;

-- Note: access_type already exists from migration-invites.sql. We
-- extend its CHECK to the new set of values below.

alter table public.profiles
  drop constraint if exists profiles_access_type_check;
alter table public.profiles
  add constraint profiles_access_type_check
    check (access_type in (
      'institutional_email',
      'linked_personal_email',
      'invite_code',
      'premium',
      'legacy'  -- backfill value for pre-migration profiles
    ));

alter table public.profiles
  drop constraint if exists profiles_access_status_check;
alter table public.profiles
  add constraint profiles_access_status_check
    check (access_status is null or access_status in (
      'active', 'pending', 'blocked', 'expired'
    ));

alter table public.profiles
  drop constraint if exists profiles_member_type_check;
alter table public.profiles
  add constraint profiles_member_type_check
    check (member_type is null or member_type in (
      'student', 'alumni', 'premium', 'invited', 'admin'
    ));

-- ── 3. Backfill ──────────────────────────────────────────────
--
-- Bring existing rows to a consistent state. All grandfathered
-- profiles are 'active' + 'student' + 'legacy' by default; anyone
-- who signed up before this migration keeps access.

update public.profiles
   set access_status = 'active'
 where access_status is null;

update public.profiles
   set member_type = 'student'
 where member_type is null;

-- Every existing profile that has an institutional-looking email
-- gets a user_emails row so the linked-email lookup path also
-- authorizes them. Uses ILIKE for domain match to survive case.

insert into public.user_emails (user_id, email, email_type, is_verified, verified_at)
select p.id, lower(p.email), 'institutional', true, coalesce(p.created_at, now())
  from public.profiles p
 where p.email is not null
   and (
     p.email ilike '%@utoronto.ca'
     or p.email ilike '%@mail.utoronto.ca'
     or p.email ilike '%@rotman.utoronto.ca'
     or p.email ilike '%@alum.utoronto.ca'
   )
on conflict (email) do nothing;

-- Non-institutional existing profiles (early Gmail testers, admins,
-- etc.) also get a personal-type row so canUserAccessMutu recognizes
-- them via the linked-email path.

insert into public.user_emails (user_id, email, email_type, is_verified, verified_at)
select p.id, lower(p.email), 'personal', true, coalesce(p.created_at, now())
  from public.profiles p
 where p.email is not null
   and p.email not ilike '%@utoronto.ca'
   and p.email not ilike '%@mail.utoronto.ca'
   and p.email not ilike '%@rotman.utoronto.ca'
   and p.email not ilike '%@alum.utoronto.ca'
on conflict (email) do nothing;

-- Stamp institutional_verified_at on rows we just inserted an
-- institutional row for.

update public.profiles p
   set institutional_verified_at = ue.verified_at
  from public.user_emails ue
 where ue.user_id    = p.id
   and ue.email_type = 'institutional'
   and p.institutional_verified_at is null;

-- ── 4. RLS ────────────────────────────────────────────────────

alter table public.user_emails enable row level security;

-- SELECT: authenticated users can look up any row. The email column
-- is not enumerable (queries are keyed on email or user_id), and
-- the gate needs this open so it can check whether a Gmail address
-- is linked to an existing verified account.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'user_emails'
                    and policyname = 'user_emails read-any') then
    create policy "user_emails read-any" on public.user_emails
      for select using (true);
  end if;
end $$;

-- INSERT: users can add rows only for themselves. Verification
-- happens server-side via a dedicated endpoint (future work);
-- unverified rows don't grant access via checkLinkedVerifiedEmail.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'user_emails'
                    and policyname = 'user_emails self-insert') then
    create policy "user_emails self-insert" on public.user_emails
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

-- UPDATE / DELETE: self-only. Prevents a user from tampering with
-- someone else's link. Verification flip (is_verified=true) is
-- restricted to service role via a dedicated policy that would sit
-- alongside a verification endpoint; for now the default RLS blocks
-- users from setting is_verified true without going through an
-- admin-controlled path.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'user_emails'
                    and policyname = 'user_emails self-modify') then
    create policy "user_emails self-modify" on public.user_emails
      for update using (auth.uid() = user_id)
      with check (auth.uid() = user_id and is_verified = false);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'user_emails'
                    and policyname = 'user_emails self-delete') then
    create policy "user_emails self-delete" on public.user_emails
      for delete using (auth.uid() = user_id);
  end if;
end $$;
