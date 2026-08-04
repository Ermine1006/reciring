-- Carry an Event Board need/offer into the Discover community after the event.
--
-- Event Board posts (event_marketplace_posts) are scoped to their event, so
-- once the event is past they stop surfacing. We prompt the author to republish
-- the post into the permanent Discover feed (public.posts). These two columns
-- let us (a) stop prompting once they've shared or dismissed, and (b) avoid
-- creating a duplicate Discover post.
--
-- Both nullable, no backfill — existing rows are simply "not yet shared / not
-- yet dismissed". Safe to run more than once.

alter table public.event_marketplace_posts
  add column if not exists shared_to_discover_at        timestamptz,
  add column if not exists discover_prompt_dismissed_at timestamptz;
