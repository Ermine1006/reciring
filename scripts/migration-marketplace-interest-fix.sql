-- ReciRing / Mutu — Fix: "I'm Interested" blocked by RLS
--
-- The interest INSERT policy validated the target with
--   EXISTS (SELECT 1 FROM event_marketplace_posts p WHERE p.id = post_id ...)
-- but event_marketplace_posts SELECT RLS only lets the owner (or accepted
-- parties) read a post. A browsing requester can't SELECT the post, so the
-- EXISTS was always false and the insert was denied ("couldn't send interest").
--
-- Fix: validate the post↔owner↔event link through a SECURITY DEFINER function
-- that bypasses the posts RLS but returns only a boolean — no post data leaks,
-- anonymity is preserved.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

create or replace function public.mkt_post_owned_by(p_post uuid, p_owner uuid, p_event uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.event_marketplace_posts p
    where p.id = p_post
      and p.user_id = p_owner
      and p.event_id = p_event
  );
$$;

revoke all on function public.mkt_post_owned_by(uuid, uuid, uuid) from public;
grant execute on function public.mkt_post_owned_by(uuid, uuid, uuid) to authenticated;

drop policy if exists "Mkt interest: requester creates" on public.event_marketplace_interest;
create policy "Mkt interest: requester creates"
  on public.event_marketplace_interest for insert to authenticated
  with check (
    requester_id = auth.uid()
    and owner_id <> auth.uid()
    and public.mkt_post_owned_by(post_id, owner_id, event_id)
  );
