-- Founder runs manually in Supabase SQL Editor.
-- Adds audience selection and editing for First Year Buddy Program posts.
--
-- Audiences:
--   assigned_buddy  = only the confirmed school-assigned Buddy
--   buddy_program   = approved upper year Buddy Program participants
--   whole_community = mirrored into the normal Give & Ask / Home feed
BEGIN;

CREATE OR REPLACE FUNCTION public.buddy_choice_publish(p_program uuid,p_post jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  clean jsonb;
  result uuid;
  audience text;
  public_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;

  IF NOT public.buddy_choice_member(p_program,auth.uid())
     OR NOT EXISTS(
       SELECT 1 FROM public.buddy_choice_members
       WHERE program_id=p_program AND user_id=auth.uid()
         AND role='first' AND active
     )
  THEN RAISE EXCEPTION 'First year student access required.'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.buddy_programs
    WHERE id=p_program AND choice_enabled
  ) THEN RAISE EXCEPTION 'Posting is paused.'; END IF;

  audience:=coalesce(nullif(p_post->>'audience',''),'buddy_program');

  IF audience NOT IN ('assigned_buddy','buddy_program','whole_community') THEN
    RAISE EXCEPTION 'Choose who can see this post.';
  END IF;

  IF audience='assigned_buddy'
     AND NOT EXISTS(
       SELECT 1 FROM public.buddy_assigned_pairs p
       WHERE p.program_id=p_program
         AND p.student_id=auth.uid()
         AND p.status='confirmed'
     )
  THEN RAISE EXCEPTION 'Confirm your assigned Buddy before posting only to them.'; END IF;

  IF length(trim(coalesce(p_post->>'needs',''))) NOT BETWEEN 1 AND 300
     OR length(coalesce(p_post->>'offers',''))>200
     OR jsonb_typeof(p_post->'helpType') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_post->'helpType') NOT BETWEEN 1 AND 3
     OR jsonb_typeof(p_post->'industry') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_post->'industry')>2
  THEN RAISE EXCEPTION 'Please complete the post fields.'; END IF;

  IF p_post->>'expiresAt' IS NOT NULL
     AND (p_post->>'expiresAt')::timestamptz<=now()
  THEN RAISE EXCEPTION 'Choose a future expiry date.'; END IF;

  IF EXISTS(
       SELECT 1 FROM jsonb_array_elements((p_post->'helpType')||(p_post->'industry')) e
       WHERE jsonb_typeof(e)<>'string' OR length(e::text)>100
     )
     OR length(coalesce(p_post->>'time',''))>30
     OR length(p_post::text)>5000
  THEN RAISE EXCEPTION 'Invalid post options.'; END IF;

  IF audience='whole_community' THEN
    INSERT INTO public.posts(
      created_by,need_text,offer_text,help_type,industry_tag,
      time_commitment,urgency,expires_at,is_anonymous
    )
    VALUES(
      auth.uid(),
      trim(p_post->>'needs'),
      coalesce(p_post->>'offers',''),
      ARRAY(SELECT jsonb_array_elements_text(p_post->'helpType')),
      ARRAY(SELECT jsonb_array_elements_text(p_post->'industry')),
      coalesce(p_post->>'time','15 min'),
      p_post->>'urgency',
      CASE WHEN p_post->>'expiresAt' IS NULL
        THEN NULL ELSE (p_post->>'expiresAt')::timestamptz END,
      coalesce((p_post->>'is_anonymous')::boolean,true)
    )
    RETURNING id INTO public_id;
  END IF;

  clean:=jsonb_build_object(
    'needs',trim(p_post->>'needs'),
    'offers',coalesce(p_post->>'offers',''),
    'helpType',p_post->'helpType',
    'industry',p_post->'industry',
    'tags',(p_post->'helpType')||(p_post->'industry'),
    'time',coalesce(p_post->>'time','15 min'),
    'urgency',p_post->>'urgency',
    'expiresAt',p_post->>'expiresAt',
    'is_anonymous',coalesce((p_post->>'is_anonymous')::boolean,true),
    'audience',audience,
    'public_post_id',public_id
  );

  INSERT INTO public.buddy_choice_posts(program_id,user_id,payload)
  VALUES(p_program,auth.uid(),clean)
  RETURNING id INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_choice_update(p_post uuid,p_payload jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s public.buddy_choice_posts;
  clean jsonb;
  audience text;
  previous_audience text;
  public_id uuid;
  has_public_connection boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;

  SELECT * INTO s
  FROM public.buddy_choice_posts
  WHERE id=p_post AND user_id=auth.uid() AND active
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;

  audience:=coalesce(nullif(p_payload->>'audience',''),'buddy_program');
  previous_audience:=coalesce(nullif(s.payload->>'audience',''),'buddy_program');
  public_id:=nullif(s.payload->>'public_post_id','')::uuid;

  IF audience NOT IN ('assigned_buddy','buddy_program','whole_community') THEN
    RAISE EXCEPTION 'Choose who can see this post.';
  END IF;

  IF audience='assigned_buddy'
     AND NOT EXISTS(
       SELECT 1 FROM public.buddy_assigned_pairs p
       WHERE p.program_id=s.program_id
         AND p.student_id=auth.uid()
         AND p.status='confirmed'
     )
  THEN RAISE EXCEPTION 'Confirm your assigned Buddy before posting only to them.'; END IF;

  IF audience<>previous_audience
     AND EXISTS(
       SELECT 1 FROM public.buddy_choice_invites
       WHERE post_id=s.id AND status='accepted'
     )
  THEN RAISE EXCEPTION 'This post already has a connection. Keep its audience unchanged.'; END IF;

  IF length(trim(coalesce(p_payload->>'needs',''))) NOT BETWEEN 1 AND 300
     OR length(coalesce(p_payload->>'offers',''))>200
     OR jsonb_typeof(p_payload->'helpType') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload->'helpType') NOT BETWEEN 1 AND 3
     OR jsonb_typeof(p_payload->'industry') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload->'industry')>2
  THEN RAISE EXCEPTION 'Please complete the post fields.'; END IF;

  IF p_payload->>'expiresAt' IS NOT NULL
     AND (p_payload->>'expiresAt')::timestamptz<=now()
  THEN RAISE EXCEPTION 'Choose a future expiry date.'; END IF;

  IF audience<>previous_audience THEN
    UPDATE public.buddy_choice_invites
    SET status='withdrawn'
    WHERE post_id=s.id AND status='pending';

    IF audience<>'buddy_program' THEN
      DELETE FROM public.buddy_recommendation_actions
      WHERE post_id=s.id;
    END IF;
  END IF;

  IF public_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.matches
      WHERE post_id=public_id
        AND status NOT IN ('unmatched','cancelled')
    ) INTO has_public_connection;
  ELSE
    has_public_connection:=false;
  END IF;

  IF audience='whole_community' THEN
    IF public_id IS NULL THEN
      INSERT INTO public.posts(
        created_by,need_text,offer_text,help_type,industry_tag,
        time_commitment,urgency,expires_at,is_anonymous
      )
      VALUES(
        auth.uid(),
        trim(p_payload->>'needs'),
        coalesce(p_payload->>'offers',''),
        ARRAY(SELECT jsonb_array_elements_text(p_payload->'helpType')),
        ARRAY(SELECT jsonb_array_elements_text(p_payload->'industry')),
        coalesce(p_payload->>'time','15 min'),
        p_payload->>'urgency',
        CASE WHEN p_payload->>'expiresAt' IS NULL
          THEN NULL ELSE (p_payload->>'expiresAt')::timestamptz END,
        coalesce((p_payload->>'is_anonymous')::boolean,true)
      )
      RETURNING id INTO public_id;
    ELSE
      UPDATE public.posts
      SET need_text=trim(p_payload->>'needs'),
          offer_text=coalesce(p_payload->>'offers',''),
          help_type=ARRAY(SELECT jsonb_array_elements_text(p_payload->'helpType')),
          industry_tag=ARRAY(SELECT jsonb_array_elements_text(p_payload->'industry')),
          time_commitment=coalesce(p_payload->>'time','15 min'),
          urgency=p_payload->>'urgency',
          expires_at=CASE WHEN p_payload->>'expiresAt' IS NULL
            THEN NULL ELSE (p_payload->>'expiresAt')::timestamptz END,
          is_anonymous=coalesce((p_payload->>'is_anonymous')::boolean,true),
          created_at=now()
      WHERE id=public_id AND created_by=auth.uid();
    END IF;
  ELSE
    IF public_id IS NOT NULL THEN
      IF has_public_connection THEN
        UPDATE public.posts SET expires_at=now()
        WHERE id=public_id AND created_by=auth.uid();
      ELSE
        DELETE FROM public.posts
        WHERE id=public_id AND created_by=auth.uid();
      END IF;
      public_id:=NULL;
    END IF;
  END IF;

  clean:=jsonb_build_object(
    'needs',trim(p_payload->>'needs'),
    'offers',coalesce(p_payload->>'offers',''),
    'helpType',p_payload->'helpType',
    'industry',p_payload->'industry',
    'tags',(p_payload->'helpType')||(p_payload->'industry'),
    'time',coalesce(p_payload->>'time','15 min'),
    'urgency',p_payload->>'urgency',
    'expiresAt',p_payload->>'expiresAt',
    'is_anonymous',coalesce((p_payload->>'is_anonymous')::boolean,true),
    'audience',audience,
    'public_post_id',public_id
  );

  UPDATE public.buddy_choice_posts
  SET payload=clean,created_at=now()
  WHERE id=s.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_choice_remove(p_post uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s public.buddy_choice_posts;
  public_id uuid;
  has_public_connection boolean;
BEGIN
  SELECT * INTO s
  FROM public.buddy_choice_posts
  WHERE id=p_post AND user_id=auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;

  public_id:=nullif(s.payload->>'public_post_id','')::uuid;

  IF public_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.matches
      WHERE post_id=public_id
        AND status NOT IN ('unmatched','cancelled')
    ) INTO has_public_connection;

    IF has_public_connection THEN
      UPDATE public.posts SET expires_at=now()
      WHERE id=public_id AND created_by=auth.uid();
    ELSE
      DELETE FROM public.posts
      WHERE id=public_id AND created_by=auth.uid();
    END IF;
  END IF;

  UPDATE public.buddy_choice_posts SET active=false WHERE id=s.id;

  DELETE FROM public.buddy_recommendation_actions
  WHERE post_id=s.id;

  -- A removal stops pending help offers but does not destroy an already
  -- accepted relationship or its shared Matches chat.
  UPDATE public.buddy_choice_invites
  SET status='withdrawn'
  WHERE post_id=s.id AND status='pending';
END;
$$;

-- Upper years can only offer Community help on Buddy Program audience posts.
CREATE OR REPLACE FUNCTION public.buddy_choice_select(p_post uuid)
RETURNS void
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

  IF coalesce(s.payload->>'audience','buddy_program')<>'buddy_program' THEN
    RAISE EXCEPTION 'This post is not shared with Buddy Program.';
  END IF;

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
  THEN RAISE EXCEPTION 'Upper-year access required or post unavailable.'; END IF;

  IF NOT EXISTS(
       SELECT 1 FROM public.buddy_choice_members
       WHERE program_id=s.program_id AND user_id=s.user_id
         AND role='first' AND active
     )
     OR ((s.payload->>'expiresAt') IS NOT NULL
         AND (s.payload->>'expiresAt')::timestamptz<=now())
  THEN RAISE EXCEPTION 'Post not available.'; END IF;

  IF EXISTS(
    SELECT 1 FROM public.buddy_choice_invites
    WHERE program_id=s.program_id AND first_id=s.user_id
      AND (
        status='accepted'
        OR (upper_id=auth.uid() AND status IN ('pending','declined'))
      )
  ) THEN RAISE EXCEPTION 'This student already has a connection or an offer from you.'; END IF;

  IF (
    SELECT count(*) FROM public.buddy_choice_invites
    WHERE program_id=s.program_id AND upper_id=auth.uid()
      AND status IN ('pending','accepted')
  )>=cap THEN RAISE EXCEPTION 'All your help spots are currently in use.'; END IF;

  INSERT INTO public.buddy_choice_invites(
    program_id,post_id,upper_id,first_id,status,created_at
  )
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

CREATE OR REPLACE FUNCTION public.buddy_choice_state(p_program uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  p public.buddy_programs;
  r text;
  posts jsonb;
  invites jsonb;
  people jsonb;
  application jsonb;
  applications jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;

  IF p_program IS NULL THEN
    RETURN jsonb_build_object(
      'programs',
      coalesce((
        SELECT jsonb_agg(jsonb_build_object('id',bp.id,'name',bp.name))
        FROM public.buddy_programs bp
        WHERE public.buddy_choice_member(bp.id,auth.uid())
           OR public.buddy_is_coordinator(bp.id)
      ),'[]'::jsonb)
    );
  END IF;

  SELECT * INTO p FROM public.buddy_programs WHERE id=p_program;

  IF p.id IS NULL
     OR (
       NOT public.buddy_choice_member(p.id,auth.uid())
       AND NOT public.buddy_is_coordinator(p.id)
     )
  THEN RAISE EXCEPTION 'Program not available.'; END IF;

  PERFORM public.buddy_choice_sweep(p.id);

  SELECT role INTO r
  FROM public.buddy_choice_members
  WHERE program_id=p.id AND user_id=auth.uid() AND active;

  SELECT jsonb_build_object(
    'status',a.status,
    'help_topics',a.help_topics,
    'career_focus',a.career_focus,
    'submitted_at',a.submitted_at,
    'reviewed_at',a.reviewed_at
  )
  INTO application
  FROM public.buddy_upper_applications a
  WHERE a.program_id=p.id AND a.user_id=auth.uid();

  SELECT coalesce(
    jsonb_agg(
      s.payload||
      jsonb_build_object(
        'id',s.id,
        'owner',CASE WHEN s.user_id=auth.uid() THEN 'me' ELSE NULL END,
        'name',CASE
          WHEN coalesce((s.payload->>'is_anonymous')::boolean,true)=false
          THEN pr.name ELSE NULL END
      )
      ORDER BY s.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO posts
  FROM public.buddy_choice_posts s
  LEFT JOIN public.profiles pr ON pr.id=s.user_id
  WHERE s.program_id=p.id
    AND s.active
    AND (
      s.user_id=auth.uid()
      OR (
        r='upper'
        AND coalesce(s.payload->>'audience','buddy_program')='buddy_program'
        AND p.choice_enabled
        AND public.buddy_choice_allowed(p.id,auth.uid(),s.user_id)
        AND EXISTS(
          SELECT 1 FROM public.buddy_choice_members m
          WHERE m.program_id=p.id
            AND m.user_id=s.user_id
            AND m.active
            AND m.role='first'
        )
        AND (
          (s.payload->>'expiresAt') IS NULL
          OR (s.payload->>'expiresAt')::timestamptz>now()
          OR EXISTS(
            SELECT 1 FROM public.buddy_choice_invites i
            WHERE i.post_id=s.id
              AND i.upper_id=auth.uid()
              AND i.status='accepted'
          )
        )
        AND (
          NOT EXISTS(
            SELECT 1 FROM public.buddy_choice_invites i
            WHERE i.program_id=p.id
              AND i.first_id=s.user_id
              AND i.status='accepted'
          )
          OR EXISTS(
            SELECT 1 FROM public.buddy_choice_invites i
            WHERE i.post_id=s.id
              AND i.upper_id=auth.uid()
              AND i.status='accepted'
          )
        )
      )
    );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',i.id,
        'post_id',i.post_id,
        'status',i.status,
        'name',CASE WHEN i.status='accepted' THEN pr.name ELSE NULL END
      )
      ORDER BY i.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO invites
  FROM public.buddy_choice_invites i
  LEFT JOIN public.profiles pr
    ON pr.id=CASE WHEN i.upper_id=auth.uid() THEN i.first_id ELSE i.upper_id END
  WHERE i.program_id=p.id
    AND auth.uid() IN(i.first_id,i.upper_id)
    AND public.buddy_choice_allowed(p.id,i.first_id,i.upper_id)
    AND EXISTS(
      SELECT 1 FROM public.buddy_choice_members m
      WHERE m.program_id=p.id
        AND m.user_id=i.upper_id
        AND m.role='upper'
        AND m.active
    );

  IF public.buddy_is_coordinator(p.id) THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',m.user_id,
          'name',coalesce(pr.name,'Student'),
          'active',m.active
        )
      ),
      '[]'::jsonb
    )
    INTO people
    FROM public.buddy_choice_members m
    LEFT JOIN public.profiles pr ON pr.id=m.user_id
    WHERE m.program_id=p.id AND m.role='upper';

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id',a.user_id,
          'name',coalesce(pr.name,'Student'),
          'email',coalesce(u.email,''),
          'status',a.status,
          'help_topics',a.help_topics,
          'career_focus',a.career_focus,
          'submitted_at',a.submitted_at,
          'reviewed_at',a.reviewed_at
        )
        ORDER BY
          CASE a.status
            WHEN 'pending' THEN 0
            WHEN 'approved' THEN 1
            WHEN 'paused' THEN 2
            ELSE 3
          END,
          a.submitted_at DESC
      ),
      '[]'::jsonb
    )
    INTO applications
    FROM public.buddy_upper_applications a
    LEFT JOIN public.profiles pr ON pr.id=a.user_id
    LEFT JOIN auth.users u ON u.id=a.user_id
    WHERE a.program_id=p.id;
  END IF;

  RETURN jsonb_build_object(
    'role',r,
    'coordinator',public.buddy_is_coordinator(p.id),
    'enabled',p.choice_enabled,
    'capacity',least(p.max_mentees,3),
    'posts',posts,
    'invitations',invites,
    'upper_students',coalesce(people,'[]'::jsonb),
    'upper_application',application,
    'upper_applications',coalesce(applications,'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.buddy_assigned_state(p_program uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  result jsonb;
  verified_email text;
BEGIN
  IF NOT public.buddy_choice_member(p_program,auth.uid()) THEN
    RAISE EXCEPTION 'Join your student community first.';
  END IF;

  SELECT lower(email) INTO verified_email
  FROM auth.users
  WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;

  UPDATE public.buddy_assigned_pairs
  SET student_id=auth.uid()
  WHERE program_id=p_program
    AND student_email=verified_email
    AND student_id IS NULL
    AND mentor_id<>auth.uid()
    AND status<>'withdrawn';

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',p.id,
        'status',p.status,
        'name',CASE
          WHEN p.mentor_id=auth.uid() THEN
            CASE
              WHEN p.status='confirmed'
              THEN coalesce(nullif(pr.name,''),nullif(p.student_label,''),p.student_email)
              ELSE coalesce(nullif(p.student_label,''),p.student_email)
            END
          ELSE coalesce(nullif(pr.name,''),'Your Buddy')
        END,
        'email',CASE WHEN p.mentor_id=auth.uid() THEN p.student_email ELSE NULL END,
        'posts',CASE WHEN public.buddy_assigned_access(p.id) THEN
          coalesce((
            SELECT jsonb_agg(
              s.payload||jsonb_build_object('id',s.id)
              ORDER BY s.created_at DESC
            )
            FROM public.buddy_choice_posts s
            WHERE s.program_id=p.program_id
              AND s.user_id=p.student_id
              AND s.active
              AND coalesce(s.payload->>'audience','buddy_program')='assigned_buddy'
              AND (
                (s.payload->>'expiresAt') IS NULL
                OR (s.payload->>'expiresAt')::timestamptz>now()
              )
          ),'[]'::jsonb)
          ELSE '[]'::jsonb END,
        'requests',CASE WHEN public.buddy_assigned_access(p.id) THEN
          coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id',r.id,
                'body',r.body,
                'resolved',r.resolved,
                'created_at',r.created_at,
                'replied',EXISTS(
                  SELECT 1 FROM public.buddy_assigned_replies a
                  WHERE a.request_id=r.id AND a.author_id=p.mentor_id
                ),
                'replies',coalesce((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id',a.id,
                      'body',a.body,
                      'mine',a.author_id=auth.uid(),
                      'name',coalesce(ap.name,'Buddy'),
                      'created_at',a.created_at
                    )
                    ORDER BY a.created_at,a.id
                  )
                  FROM public.buddy_assigned_replies a
                  LEFT JOIN public.profiles ap ON ap.id=a.author_id
                  WHERE a.request_id=r.id
                ),'[]'::jsonb)
              )
              ORDER BY r.created_at DESC,r.id
            )
            FROM public.buddy_assigned_requests r
            WHERE r.pair_id=p.id
          ),'[]'::jsonb)
          ELSE '[]'::jsonb END
      )
      ORDER BY p.created_at,p.id
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.buddy_assigned_pairs p
  LEFT JOIN public.profiles pr
    ON pr.id=CASE WHEN p.mentor_id=auth.uid() THEN p.student_id ELSE p.mentor_id END
  WHERE p.program_id=p_program
    AND p.status<>'withdrawn'
    AND auth.uid() IN(p.mentor_id,p.student_id)
    AND EXISTS(
      SELECT 1 FROM public.buddy_choice_members m
      WHERE m.program_id=p.program_id
        AND m.user_id=p.mentor_id
        AND m.role='upper'
        AND m.active
    )
    AND EXISTS(
      SELECT 1 FROM public.buddy_choice_members m
      WHERE m.program_id=p.program_id
        AND m.user_id=auth.uid()
        AND m.active
    )
    AND (
      p.student_id IS NULL
      OR public.buddy_choice_allowed(p.program_id,p.mentor_id,p.student_id)
    );

  RETURN jsonb_build_object('pairs',result);
END;
$$;

-- Prevent recommendation actions from leaking a My Buddy or Whole community
-- post back into the Buddy Program recommendation loop.
CREATE OR REPLACE FUNCTION public.buddy_recommendation_act(
  p_post uuid,p_card uuid,p_status text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s public.buddy_choice_posts;
  c public.buddy_upper_cards;
  options jsonb;
BEGIN
  IF p_status NOT IN ('interested','skipped') OR p_status IS NULL THEN
    RAISE EXCEPTION 'Choose Interested or Skip.';
  END IF;

  SELECT * INTO s
  FROM public.buddy_choice_posts
  WHERE id=p_post AND user_id=auth.uid() AND active;

  IF s.id IS NULL
     OR coalesce(s.payload->>'audience','buddy_program')<>'buddy_program'
  THEN RAISE EXCEPTION 'This post is not shared with Buddy Program.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));

  options:=public.buddy_recommendations(s.program_id,s.id);

  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(options->'items') x
    WHERE x->>'id'=p_card::text
  ) THEN RAISE EXCEPTION 'This recommendation is no longer available. Please refresh.'; END IF;

  INSERT INTO public.buddy_recommendation_actions(post_id,card_id,status)
  VALUES(p_post,p_card,p_status)
  ON CONFLICT(post_id,card_id)
  DO UPDATE SET status=excluded.status,updated_at=now();
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_choice_update(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_choice_publish(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_choice_remove(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_choice_select(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_choice_state(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_assigned_state(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.buddy_recommendation_act(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.buddy_choice_update(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_publish(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_select(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_assigned_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_recommendation_act(uuid,uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
