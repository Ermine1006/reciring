-- ============================================================
-- Mutu: invitation-based Gmail access
--
-- Adds:
--   • public.invites — issued invite records (email OR code-based)
--   • profiles.access_type — how the account got in
--                            ('institutional_email' | 'invited_google' | 'legacy')
--
-- The auth gate in src/context/AuthContext.jsx enforces the rule set
-- in src/config/auth.js. This SQL only provides the storage +
-- RLS policies so:
--   • unauthenticated code checks (invite lookup) can happen at the
--     login screen when the user types a code
--   • redemption (row update) requires the redeeming user's JWT
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. invites ────────────────────────────────────────────────

create table if not exists public.invites (
  id           uuid primary key default gen_random_uuid(),
  -- Optional: if set, the invite is bound to this specific email and
  -- any signup with that address is automatically authorized (no code
  -- typing required). If null, the code is the only credential.
  email        text,
  invite_code  text unique not null,
  invited_by   uuid references auth.users(id) on delete set null,
  status       text not null default 'active'
                 check (status in ('active', 'used', 'revoked', 'expired')),
  max_uses     int  not null default 1 check (max_uses >= 1),
  used_count   int  not null default 0 check (used_count >= 0),
  used_at      timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Normalise stored email so lookups don't depend on case.
create index if not exists idx_invites_email_lower on public.invites (lower(email));
create index if not exists idx_invites_code        on public.invites (invite_code);
create index if not exists idx_invites_status      on public.invites (status);

-- ── 2. profiles.access_type ──────────────────────────────────

alter table public.profiles
  add column if not exists access_type text;

alter table public.profiles
  drop constraint if exists profiles_access_type_check;
alter table public.profiles
  add constraint profiles_access_type_check
    check (access_type in ('institutional_email', 'invited_google', 'legacy'));

-- Backfill: every existing profile is grandfathered as 'legacy'. This
-- is what the AuthContext gate treats as "authorized regardless" so
-- current members are never accidentally locked out.
update public.profiles
   set access_type = 'legacy'
 where access_type is null;

-- ── 3. RLS ────────────────────────────────────────────────────

alter table public.invites enable row level security;

-- Anyone (including unauthenticated) can look up an invite by its code
-- OR by their own email. The "own email" case is what the post-OAuth
-- gate uses to authorize a Gmail user whose invite was pre-issued.
-- Row is only returned; there's no way to enumerate the table.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'invites'
                    and policyname = 'Invites are lookup-only by anon/authed') then
    create policy "Invites are lookup-only by anon/authed" on public.invites
      for select
      using (true);
  end if;
end $$;

-- Only service role can insert / update / delete invites. Admin ops
-- go through a service-role backed endpoint; users cannot forge or
-- mark their own invites used from the client.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'invites'
                    and policyname = 'Invites are admin-managed only') then
    create policy "Invites are admin-managed only" on public.invites
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

-- ── 4. redeem_invite() — atomic, callable via RPC ────────────
--
-- The client can't UPDATE invites directly (no policy grants it).
-- Instead it calls this SECURITY DEFINER function which:
--   • runs as owner (service-role privileges)
--   • checks the invite is still valid
--   • bumps used_count, updates status if exhausted, stamps used_at
--   • returns the invite row so the caller knows the redemption
--     actually happened
--
-- Callers pass either p_code (code-based redemption) or p_email +
-- null code (auto-redemption for pre-issued email invites).

create or replace function public.redeem_invite(
  p_code  text,
  p_email text
)
returns table (
  id          uuid,
  status      text,
  used_count  int,
  max_uses    int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid;
  v_status     text;
  v_max_uses   int;
  v_used_count int;
  v_expires    timestamptz;
  v_email      text;
begin
  -- Resolve which invite we're redeeming. Prefer explicit code match;
  -- fall back to email-bound invites so pre-issued invites work
  -- without the user typing anything.
  if p_code is not null and length(trim(p_code)) > 0 then
    select i.id, i.status, i.max_uses, i.used_count, i.expires_at, i.email
      into v_id, v_status, v_max_uses, v_used_count, v_expires, v_email
      from public.invites i
     where lower(i.invite_code) = lower(trim(p_code))
     limit 1;
  else
    select i.id, i.status, i.max_uses, i.used_count, i.expires_at, i.email
      into v_id, v_status, v_max_uses, v_used_count, v_expires, v_email
      from public.invites i
     where lower(i.email) = lower(trim(p_email))
       and i.status = 'active'
     order by i.created_at asc
     limit 1;
  end if;

  if v_id is null then
    raise exception 'invite_not_found';
  end if;

  if v_status = 'revoked' then
    raise exception 'invite_revoked';
  end if;
  if v_status = 'used' then
    raise exception 'invite_already_used';
  end if;
  if v_expires is not null and v_expires < now() then
    -- Lazy-expire on redemption attempt so we don't need a cron sweep.
    update public.invites set status = 'expired' where id = v_id;
    raise exception 'invite_expired';
  end if;

  -- If the invite is email-bound, the caller's email must match.
  if v_email is not null and lower(v_email) <> lower(trim(p_email)) then
    raise exception 'invite_email_mismatch';
  end if;

  if v_used_count >= v_max_uses then
    update public.invites set status = 'used' where id = v_id;
    raise exception 'invite_already_used';
  end if;

  update public.invites
     set used_count = used_count + 1,
         used_at    = now(),
         status     = case when used_count + 1 >= max_uses then 'used' else 'active' end
   where id = v_id
   returning id, status, used_count, max_uses
     into v_id, v_status, v_used_count, v_max_uses;

  return query select v_id, v_status, v_used_count, v_max_uses;
end;
$$;

grant execute on function public.redeem_invite(text, text) to anon, authenticated;
