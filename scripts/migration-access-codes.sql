-- ============================================================
-- Mutu: unified access codes (invite + referral)
--
-- Replaces the invite-only model (see migration-invites.sql) with a
-- single access_codes table that supports BOTH admin-issued invites
-- and member-issued referrals under one lookup path.
--
-- Rules a Gmail user can enter Mutu by:
--   • Enters a code that exists in access_codes, status='active',
--     used_count < max_uses, not expired.
--   • If code_type='referral', the code's creator must be a currently
--     active verified member.
--
-- Older invites data is copied into access_codes as code_type='invite'
-- so nothing already handed out gets invalidated. The old invites
-- table stays for now (dropped in a future migration once we're sure
-- nothing still reads it).
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. access_codes ───────────────────────────────────────────

create table if not exists public.access_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  code_type           text not null check (code_type in (
                        'invite',    -- admin- or system-issued
                        'referral',  -- issued by an existing verified member
                        'premium'    -- pre-paid / admin-approved
                      )),
  created_by_user_id  uuid references auth.users(id) on delete set null,
  status              text not null default 'active'
                        check (status in ('active', 'used', 'revoked', 'expired')),
  max_uses            int  not null default 1 check (max_uses >= 1),
  used_count          int  not null default 0 check (used_count >= 0),
  expires_at          timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_access_codes_code   on public.access_codes (code);
create index if not exists idx_access_codes_status on public.access_codes (status);
create index if not exists idx_access_codes_type   on public.access_codes (code_type);

-- ── 2. access_code_redemptions ────────────────────────────────

create table if not exists public.access_code_redemptions (
  id                    uuid primary key default gen_random_uuid(),
  access_code_id        uuid not null references public.access_codes(id) on delete cascade,
  redeemed_by_user_id   uuid references auth.users(id) on delete set null,
  redeemed_by_email     text not null,
  redeemed_at           timestamptz not null default now()
);

create index if not exists idx_redemptions_code_id on public.access_code_redemptions (access_code_id);
create index if not exists idx_redemptions_user_id on public.access_code_redemptions (redeemed_by_user_id);

-- ── 3. profiles: referral tracking columns ────────────────────
--
-- referred_by_user_id — populated when access_type='referral_code';
--                       lets us build referral chains + reward loops
-- joined_with_code    — the raw code the user redeemed on signup;
--                       kept for audit + support-ticket lookups

alter table public.profiles
  add column if not exists referred_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists joined_with_code    text;

-- Extend the access_type CHECK to allow referral_code + admin_approved.
alter table public.profiles
  drop constraint if exists profiles_access_type_check;
alter table public.profiles
  add constraint profiles_access_type_check
    check (access_type in (
      'institutional_email',
      'linked_google',
      'linked_personal_email',
      'invite_code',
      'referral_code',
      'premium',
      'admin_approved',
      'legacy'
    ));

-- ── 4. Backfill: invites → access_codes ──────────────────────
--
-- Preserves every existing invite as an equivalent access_codes row.
-- The migration is idempotent because of the ON CONFLICT clause;
-- re-running is a no-op after the first pass.

insert into public.access_codes (
  code, code_type, created_by_user_id, status, max_uses, used_count, expires_at, created_at
)
select
  i.invite_code,
  'invite',
  i.invited_by,
  i.status,
  i.max_uses,
  i.used_count,
  i.expires_at,
  i.created_at
from public.invites i
where not exists (
  select 1 from public.access_codes ac where ac.code = i.invite_code
);

-- ── 5. RLS ────────────────────────────────────────────────────

alter table public.access_codes            enable row level security;
alter table public.access_code_redemptions enable row level security;

-- SELECT open on codes so anon can validate a code before signing in.
-- The RPC below is the ONLY write path from client — no INSERT/UPDATE
-- policy exists for authenticated/anon, so users can't forge or
-- redeem codes directly.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'access_codes'
                    and policyname = 'access_codes read-any') then
    create policy "access_codes read-any" on public.access_codes
      for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'access_codes'
                    and policyname = 'access_codes service-role writes') then
    create policy "access_codes service-role writes" on public.access_codes
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- Redemptions are audit-only: authenticated users see their own row
-- so the client can confirm redemption completed. Service role can
-- see everything.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'access_code_redemptions'
                    and policyname = 'redemptions self-read') then
    create policy "redemptions self-read" on public.access_code_redemptions
      for select using (auth.uid() = redeemed_by_user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'access_code_redemptions'
                    and policyname = 'redemptions service-role writes') then
    create policy "redemptions service-role writes" on public.access_code_redemptions
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ── 6. redeem_access_code() — atomic RPC ─────────────────────
--
-- Single entry point for redemption. Validates the code, checks
-- referral integrity, bumps used_count, flips status when exhausted,
-- writes the redemption audit row. Wrapped in SECURITY DEFINER so
-- the client can call it without direct table-write privileges.
--
-- Returns:
--   ( access_code_id, code_type, status, created_by_user_id )
-- Raises named exceptions on failure so the client can map to UI
-- messages: code_not_found · code_revoked · code_expired
--   · code_already_used · code_referrer_inactive

create or replace function public.redeem_access_code(
  p_code    text,
  p_email   text,
  p_user_id uuid
)
returns table (
  access_code_id     uuid,
  code_type          text,
  status             text,
  created_by_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id                 uuid;
  v_type               text;
  v_status             text;
  v_max_uses           int;
  v_used_count         int;
  v_expires_at         timestamptz;
  v_created_by         uuid;
  v_referrer_active    boolean;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'code_not_found';
  end if;

  select ac.id, ac.code_type, ac.status, ac.max_uses, ac.used_count,
         ac.expires_at, ac.created_by_user_id
    into v_id, v_type, v_status, v_max_uses, v_used_count,
         v_expires_at, v_created_by
    from public.access_codes ac
   where lower(ac.code) = lower(trim(p_code))
   limit 1;

  if v_id is null                                    then raise exception 'code_not_found';       end if;
  if v_status = 'revoked'                            then raise exception 'code_revoked';         end if;
  if v_status = 'used'                               then raise exception 'code_already_used';    end if;
  if v_expires_at is not null and v_expires_at < now() then
    -- Lazy-expire so we don't need a cron sweep.
    update public.access_codes set status = 'expired' where id = v_id;
    raise exception 'code_expired';
  end if;
  if v_used_count >= v_max_uses                      then
    update public.access_codes set status = 'used' where id = v_id;
    raise exception 'code_already_used';
  end if;

  -- Referral integrity: the creator must be an active verified member.
  -- Institutional signups pass this check trivially; blocked/expired
  -- members can't refer even if they still have a live profile row.
  if v_type = 'referral' then
    select (p.access_status = 'active')
           and exists (
             select 1 from public.user_emails ue
              where ue.user_id = p.id and ue.is_verified = true
           )
      into v_referrer_active
      from public.profiles p
     where p.id = v_created_by;
    if v_referrer_active is null or not v_referrer_active then
      raise exception 'code_referrer_inactive';
    end if;
  end if;

  update public.access_codes
     set used_count = used_count + 1,
         status     = case when used_count + 1 >= max_uses then 'used' else 'active' end
   where id = v_id
   returning code_type, status, created_by_user_id
     into v_type, v_status, v_created_by;

  insert into public.access_code_redemptions (
    access_code_id, redeemed_by_user_id, redeemed_by_email
  ) values (v_id, p_user_id, lower(trim(p_email)));

  return query select v_id, v_type, v_status, v_created_by;
end;
$$;

grant execute on function public.redeem_access_code(text, text, uuid) to anon, authenticated;
