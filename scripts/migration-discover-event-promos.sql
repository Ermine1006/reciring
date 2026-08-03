-- ═══════════════════════════════════════════════════════════════════
-- Discover ← Event Marketplace promotion
--
-- Surfaces SELECTED event-marketplace posts in the global Discover deck
-- as anonymised "Event Preview" cards, to drive event acquisition:
--   preview → event details → join → full marketplace → connect.
--
-- Two independent consent gates (BOTH required):
--   • events.allow_discover_promotion   — the HOST allows this event to
--     be promoted outside itself.
--   • event_marketplace_posts.promote_to_discover — the post AUTHOR
--     opts this specific post in ("Help others discover this event").
-- Both default FALSE: nothing leaves an event without explicit consent.
--
-- Identity stays anonymised exactly like the in-event marketplace feed
-- (program / headline / industry only — never name, email, or avatar).
-- Real identity is revealed only after joining + an accepted interest.
--
-- Idempotent; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Consent columns ──────────────────────────────────────────────
alter table public.events
  add column if not exists allow_discover_promotion boolean not null default false;

alter table public.event_marketplace_posts
  add column if not exists promote_to_discover boolean not null default false;

-- ─── 2. Public preview view ──────────────────────────────────────────
-- Owner-rights (NOT security_invoker) so a non-attendee can read the
-- anonymised projection past the marketplace's attendee-only RLS. Unlike
-- event_marketplace_feed this is intentionally NOT scoped to attendees —
-- the whole point is acquisition — but every other gate is enforced here
-- in the WHERE clause, and only non-identifying columns are projected.
drop view if exists public.discover_event_promos;
create view public.discover_event_promos as
  select
    p.id                    as post_id,
    p.event_id,
    p.type,                                        -- 'need' | 'offer'
    p.title,
    left(coalesce(p.description, ''), 240) as description_preview,
    p.tags,
    p.urgency,
    p.created_at            as post_created_at,
    -- anonymised poster (mirrors event_marketplace_feed exactly)
    prof.program            as poster_program,
    prof.headline           as poster_headline,
    prof.industry_interests as poster_industry,
    -- event facts
    e.title                 as event_title,
    e.start_at              as event_start_at,
    e.category              as event_category,
    e.location              as event_location,
    e.image_url             as event_image_url,
    e.max_attendees,
    e.status                as event_status,
    e.attendee_visibility,
    (select count(*) from public.event_attendees a where a.event_id = e.id) as attendee_count
  from public.event_marketplace_posts p
  join public.events   e    on e.id = p.event_id
  join public.profiles prof on prof.id = p.user_id
  where p.status = 'active'
    and p.promote_to_discover = true              -- author consent
    and e.allow_discover_promotion = true         -- host consent
    and e.start_at >= now()                       -- still upcoming
    -- 'upcoming' auto-excludes full / cancelled / completed (status flips
    -- to 'full' via recompute_event_capacity_status); capacity re-checked
    -- below as belt-and-suspenders.
    and e.status = 'upcoming'
    and (
      e.max_attendees is null
      or (select count(*) from public.event_attendees a where a.event_id = e.id) < e.max_attendees
    );

grant select on public.discover_event_promos to authenticated;

-- ─── 3. Funnel tracking ──────────────────────────────────────────────
-- Records the acquisition funnel: preview impression → event-detail open →
-- join conversion → marketplace connection. Each user owns their own rows.
create table if not exists public.event_promo_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,
  post_id    uuid references public.event_marketplace_posts(id) on delete set null,
  kind       text not null check (kind in (
               'preview_impression', 'detail_open', 'join_conversion', 'marketplace_connection'
             )),
  created_at timestamptz not null default now()
);

create index if not exists event_promo_events_event_kind_idx
  on public.event_promo_events (event_id, kind);
create index if not exists event_promo_events_user_idx
  on public.event_promo_events (user_id);

alter table public.event_promo_events enable row level security;

-- Owner-only: a user may write and read only their own funnel rows.
drop policy if exists "promo events insert own" on public.event_promo_events;
create policy "promo events insert own" on public.event_promo_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "promo events select own" on public.event_promo_events;
create policy "promo events select own" on public.event_promo_events
  for select using (auth.uid() = user_id);
