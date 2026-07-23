-- ReciRing / Mutu — Event moderation
--
-- Safety gate (beta feedback fb12: "how do you ensure events are safe when
-- anyone can post?"). Policy chosen: review a user's FIRST event only. Once a
-- host has one approved event, later ones auto-approve — spammers are caught on
-- their first post, established hosts aren't bottlenecked.
--
-- moderation_status: 'pending' | 'approved' | 'rejected'
--   pending   — awaiting admin review, visible only to the creator + admin
--   approved  — live in the public feed
--   rejected  — hidden; creator can see it flagged
--
-- The app (src/lib/events.js) sets the value on insert: 'approved' when the
-- host already has an approved event, else 'pending'. The column default is
-- 'pending' so a client that forgets can never accidentally publish.
-- ─────────────────────────────────────────────────────────────

-- 1. Column
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'pending'
  CHECK (moderation_status IN ('pending', 'approved', 'rejected'));

-- 2. Backfill: everything already in the table is live, so grandfather it in.
--    (Runs once — new rows default to 'pending' and the app sets them.)
UPDATE public.events SET moderation_status = 'approved'
  WHERE moderation_status = 'pending';

-- 3. Fast lookup of the admin review queue.
CREATE INDEX IF NOT EXISTS idx_events_pending
  ON public.events (created_at)
  WHERE moderation_status = 'pending';

-- 4. Replace the permissive read policy with a moderation-aware one.
--    Server-side enforcement — not just client filtering — so a pending event
--    can't be scraped through the API before it's reviewed.
--    Approved: everyone. Own (any status): the creator. Everything: the admin.
DROP POLICY IF EXISTS "Events: anyone authenticated can read" ON public.events;
DROP POLICY IF EXISTS "Events: read approved, own, or admin"  ON public.events;
CREATE POLICY "Events: read approved, own, or admin"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    moderation_status = 'approved'
    OR host_user_id = auth.uid()
    OR (auth.jwt() ->> 'email') = 'erminelyu@gmail.com'
  );

-- 5. Let the admin flip moderation_status. Hosts can already update their own
--    events (existing "host can update own event" policy); this adds the admin
--    so the review page can approve/reject anyone's event.
DROP POLICY IF EXISTS "Events: admin can moderate" ON public.events;
CREATE POLICY "Events: admin can moderate"
  ON public.events FOR UPDATE
  TO authenticated
  USING      ((auth.jwt() ->> 'email') = 'erminelyu@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'erminelyu@gmail.com');
