-- ─────────────────────────────────────────────────────────────────────────
-- Luma integration — extends the EXISTING events + event_attendees tables.
-- Additive and idempotent. Nothing is dropped. Safe to re-run.
--
-- The LUMA_API_KEY is NEVER referenced here — it lives only in Supabase Edge
-- Function secrets. This migration just prepares the schema the sync-luma-events
-- and luma-webhook functions write into.
-- ─────────────────────────────────────────────────────────────────────────

-- 1 ── events: where the event came from + Luma linkage ────────────────────
alter table public.events
  add column if not exists source          text not null default 'mutu',
  add column if not exists luma_event_id    text,
  add column if not exists luma_event_url   text,
  add column if not exists luma_access      text,        -- 'managed' | 'external'
  add column if not exists attendee_count   integer,     -- authoritative count from Luma (Mutu events still compute live)
  add column if not exists last_synced_at   timestamptz;

do $$ begin
  alter table public.events add constraint events_source_check check (source in ('mutu','luma'));
exception when duplicate_object then null; end $$;

-- Imported Luma events have no Mutu host user — make host_user_id nullable.
-- Mutu-native events still set it; host-only edit RLS (host_user_id = auth.uid())
-- simply never matches a NULL, so Luma events aren't client-editable. Good.
alter table public.events alter column host_user_id drop not null;

-- One Mutu row per external Luma event (the unique external id).
create unique index if not exists events_luma_event_id_unique
  on public.events (luma_event_id) where luma_event_id is not null;

-- 2 ── event_attendees: Luma guest linkage ─────────────────────────────────
-- A Luma guest may not be a Mutu member, so user_id becomes nullable. The
-- existing UNIQUE(event_id,user_id) still holds for members (NULLs are distinct
-- in Postgres, so many non-member guests coexist).
alter table public.event_attendees alter column user_id drop not null;

alter table public.event_attendees
  add column if not exists luma_guest_id       text,
  add column if not exists guest_email         text,       -- PRIVATE — see the REVOKE below
  add column if not exists approval_status      text not null default 'approved',
  add column if not exists checked_in_at        timestamptz,
  add column if not exists registration_source  text not null default 'mutu',
  add column if not exists visibility           text not null default 'visible',
  add column if not exists synced_at            timestamptz;

do $$ begin
  alter table public.event_attendees add constraint ea_registration_source_check
    check (registration_source in ('mutu','luma'));
exception when duplicate_object then null; end $$;

-- One row per Luma guest per event (upsert target for sync/webhook).
create unique index if not exists event_attendees_luma_guest_unique
  on public.event_attendees (event_id, luma_guest_id) where luma_guest_id is not null;
create index if not exists event_attendees_email_idx
  on public.event_attendees (lower(guest_email)) where guest_email is not null;

-- 3 ── Never expose raw guest emails to other users ────────────────────────
-- Column-level lockdown: only the service role (used by the Edge Functions)
-- can read guest_email. Client roles keep row access for the attendee list but
-- cannot select this column. The app already selects explicit columns (never
-- `select *` on event_attendees), so this does not break existing queries.
revoke select (guest_email) on public.event_attendees from authenticated;
revoke select (guest_email) on public.event_attendees from anon;

-- 4 ── Capacity trigger: Luma owns capacity for Luma-sourced events ────────
-- Mutu-native events keep the max_attendees guard; Luma events do not (Luma is
-- the source of truth for their capacity, and a sold-out Luma event can have
-- more guests than any Mutu cap). Guarding on the EVENT's source (not a
-- client-supplied column) means a user can't bypass the Mutu cap.
create or replace function public.check_event_capacity()
returns trigger as $$
declare
  cap    integer;
  src    text;
  filled integer;
begin
  select max_attendees, source into cap, src from public.events where id = new.event_id;
  if cap is null then
    raise exception 'Event % does not exist', new.event_id;
  end if;
  if src = 'luma' then
    return new; -- Luma manages its own capacity
  end if;
  select count(*) into filled from public.event_attendees where event_id = new.event_id;
  if filled >= cap then
    raise exception 'Event is at capacity (%/%)', filled, cap;
  end if;
  return new;
end;
$$ language plpgsql;

-- 5 ── Sync bookkeeping ────────────────────────────────────────────────────
-- Track sync runs so we can show "last updated" and debug drift. Owned by the
-- service role only (no client RLS policy → clients can't read it).
create table if not exists public.luma_sync_log (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,               -- 'calendar_sync' | 'webhook'
  luma_event_id text,
  event_type    text,                       -- webhook event name
  ok            boolean not null default true,
  detail        text,
  created_at    timestamptz not null default now()
);
alter table public.luma_sync_log enable row level security; -- no policies = service-role only

-- Legacy columns / behaviour left intact: existing Mutu events default
-- source='mutu' and are unaffected; the attendee list, capacity guard, and RLS
-- for Mutu-native joins work exactly as before.
