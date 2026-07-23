-- ReciRing / Mutu — Fix null notification body on join / comment
--
-- notifications.body is NOT NULL. The event-joined and event-message triggers
-- build body by string concatenation, and in Postgres `NULL || text` is NULL —
-- so if any interpolated value is null the whole body is null and the INSERT
-- fails, which fails the *user's* action (joining, commenting) with
-- `null value in column "body" violates not-null constraint`.
--
-- The value that goes null in practice is the actor's name: when a user has no
-- profiles row, `SELECT COALESCE(...) INTO v_name FROM profiles WHERE id = ...`
-- returns NO ROW, so v_name stays NULL (the inner COALESCE never runs — there's
-- no row to apply it to). Event title can go null the same way.
--
-- Fix: coalesce the variables *after* the SELECT, so a missing row falls back
-- to a literal instead of nulling the whole body. A notification should never
-- block the action that triggered it.
-- ─────────────────────────────────────────────────────────────

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

  -- Guard against a missing profiles/events row (SELECT INTO left it NULL).
  v_joiner_name := COALESCE(v_joiner_name, 'Someone');
  v_event_title := COALESCE(v_event_title, 'an event');

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

  v_sender_name := COALESCE(v_sender_name, 'Someone');
  v_event_title := COALESCE(v_event_title, 'an event');

  v_body := v_sender_name || ' commented on "' || v_event_title || '"';

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
