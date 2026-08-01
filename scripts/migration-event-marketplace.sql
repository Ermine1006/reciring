-- ReciRing / Mutu — Event Marketplace (prototype / MVP)
--
-- A per-event marketplace where attendees post ONE "need" and ONE "offer",
-- browse others' posts anonymously (program + industry only — no name/email/
-- photo), and click "I'm Interested". The post owner accepts / declines / not-
-- now. On ACCEPT, identities are revealed and a private 1:1 chat opens — this
-- reuses the existing matches + messages + ChatView stack by creating an
-- event-based match row (post_id NULL, marketplace_post_id set) that is born
-- already identity-reveal-accepted.
--
-- Privacy model (column-level, DB-enforced for browsing):
--   • Browsing goes through the `event_marketplace_feed` VIEW, which projects
--     only program + industry_interests + headline — never name/email/avatar.
--     The view is owner-rights (bypasses the base profiles RLS) and self-scopes
--     to events the caller attends or hosts.
--   • The base posts table's SELECT policy is owner-only OR a party to an
--     ACCEPTED interest — so a non-accepted browser can't read another poster's
--     row directly; they only ever see the anonymised view.
--
-- Run this in the Supabase SQL Editor. Idempotent / safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- ═══ 1. Tables ═══════════════════════════════════════════════

-- 1a. Marketplace posts — at most one 'need' + one 'offer' per user per event.
create table if not exists public.event_marketplace_posts (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('need','offer')),
  title       text not null,
  description text not null default '',
  tags        text[] not null default '{}',
  urgency     text,                              -- optional, e.g. 'This week'
  status      text not null default 'active' check (status in ('active','closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, user_id, type)               -- 1 need + 1 offer cap
);

create index if not exists idx_mktpost_event on public.event_marketplace_posts (event_id, created_at desc);

-- 1b. Extend matches so a match can be born from a marketplace connection
--     instead of a peer-networking post.
alter table public.matches alter column post_id drop not null;
alter table public.matches add column if not exists event_id            uuid references public.events(id) on delete cascade;
alter table public.matches add column if not exists marketplace_post_id uuid references public.event_marketplace_posts(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_source_chk'
  ) then
    alter table public.matches
      add constraint matches_source_chk
      check (post_id is not null or marketplace_post_id is not null);
  end if;
end $$;

-- 1c. Interest expressions. match_id is filled once accepted.
create table if not exists public.event_marketplace_interest (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.event_marketplace_posts(id) on delete cascade,
  event_id     uuid not null references public.events(id)   on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  match_id     uuid references public.matches(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (post_id, requester_id)                 -- one interest per person per post
);

create index if not exists idx_mktint_owner   on public.event_marketplace_interest (owner_id, status);
create index if not exists idx_mktint_post     on public.event_marketplace_interest (post_id);


-- ═══ 2. RLS ══════════════════════════════════════════════════

alter table public.event_marketplace_posts    enable row level security;
alter table public.event_marketplace_interest enable row level security;

-- Helper predicate reused below: is the caller an attendee or the host of EVT?
-- (Inlined in each policy — no SQL function, to keep the migration self-contained.)

-- Posts: SELECT on the base table is deliberately NARROW (browsing uses the
-- anonymised view). Owner reads their own; a party to an accepted interest can
-- read the post they connected about (needed for the chat context embed).
drop policy if exists "Mkt posts: owner or accepted party reads" on public.event_marketplace_posts;
create policy "Mkt posts: owner or accepted party reads"
  on public.event_marketplace_posts for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.event_marketplace_interest i
      where i.post_id = id
        and i.status = 'accepted'
        and auth.uid() in (i.requester_id, i.owner_id)
    )
  );

-- Posts: a user creates their OWN post, only in an event they attend or host.
drop policy if exists "Mkt posts: attendee creates own" on public.event_marketplace_posts;
create policy "Mkt posts: attendee creates own"
  on public.event_marketplace_posts for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (select 1 from public.event_attendees a where a.event_id = event_marketplace_posts.event_id and a.user_id = auth.uid())
      or exists (select 1 from public.events e where e.id = event_marketplace_posts.event_id and e.host_user_id = auth.uid())
    )
  );

drop policy if exists "Mkt posts: owner edits own" on public.event_marketplace_posts;
create policy "Mkt posts: owner edits own"
  on public.event_marketplace_posts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Mkt posts: owner deletes own" on public.event_marketplace_posts;
create policy "Mkt posts: owner deletes own"
  on public.event_marketplace_posts for delete to authenticated
  using (user_id = auth.uid());

-- Interest: both parties can read their own interest rows.
drop policy if exists "Mkt interest: parties read" on public.event_marketplace_interest;
create policy "Mkt interest: parties read"
  on public.event_marketplace_interest for select to authenticated
  using (auth.uid() in (requester_id, owner_id));

-- Interest: the requester creates it, only against a real post, and owner_id
-- must equal that post's owner (so it can't be spoofed). Can't express interest
-- in your own post.
drop policy if exists "Mkt interest: requester creates" on public.event_marketplace_interest;
create policy "Mkt interest: requester creates"
  on public.event_marketplace_interest for insert to authenticated
  with check (
    requester_id = auth.uid()
    and owner_id <> auth.uid()
    and exists (
      select 1 from public.event_marketplace_posts p
      where p.id = post_id
        and p.user_id = owner_id
        and p.event_id = event_marketplace_interest.event_id
    )
  );

-- Interest: owner may accept/decline; requester may cancel. The transition
-- guard trigger (below) enforces WHICH side may set WHICH status.
drop policy if exists "Mkt interest: parties update" on public.event_marketplace_interest;
create policy "Mkt interest: parties update"
  on public.event_marketplace_interest for update to authenticated
  using (auth.uid() in (requester_id, owner_id))
  with check (auth.uid() in (requester_id, owner_id));


-- ═══ 3. Anonymised browsing view ═════════════════════════════
-- Projects ONLY non-identifying poster attributes. Owner-rights (not
-- security_invoker) so it can read program/industry past the caller's own
-- profile RLS, but exposes no name/email/avatar. Self-scopes to events the
-- caller attends or hosts, so only attendees browse a given event's board.
drop view if exists public.event_marketplace_feed;
create view public.event_marketplace_feed as
  select
    p.id, p.event_id, p.user_id, p.type, p.title, p.description,
    p.tags, p.urgency, p.status, p.created_at,
    prof.program            as poster_program,
    prof.headline           as poster_headline,
    prof.industry_interests as poster_industry
  from public.event_marketplace_posts p
  join public.profiles prof on prof.id = p.user_id
  where p.status = 'active'
    and (
      exists (select 1 from public.event_attendees a where a.event_id = p.event_id and a.user_id = auth.uid())
      or exists (select 1 from public.events e where e.id = p.event_id and e.host_user_id = auth.uid())
    );

grant select on public.event_marketplace_feed to authenticated;

-- Interest rows with the REQUESTER shown anonymously (program + industry only,
-- never name/email/avatar) — for the owner's "who's interested" manage sheet
-- BEFORE acceptance. Owner-rights, self-scoped to the two parties. After
-- acceptance the real identity comes from the match / fetchPeerProfile.
drop view if exists public.event_marketplace_interest_view;
create view public.event_marketplace_interest_view as
  select
    i.id, i.post_id, i.event_id, i.requester_id, i.owner_id,
    i.status, i.match_id, i.created_at, i.accepted_at,
    rp.program            as requester_program,
    rp.headline           as requester_headline,
    rp.industry_interests as requester_industry
  from public.event_marketplace_interest i
  join public.profiles rp on rp.id = i.requester_id
  where auth.uid() in (i.requester_id, i.owner_id);

grant select on public.event_marketplace_interest_view to authenticated;

-- Host-only aggregate: interest counts for the organizer's dashboard, WITHOUT
-- exposing individual interest rows. Owner-rights, scoped to the event host.
-- (Post counts + "most requested / offered" topics are derived client-side
--  from event_marketplace_feed, which the host can already read.)
drop view if exists public.event_marketplace_interest_stats;
create view public.event_marketplace_interest_stats as
  select
    i.event_id,
    count(*)                                    as interest_count,
    count(*) filter (where i.status = 'accepted') as accepted_count
  from public.event_marketplace_interest i
  where exists (select 1 from public.events e where e.id = i.event_id and e.host_user_id = auth.uid())
  group by i.event_id;

grant select on public.event_marketplace_interest_stats to authenticated;


-- ═══ 4. Triggers ═════════════════════════════════════════════

-- 4a. Transition guard: only the owner accepts/declines; only the requester
-- cancels; pending is the only state either can move out of.
create or replace function public.guard_marketplace_interest()
returns trigger language plpgsql as $$
begin
  if NEW.status = OLD.status then
    return NEW;                                   -- non-status update (e.g. match_id)
  end if;
  if OLD.status <> 'pending' then
    raise exception 'interest is already %; no further changes', OLD.status;
  end if;
  if NEW.status in ('accepted','declined') then
    if auth.uid() <> OLD.owner_id then
      raise exception 'only the post owner can accept or decline';
    end if;
  elsif NEW.status = 'cancelled' then
    if auth.uid() <> OLD.requester_id then
      raise exception 'only the requester can cancel';
    end if;
  else
    raise exception 'invalid interest status %', NEW.status;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_guard_marketplace_interest on public.event_marketplace_interest;
create trigger trg_guard_marketplace_interest
  before update on public.event_marketplace_interest
  for each row execute function public.guard_marketplace_interest();

-- 4b. On new interest → notify the post owner. (SECURITY DEFINER to write a
-- notification for another user, past notifications RLS.)
create or replace function public.notify_marketplace_interest()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p_type text;
  p_title text;
begin
  select type, title into p_type, p_title
    from public.event_marketplace_posts where id = NEW.post_id;

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    NEW.owner_id,
    'marketplace_interest',
    'Someone is interested',
    case when p_type = 'need'
         then 'Someone wants to help with "' || coalesce(p_title,'your request') || '"'
         else 'Someone is interested in "' || coalesce(p_title,'your offer') || '"' end,
    jsonb_build_object('event_id', NEW.event_id, 'post_id', NEW.post_id, 'interest_id', NEW.id)
  );
  return NEW;
end $$;

drop trigger if exists trg_notify_marketplace_interest on public.event_marketplace_interest;
create trigger trg_notify_marketplace_interest
  after insert on public.event_marketplace_interest
  for each row execute function public.notify_marketplace_interest();

-- 4c. On ACCEPT → create the event-based match (already reveal-accepted), seed
-- a system message, back-link the interest, and notify BOTH parties so the
-- chat surfaces for each of them.
create or replace function public.marketplace_on_accept()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_match_id uuid;
begin
  if NEW.status = 'accepted' and OLD.status is distinct from 'accepted' then
    insert into public.matches (
      post_id, requester_user_id, helper_user_id, status,
      event_id, marketplace_post_id,
      identity_reveal_status, identity_reveal_accepted_at
    ) values (
      null, NEW.owner_id, NEW.requester_id, 'active',
      NEW.event_id, NEW.post_id,
      'accepted', now()
    )
    returning id into new_match_id;

    -- Seed the opening system line.
    insert into public.messages (match_id, sender_user_id, body, type)
    values (new_match_id, NEW.owner_id,
            'You both expressed interest in connecting at this event.', 'system');

    -- Back-link (status stays 'accepted', so the guard/accept triggers no-op).
    update public.event_marketplace_interest
       set match_id = new_match_id, accepted_at = now()
     where id = NEW.id;

    -- Notify both — reuse 'new_match' so the existing routing opens the chat.
    insert into public.notifications (user_id, type, title, body, payload)
    values
      (NEW.requester_id, 'new_match', 'You''re connected',
       'Your interest was accepted — say hello.',
       jsonb_build_object('match_id', new_match_id)),
      (NEW.owner_id, 'new_match', 'You''re connected',
       'You accepted an interest — say hello.',
       jsonb_build_object('match_id', new_match_id));
  end if;
  return NEW;
end $$;

drop trigger if exists trg_marketplace_on_accept on public.event_marketplace_interest;
create trigger trg_marketplace_on_accept
  after update on public.event_marketplace_interest
  for each row execute function public.marketplace_on_accept();

-- 4d. Don't let the legacy new-match notifier double-fire on marketplace
-- matches (they notify both parties themselves, above). This is the ORIGINAL
-- function body from migration-notifications.sql with ONE added line: bail out
-- when post_id IS NULL. The existing trigger trg_notify_new_match keeps calling
-- it; CREATE OR REPLACE just swaps the body.
create or replace function public.notify_on_new_match()
returns trigger as $$
declare
  v_need_text text;
begin
  if NEW.post_id is null then
    return NEW;                                   -- marketplace match: notified in marketplace_on_accept
  end if;

  select p.need_text into v_need_text
  from public.posts p
  where p.id = NEW.post_id;

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    NEW.requester_user_id,
    'new_match',
    'New match',
    'Someone offered to help with: ' || coalesce(left(v_need_text, 60), 'your request'),
    jsonb_build_object('match_id', NEW.id, 'post_id', NEW.post_id, 'helper_user_id', NEW.helper_user_id)
  );
  return NEW;
end;
$$ language plpgsql security definer;


-- ═══ 5. Notification type — allow 'marketplace_interest' ═════
-- The notifications.type CHECK is drop-and-recreate on each migration.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'new_match','new_message','feedback_request','meeting_confirmed',
    'review_received','event_cancelled','event_joined','event_message',
    'event_below_min','marketplace_interest'
  ));


-- ═══ 6. Realtime — live interest status + new posts ══════════
alter table public.event_marketplace_posts    replica identity full;
alter table public.event_marketplace_interest replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='event_marketplace_posts') then
    alter publication supabase_realtime add table public.event_marketplace_posts;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='event_marketplace_interest') then
    alter publication supabase_realtime add table public.event_marketplace_interest;
  end if;
end $$;
