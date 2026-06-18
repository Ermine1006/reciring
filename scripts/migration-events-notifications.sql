-- ============================================================
-- ReciRing: Events — engagement-loop notifications
-- (Slice C-1 of the Meetup-style upgrade)
--
-- Adds two new notification types and the triggers that fire them:
--
--   event_joined   — host gets pinged when someone joins their event
--   event_message  — every attendee (and the host) get pinged when
--                    someone posts in the event's discussion thread.
--                    Coalesces unread pings per (recipient, event) so
--                    a 20-message thread doesn't create 20 bell badges.
--
-- Idempotent. Safe to re-run.
-- ============================================================

-- ── 1. Extend notifications.type enum ──────────────────────

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'new_match',
      'new_message',
      'feedback_request',
      'meeting_confirmed',
      'review_received',
      'event_cancelled',
      'event_joined',
      'event_message'
    ));


-- ── 2. event_joined trigger ────────────────────────────────
-- Fires on INSERT to event_attendees. Notifies the event host that
-- someone joined. Skips notification if the joiner IS the host
-- (e.g. host RSVPs to their own event).

CREATE OR REPLACE FUNCTION public.notify_event_joined()
RETURNS trigger AS $$
DECLARE
  v_host_id     uuid;
  v_event_title text;
  v_joiner_name text;
BEGIN
  SELECT host_user_id, title INTO v_host_id, v_event_title
  FROM public.events WHERE id = NEW.event_id;

  IF v_host_id IS NULL OR v_host_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), 'Someone')
    INTO v_joiner_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    v_host_id,
    'event_joined',
    'New attendee',
    v_joiner_name || ' joined "' || v_event_title || '"',
    jsonb_build_object(
      'event_id',         NEW.event_id,
      'attendee_user_id', NEW.user_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_event_joined ON public.event_attendees;
CREATE TRIGGER trg_notify_event_joined
  AFTER INSERT ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.notify_event_joined();


-- ── 3. event_message trigger ───────────────────────────────
-- Fires on INSERT to event_messages. Notifies the host + every
-- attendee EXCEPT the sender. Coalesces: if a recipient already has
-- an unread event_message notification for this event, that row is
-- updated in place (body + created_at) instead of inserting a new one.
-- This stops a 20-message conversation from flooding the bell.

CREATE OR REPLACE FUNCTION public.notify_event_message()
RETURNS trigger AS $$
DECLARE
  v_host_id     uuid;
  v_event_title text;
  v_sender_name text;
  v_body        text;
  v_recipient   uuid;
  v_existing    uuid;
BEGIN
  SELECT host_user_id, title INTO v_host_id, v_event_title
  FROM public.events WHERE id = NEW.event_id;
  IF v_host_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), 'Someone')
    INTO v_sender_name
  FROM public.profiles WHERE id = NEW.sender_user_id;

  v_body := v_sender_name || ' commented on "' || v_event_title || '"';

  -- Fan out: host (if not the sender) + all attendees (except sender + host).
  -- One UNION query so the coalesce loop runs once per recipient.
  FOR v_recipient IN
    SELECT DISTINCT uid FROM (
      SELECT v_host_id        AS uid WHERE v_host_id <> NEW.sender_user_id
      UNION
      SELECT ea.user_id       AS uid FROM public.event_attendees ea
        WHERE ea.event_id = NEW.event_id
          AND ea.user_id <> NEW.sender_user_id
          AND ea.user_id <> v_host_id
    ) recipients
  LOOP
    SELECT id INTO v_existing
    FROM public.notifications
    WHERE user_id = v_recipient
      AND type    = 'event_message'
      AND read_at IS NULL
      AND (payload->>'event_id')::uuid = NEW.event_id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.notifications
      SET body       = v_body,
          created_at = now()
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.notifications (user_id, type, title, body, payload)
      VALUES (
        v_recipient,
        'event_message',
        'New message',
        v_body,
        jsonb_build_object(
          'event_id',       NEW.event_id,
          'message_id',     NEW.id,
          'sender_user_id', NEW.sender_user_id
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_event_message ON public.event_messages;
CREATE TRIGGER trg_notify_event_message
  AFTER INSERT ON public.event_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_event_message();
