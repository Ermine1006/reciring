-- Founder runs manually in Supabase SQL Editor.
-- Apply AFTER migration-buddy-upper-approval.sql and the existing Matches,
-- Messages and Notifications migrations.
--
-- Buddy Community help now uses the same relationship layer as the rest of Mutu:
-- offer -> first year consent -> Matches -> one shared chat.
-- Existing accepted Buddy help is backfilled into Matches.
BEGIN;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS buddy_post_id uuid
    REFERENCES public.buddy_choice_posts(id) ON DELETE SET NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.buddy_choice_invites
  ADD COLUMN IF NOT EXISTS match_id uuid
    REFERENCES public.matches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_buddy_choice_invites_match
  ON public.buddy_choice_invites(match_id)
  WHERE match_id IS NOT NULL;

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_source_chk;
ALTER TABLE public.matches ADD CONSTRAINT matches_source_chk
  CHECK (
    post_id IS NOT NULL
    OR marketplace_post_id IS NOT NULL
    OR event_id IS NOT NULL
    OR buddy_post_id IS NOT NULL
    OR source <> 'post'
  );

CREATE OR REPLACE FUNCTION public.notify_on_new_match()
RETURNS trigger AS $$
DECLARE
  v_need_text text;
BEGIN
  IF coalesce(NEW.source,'post')='buddy' THEN
    RETURN NEW;
  END IF;

  SELECT p.need_text INTO v_need_text
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  INSERT INTO public.notifications (user_id,type,title,body,payload)
  VALUES (
    NEW.requester_user_id,
    'new_match',
    'New match',
    'Someone offered to help with: ' || coalesce(left(v_need_text,60),'your request'),
    jsonb_build_object(
      'match_id',NEW.id,
      'post_id',NEW.post_id,
      'helper_user_id',NEW.helper_user_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;

CREATE OR REPLACE FUNCTION public.buddy_choice_select(p_post uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s public.buddy_choice_posts;
  cap integer;
  v_invite uuid;
BEGIN
  SELECT * INTO s FROM public.buddy_choice_posts WHERE id=p_post;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Post not available.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));
  PERFORM public.buddy_choice_sweep(s.program_id);
  SELECT * INTO s FROM public.buddy_choice_posts WHERE id=p_post;

  SELECT least(max_mentees,3) INTO cap
  FROM public.buddy_programs
  WHERE id=s.program_id AND choice_enabled;

  IF cap IS NULL OR NOT s.active OR s.user_id=auth.uid()
     OR NOT public.buddy_choice_allowed(s.program_id,auth.uid(),s.user_id)
     OR NOT EXISTS(
       SELECT 1 FROM public.buddy_choice_members
       WHERE program_id=s.program_id AND user_id=auth.uid()
         AND role='upper' AND active
     )
  THEN
    RAISE EXCEPTION 'Upper-year access required or post unavailable.';
  END IF;

  IF NOT EXISTS(
       SELECT 1 FROM public.buddy_choice_members
       WHERE program_id=s.program_id AND user_id=s.user_id
         AND role='first' AND active
     )
     OR ((s.payload->>'expiresAt') IS NOT NULL
         AND (s.payload->>'expiresAt')::timestamptz<=now())
  THEN
    RAISE EXCEPTION 'Post not available.';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.buddy_choice_invites
    WHERE program_id=s.program_id AND first_id=s.user_id
      AND (status='accepted'
        OR (upper_id=auth.uid() AND status IN ('pending','declined')))
  ) THEN
    RAISE EXCEPTION 'This student already has a connection or an offer from you.';
  END IF;

  IF (
    SELECT count(*) FROM public.buddy_choice_invites
    WHERE program_id=s.program_id AND upper_id=auth.uid()
      AND status IN ('pending','accepted')
  )>=cap THEN
    RAISE EXCEPTION 'All your help spots are currently in use.';
  END IF;

  INSERT INTO public.buddy_choice_invites(program_id,post_id,upper_id,first_id,status,created_at)
  VALUES(s.program_id,s.id,auth.uid(),s.user_id,'pending',now())
  ON CONFLICT(post_id,upper_id)
  DO UPDATE SET status='pending',created_at=now(),match_id=NULL
  RETURNING id INTO v_invite;

  UPDATE public.notifications
  SET read_at=coalesce(read_at,now()),
      payload=payload||jsonb_build_object('resolved','superseded')
  WHERE user_id=s.user_id
    AND type='new_match'
    AND payload->>'kind'='buddy_help_offer'
    AND payload->>'invite_id'=v_invite::text
    AND read_at IS NULL;

  INSERT INTO public.notifications(user_id,type,title,body,payload)
  VALUES(
    s.user_id,
    'new_match',
    'Someone wants to help',
    'An approved upper year student offered to help with your Buddy Program request.',
    jsonb_build_object(
      'kind','buddy_help_offer',
      'invite_id',v_invite,
      'program_id',s.program_id,
      'post_id',s.id,
      'post_preview',left(coalesce(s.payload->>'needs','your request'),120)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_choice_connect(p_invite uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  i public.buddy_choice_invites;
  s public.buddy_choice_posts;
  v_match uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;

  SELECT * INTO i
  FROM public.buddy_choice_invites
  WHERE id=p_invite
  FOR UPDATE;

  IF NOT FOUND OR auth.uid()<>i.first_id OR i.status<>'pending' THEN
    RAISE EXCEPTION 'Help offer is no longer available.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(i.program_id::text,11));

  SELECT * INTO s
  FROM public.buddy_choice_posts
  WHERE id=i.post_id
  FOR UPDATE;

  IF s.id IS NULL OR NOT s.active
     OR ((s.payload->>'expiresAt') IS NOT NULL
         AND (s.payload->>'expiresAt')::timestamptz<=now())
     OR NOT public.buddy_choice_allowed(i.program_id,i.first_id,i.upper_id)
     OR NOT EXISTS(
       SELECT 1 FROM public.buddy_choice_members
       WHERE program_id=i.program_id AND user_id=i.upper_id
         AND role='upper' AND active
     )
  THEN
    RAISE EXCEPTION 'Help offer is no longer available.';
  END IF;

  SELECT m.id INTO v_match
  FROM public.matches m
  WHERE m.status='active'
    AND coalesce(m.source,'post')<>'practice'
    AND (
      (m.requester_user_id=i.first_id AND m.helper_user_id=i.upper_id)
      OR
      (m.requester_user_id=i.upper_id AND m.helper_user_id=i.first_id)
    )
  ORDER BY m.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_match IS NULL THEN
    INSERT INTO public.matches(
      requester_user_id,
      helper_user_id,
      status,
      source,
      buddy_post_id,
      source_context,
      identity_reveal_status,
      identity_reveal_accepted_at
    )
    VALUES(
      i.first_id,
      i.upper_id,
      'active',
      'buddy',
      i.post_id,
      s.payload,
      'accepted',
      now()
    )
    RETURNING id INTO v_match;
  ELSE
    UPDATE public.matches
    SET identity_reveal_status='accepted',
        identity_reveal_accepted_at=coalesce(identity_reveal_accepted_at,now())
    WHERE id=v_match;
  END IF;

  UPDATE public.notifications n
  SET read_at=coalesce(n.read_at,now()),
      title='Help offer closed',
      body='You connected with another helper for this request.',
      payload=n.payload||jsonb_build_object('resolved','withdrawn')
  WHERE n.user_id=i.first_id
    AND n.type='new_match'
    AND n.payload->>'kind'='buddy_help_offer'
    AND n.payload->>'invite_id' IN (
      SELECT other.id::text
      FROM public.buddy_choice_invites other
      WHERE other.program_id=i.program_id
        AND other.first_id=i.first_id
        AND other.id<>i.id
        AND other.status='pending'
    );

  UPDATE public.buddy_choice_invites
  SET status='withdrawn'
  WHERE program_id=i.program_id
    AND first_id=i.first_id
    AND id<>i.id
    AND status='pending';

  UPDATE public.buddy_choice_invites
  SET status='accepted',match_id=v_match
  WHERE id=i.id;

  UPDATE public.notifications
  SET read_at=coalesce(read_at,now()),
      title='Connected through Buddy Program',
      body='You can message each other in Matches.',
      payload=payload||jsonb_build_object(
        'resolved','connected',
        'match_id',v_match
      )
  WHERE user_id=i.first_id
    AND type='new_match'
    AND payload->>'kind'='buddy_help_offer'
    AND payload->>'invite_id'=i.id::text;

  IF NOT EXISTS(
    SELECT 1 FROM public.messages
    WHERE match_id=v_match
      AND type='system'
      AND metadata->>'buddy_invite_id'=i.id::text
  ) THEN
    INSERT INTO public.messages(match_id,sender_user_id,body,type,metadata)
    VALUES(
      v_match,
      i.first_id,
      'Connected through Buddy Program: ' || left(coalesce(s.payload->>'needs','your request'),100),
      'system',
      jsonb_build_object(
        'source','buddy_program',
        'buddy_invite_id',i.id,
        'buddy_post_id',i.post_id,
        'program_id',i.program_id
      )
    );
  END IF;

  RETURN v_match;
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_choice_respond(p_invite uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  i public.buddy_choice_invites;
BEGIN
  SELECT * INTO i
  FROM public.buddy_choice_invites
  WHERE id=p_invite;

  IF i.id IS NULL OR auth.uid() IS NULL
     OR auth.uid() NOT IN (i.first_id,i.upper_id)
  THEN
    RAISE EXCEPTION 'Invitation not available.';
  END IF;

  IF p_action='accept' THEN
    PERFORM public.buddy_choice_connect(p_invite);
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(i.program_id::text,11));
  SELECT * INTO i
  FROM public.buddy_choice_invites
  WHERE id=p_invite
  FOR UPDATE;

  IF p_action='withdraw'
     AND auth.uid()=i.upper_id
     AND i.status='pending'
  THEN
    UPDATE public.buddy_choice_invites
    SET status='withdrawn'
    WHERE id=i.id;

    UPDATE public.notifications
    SET read_at=coalesce(read_at,now()),
        title='Help offer withdrawn',
        body='This help offer is no longer active.',
        payload=payload||jsonb_build_object('resolved','withdrawn')
    WHERE user_id=i.first_id
      AND type='new_match'
      AND payload->>'kind'='buddy_help_offer'
      AND payload->>'invite_id'=i.id::text;
    RETURN;
  END IF;

  IF p_action='withdraw' AND i.status='accepted' THEN
    RAISE EXCEPTION 'Connected relationships are managed in Matches.';
  END IF;

  IF auth.uid()<>i.first_id
     OR i.status<>'pending'
     OR p_action<>'decline'
  THEN
    RAISE EXCEPTION 'Invitation cannot be changed.';
  END IF;

  UPDATE public.buddy_choice_invites
  SET status='declined'
  WHERE id=i.id;

  UPDATE public.notifications
  SET read_at=coalesce(read_at,now()),
      title='Help offer declined',
      body='You declined this help offer.',
      payload=payload||jsonb_build_object('resolved','declined')
  WHERE user_id=i.first_id
    AND type='new_match'
    AND payload->>'kind'='buddy_help_offer'
    AND payload->>'invite_id'=i.id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_choice_connection_links(p_program uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  IF NOT public.buddy_choice_member(p_program,auth.uid())
     AND NOT public.buddy_is_coordinator(p_program)
  THEN
    RAISE EXCEPTION 'Program not available.';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'invite_id',i.id,
        'match_id',i.match_id
      )
    )
    FROM public.buddy_choice_invites i
    WHERE i.program_id=p_program
      AND i.status='accepted'
      AND i.match_id IS NOT NULL
      AND (
        auth.uid() IN (i.first_id,i.upper_id)
        OR public.buddy_is_coordinator(p_program)
      )
  ),'[]'::jsonb);
END;
$$;

DO $$
DECLARE
  r record;
  v_match uuid;
BEGIN
  FOR r IN
    SELECT i.id AS invite_id,i.program_id,i.post_id,i.first_id,i.upper_id,p.payload
    FROM public.buddy_choice_invites i
    JOIN public.buddy_choice_posts p ON p.id=i.post_id
    WHERE i.status='accepted' AND i.match_id IS NULL
  LOOP
    v_match:=NULL;

    SELECT m.id INTO v_match
    FROM public.matches m
    WHERE m.status='active'
      AND coalesce(m.source,'post')<>'practice'
      AND (
        (m.requester_user_id=r.first_id AND m.helper_user_id=r.upper_id)
        OR
        (m.requester_user_id=r.upper_id AND m.helper_user_id=r.first_id)
      )
    ORDER BY m.created_at DESC
    LIMIT 1;

    IF v_match IS NULL THEN
      INSERT INTO public.matches(
        requester_user_id,helper_user_id,status,source,buddy_post_id,
        source_context,identity_reveal_status,identity_reveal_accepted_at
      )
      VALUES(
        r.first_id,r.upper_id,'active','buddy',r.post_id,
        r.payload,'accepted',now()
      )
      RETURNING id INTO v_match;
    ELSE
      UPDATE public.matches
      SET identity_reveal_status='accepted',
          identity_reveal_accepted_at=coalesce(identity_reveal_accepted_at,now())
      WHERE id=v_match;
    END IF;

    UPDATE public.buddy_choice_invites
    SET match_id=v_match
    WHERE id=r.invite_id;

    IF NOT EXISTS(
      SELECT 1 FROM public.messages
      WHERE match_id=v_match
        AND type='system'
        AND metadata->>'buddy_invite_id'=r.invite_id::text
    ) THEN
      INSERT INTO public.messages(match_id,sender_user_id,body,type,metadata)
      VALUES(
        v_match,
        r.first_id,
        'Connected through Buddy Program: ' || left(coalesce(r.payload->>'needs','your request'),100),
        'system',
        jsonb_build_object(
          'source','buddy_program',
          'buddy_invite_id',r.invite_id,
          'buddy_post_id',r.post_id,
          'program_id',r.program_id
        )
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_choice_connect(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.buddy_choice_connection_links(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buddy_choice_connect(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_connection_links(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.buddy_choice_select(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.buddy_choice_respond(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buddy_choice_select(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_respond(uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
