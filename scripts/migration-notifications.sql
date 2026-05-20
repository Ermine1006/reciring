-- ============================================================
-- ReciRing: Notifications + post-match feedback prompts
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ── 1. Notifications table ─────────────────────────────────
-- Append-only feed of events for each user. Read state tracked in `read_at`.
-- payload is jsonb so each notification type can carry its own data
-- without schema changes (e.g. {match_id, peer_name, post_preview}).

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL,                 -- recipient
  type        text NOT NULL CHECK (type IN (
                'new_match',
                'new_message',
                'feedback_request',
                'meeting_confirmed',
                'review_received'
              )),
  title       text NOT NULL,                  -- short headline shown in bell
  body        text NOT NULL DEFAULT '',       -- one-line subtitle
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,                    -- null = unread
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON public.notifications (user_id, created_at DESC);


-- ── 2. RLS ──────────────────────────────────────────────────
-- Users only see their own notifications. Inserts come exclusively
-- from SECURITY DEFINER triggers (and the client-side feedback prompt).

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow client-side inserts for feedback_request notifications the user
-- creates for themselves (the prompt logic lives client-side; this is the
-- only notification type where the user is both creator and recipient).
DROP POLICY IF EXISTS "Users can self-create feedback notifications" ON public.notifications;
CREATE POLICY "Users can self-create feedback notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND type = 'feedback_request'
  );


-- ── 3. Trigger: new match → notify the REQUESTER ────────────
-- The helper just swiped, they're already in the chat. The requester
-- needs the surface-level signal "someone wants to help you."

CREATE OR REPLACE FUNCTION public.notify_on_new_match()
RETURNS trigger AS $$
DECLARE
  v_need_text text;
BEGIN
  SELECT p.need_text INTO v_need_text
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    NEW.requester_user_id,
    'new_match',
    'New match',
    'Someone offered to help with: ' || COALESCE(LEFT(v_need_text, 60), 'your request'),
    jsonb_build_object(
      'match_id', NEW.id,
      'post_id',  NEW.post_id,
      'helper_user_id', NEW.helper_user_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_match ON public.matches;
CREATE TRIGGER trg_notify_new_match
  AFTER INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_match();


-- ── 4. Trigger: new message → notify the OTHER participant ──
-- Skip system messages and skip if the sender == recipient (defensive).
-- Coalesces: if there's already an unread new_message notification for
-- this match for this user, update its body + created_at instead of
-- inserting a new row. Prevents 50 unread notifications from a long thread.

CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger AS $$
DECLARE
  v_recipient uuid;
  v_existing  uuid;
  v_preview   text;
BEGIN
  -- Don't notify on system messages
  IF NEW.type = 'system' THEN
    RETURN NEW;
  END IF;

  -- Resolve recipient as "the participant who is not the sender"
  SELECT CASE
    WHEN m.requester_user_id = NEW.sender_user_id THEN m.helper_user_id
    ELSE m.requester_user_id
  END
  INTO v_recipient
  FROM public.matches m
  WHERE m.id = NEW.match_id;

  IF v_recipient IS NULL OR v_recipient = NEW.sender_user_id THEN
    RETURN NEW;
  END IF;

  v_preview := CASE
    WHEN NEW.type = 'meeting_proposal' THEN 'Proposed a meeting'
    ELSE LEFT(COALESCE(NEW.body, ''), 80)
  END;

  -- Coalesce: look for an unread new_message notification for this match
  SELECT id INTO v_existing
  FROM public.notifications
  WHERE user_id = v_recipient
    AND type    = 'new_message'
    AND read_at IS NULL
    AND (payload->>'match_id')::uuid = NEW.match_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.notifications
    SET body       = v_preview,
        created_at = now()
    WHERE id = v_existing;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      v_recipient,
      'new_message',
      'New message',
      v_preview,
      jsonb_build_object('match_id', NEW.match_id, 'message_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();


-- ── 5. Trigger: meeting confirmed → notify both ─────────────
-- Reuses the same status-transition guard as the points trigger.

CREATE OR REPLACE FUNCTION public.notify_on_meeting_confirmed()
RETURNS trigger AS $$
DECLARE
  v_requester uuid;
  v_helper    uuid;
BEGIN
  IF NEW.type = 'meeting_proposal'
     AND (NEW.metadata->>'status') = 'confirmed'
     AND (OLD.metadata->>'status') IS DISTINCT FROM 'confirmed'
  THEN
    SELECT m.requester_user_id, m.helper_user_id
    INTO v_requester, v_helper
    FROM public.matches m
    WHERE m.id = NEW.match_id;

    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES
      (v_requester, 'meeting_confirmed', 'Meeting confirmed',
       'Your coffee chat is on the calendar.',
       jsonb_build_object('match_id', NEW.match_id, 'message_id', NEW.id)),
      (v_helper,    'meeting_confirmed', 'Meeting confirmed',
       'Your coffee chat is on the calendar.',
       jsonb_build_object('match_id', NEW.match_id, 'message_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_meeting_confirmed ON public.messages;
CREATE TRIGGER trg_notify_meeting_confirmed
  AFTER UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_meeting_confirmed();


-- ── 6. Trigger: review received → notify the reviewed user ──

CREATE OR REPLACE FUNCTION public.notify_on_review()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    NEW.reviewed_user_id,
    'review_received',
    'New review',
    'You received a ' || NEW.rating || '★ rating.',
    jsonb_build_object('match_id', NEW.match_id, 'review_id', NEW.id, 'rating', NEW.rating)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_review ON public.reviews;
CREATE TRIGGER trg_notify_review
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_review();


-- ── 7. Enable realtime for notifications ────────────────────
-- Requires REPLICA IDENTITY FULL so UPDATE payloads (mark-as-read) carry
-- old + new rows, matching the pattern used for messages/matches.

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;
