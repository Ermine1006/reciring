-- ReciRing / Mutu — Event posters storage bucket
--
-- Adds a PUBLIC storage bucket `event-posters` so hosts can upload a poster
-- image when creating an event. Public read is required because the image
-- URL is rendered on the event board, the detail page, and rasterised into
-- the shareable Instagram-story poster (html-to-image needs a fetchable,
-- CORS-friendly URL — Supabase public objects serve `Access-Control-Allow-
-- Origin: *`).
--
-- Writes go under a per-user folder ({auth.uid}/...), and the policies below
-- only let a user write/replace/delete inside their own folder. Reads are
-- open (public bucket).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- 1. The bucket (public read).
insert into storage.buckets (id, name, public)
values ('event-posters', 'event-posters', true)
on conflict (id) do update set public = true;

-- 2. Policies on storage.objects, scoped to this bucket.

-- Public read — anyone (even signed-out) can load a poster by URL.
drop policy if exists "Event posters: public read" on storage.objects;
create policy "Event posters: public read"
  on storage.objects for select
  using ( bucket_id = 'event-posters' );

-- Upload — an authenticated user may write only inside their own uid folder,
-- e.g. "event-posters/<uid>/<file>.jpg".
drop policy if exists "Event posters: owner upload" on storage.objects;
create policy "Event posters: owner upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-posters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Replace — overwrite own poster.
drop policy if exists "Event posters: owner update" on storage.objects;
create policy "Event posters: owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-posters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete — remove own poster.
drop policy if exists "Event posters: owner delete" on storage.objects;
create policy "Event posters: owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-posters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
