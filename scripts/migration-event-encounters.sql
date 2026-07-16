-- ============================================================
-- Mutu: Event Networking Memory
--
-- Persists the manual "I met this person" prototype flow. The
-- architecture leaves the door open for BLE / NFC / QR / voice
-- detectors later — any future detector writes to the same
-- event_encounters table with a different `source` value, and the
-- rest of the app doesn't care where the row came from.
--
-- Privacy model (enforced by RLS):
--   • Encounter rows are owner-only: only the user_id who recorded
--     the encounter can SELECT / UPDATE / DELETE it. The encountered
--     party CANNOT see any private_note or topics stored on the row.
--   • Emails never appear on any encounter row. The UI joins to
--     public.profiles for display purposes only; the RLS on profiles
--     (from earlier migrations) governs what's readable.
--   • Event hosts have no special access; the encounter table is
--     invisible to them unless they themselves recorded the row.
--
-- Confirmation flow uses a second table (encounter_confirmation_
-- requests) so the target user can respond WITHOUT ever seeing the
-- requester's private_note or topics — they only see the request
-- row, which has no note fields.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. event_encounters ──────────────────────────────────────

create table if not exists public.event_encounters (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  encountered_user_id   uuid not null references auth.users(id) on delete cascade,
  -- self_recorded          — I ticked "I met this person" and moved on
  -- confirmation_requested — I asked them to confirm; awaiting response
  -- mutually_confirmed     — they accepted; both sides have a row
  status                text not null default 'self_recorded'
                          check (status in (
                            'self_recorded',
                            'confirmation_requested',
                            'mutually_confirmed'
                          )),
  -- Free-form conversation topic tags (chip UI in EventMemoryModal).
  topics                text[] not null default '{}',
  -- Owner-only private note. RLS ensures the encountered_user cannot
  -- read this column even though they can see they were encountered
  -- (via the mirror row created on mutual confirmation).
  private_note          text,
  -- Distinguishes the detection method for future BLE/NFC/QR/voice
  -- integrations; MVP always writes 'manual'.
  source                text not null default 'manual'
                          check (source in ('manual', 'qr', 'nfc', 'ble', 'voice')),
  created_at            timestamptz not null default now(),
  confirmed_at          timestamptz,
  followed_up_at        timestamptz,
  -- Prevents duplicate self-records for the same (event, other-user).
  -- Re-tapping "I met" on someone already in memory is an update, not
  -- an insert.
  unique (user_id, event_id, encountered_user_id)
);

create index if not exists idx_encounters_user_event
  on public.event_encounters (user_id, event_id);
create index if not exists idx_encounters_encountered_user
  on public.event_encounters (encountered_user_id);
create index if not exists idx_encounters_event
  on public.event_encounters (event_id);

-- ── 2. encounter_confirmation_requests ───────────────────────
--
-- One-shot request from requester_user_id → target_user_id. When
-- the target accepts, the client (a) UPDATEs the requester's
-- encounter row to 'mutually_confirmed', and (b) upserts a mirror
-- encounter row for the target so THEIR memory of the event also
-- includes the requester. Neither the requester's nor the target's
-- private_note is ever exposed to the other party.

create table if not exists public.encounter_confirmation_requests (
  id                    uuid primary key default gen_random_uuid(),
  encounter_id          uuid not null references public.event_encounters(id) on delete cascade,
  event_id              uuid not null references public.events(id) on delete cascade,
  requester_user_id     uuid not null references auth.users(id) on delete cascade,
  target_user_id        uuid not null references auth.users(id) on delete cascade,
  status                text not null default 'pending'
                          check (status in ('pending', 'accepted', 'declined')),
  responded_at          timestamptz,
  created_at            timestamptz not null default now(),
  unique (encounter_id)
);

create index if not exists idx_confirmations_target_pending
  on public.encounter_confirmation_requests (target_user_id, status);

-- ── 3. RLS ────────────────────────────────────────────────────

alter table public.event_encounters                  enable row level security;
alter table public.encounter_confirmation_requests   enable row level security;

-- Encounters: owner-only for every operation. Private notes and
-- topics stay strictly with the person who wrote them.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'event_encounters'
                    and policyname = 'encounters self-select') then
    create policy "encounters self-select" on public.event_encounters
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'event_encounters'
                    and policyname = 'encounters self-insert') then
    create policy "encounters self-insert" on public.event_encounters
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'event_encounters'
                    and policyname = 'encounters self-update') then
    create policy "encounters self-update" on public.event_encounters
      for update using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'event_encounters'
                    and policyname = 'encounters self-delete') then
    create policy "encounters self-delete" on public.event_encounters
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Confirmation requests: requester + target can BOTH read the row
-- (target needs to see their pending inbox; requester needs to see
-- responses). Only the requester can create. Only the target can
-- update to accepted/declined.
do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'encounter_confirmation_requests'
                    and policyname = 'confirmations read-parties') then
    create policy "confirmations read-parties" on public.encounter_confirmation_requests
      for select using (
        auth.uid() = requester_user_id
        or auth.uid() = target_user_id
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'encounter_confirmation_requests'
                    and policyname = 'confirmations requester-insert') then
    create policy "confirmations requester-insert" on public.encounter_confirmation_requests
      for insert with check (auth.uid() = requester_user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies
                  where tablename = 'encounter_confirmation_requests'
                    and policyname = 'confirmations target-respond') then
    create policy "confirmations target-respond" on public.encounter_confirmation_requests
      for update using (auth.uid() = target_user_id)
      with check (auth.uid() = target_user_id);
  end if;
end $$;
