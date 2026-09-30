-- Founder runs manually after migration-buddy-post-audiences-edit.sql,
-- migration-buddy-unified-match-chat.sql and migration-buddy-assigned-chat.sql.
-- One Buddy post supports 1 to 3 audiences. Legacy single-audience posts keep
-- their original visibility. Public mirroring remains one post, in the same transaction.
BEGIN;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS buddy_post_id uuid REFERENCES public.buddy_choice_posts(id);
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS buddy_visible boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS posts_one_buddy_mirror ON public.posts(buddy_post_id) WHERE buddy_post_id IS NOT NULL;
UPDATE public.posts p SET buddy_post_id=s.id
FROM public.buddy_choice_posts s WHERE p.id=nullif(s.payload->>'public_post_id','')::uuid AND p.buddy_post_id IS NULL;

CREATE OR REPLACE FUNCTION public.buddy_post_audiences(payload jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE selected jsonb; result text[];
BEGIN
 selected:=CASE WHEN payload ? 'audiences' THEN payload->'audiences'
  ELSE jsonb_build_array(coalesce(nullif(payload->>'audience',''),'buddy_program')) END;
 IF jsonb_typeof(selected) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Choose between 1 and 3 audiences.';
 END IF;
 IF jsonb_array_length(selected) NOT BETWEEN 1 AND 3 THEN
  RAISE EXCEPTION 'Choose between 1 and 3 audiences.';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(selected) x
  WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' NOT IN ('assigned_buddy','buddy_program','whole_community')) THEN
  RAISE EXCEPTION 'Choose valid post audiences.';
 END IF;
 SELECT array_agg(DISTINCT value ORDER BY value) INTO result FROM jsonb_array_elements_text(selected);
 IF cardinality(result)<>jsonb_array_length(selected) THEN
  RAISE EXCEPTION 'Choose each audience only once.';
 END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.buddy_post_audiences(jsonb) FROM PUBLIC,anon,authenticated;
UPDATE public.posts p SET buddy_visible=s.active AND 'whole_community'=ANY(public.buddy_post_audiences(s.payload))
FROM public.buddy_choice_posts s WHERE p.buddy_post_id=s.id;


CREATE OR REPLACE FUNCTION public.buddy_choice_publish(p_program uuid,p_post jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  clean jsonb;
  result uuid;
  audience text;
  audiences text[];
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

  audiences:=public.buddy_post_audiences(p_post);
  audience:=audiences[1];

  IF audience NOT IN ('assigned_buddy','buddy_program','whole_community') THEN
    RAISE EXCEPTION 'Choose who can see this post.';
  END IF;

  IF 'assigned_buddy'=ANY(audiences)
     AND NOT EXISTS(
       SELECT 1 FROM public.buddy_assigned_pairs p
       WHERE p.program_id=p_program
         AND p.student_id=auth.uid()
         AND p.status='confirmed'
         AND public.buddy_assigned_access(p.id)
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

  IF 'whole_community'=ANY(audiences) THEN
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
    'audiences',to_jsonb(audiences),
    'public_post_id',public_id
  );

  INSERT INTO public.buddy_choice_posts(program_id,user_id,payload)
  VALUES(p_program,auth.uid(),clean)
  RETURNING id INTO result;

  UPDATE public.posts SET buddy_post_id=result WHERE id=public_id;
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
  audiences text[];
  previous_audiences text[];
  public_id uuid;
  has_public_connection boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;

  SELECT * INTO s FROM public.buddy_choice_posts WHERE id=p_post AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));

  SELECT * INTO s
  FROM public.buddy_choice_posts
  WHERE id=p_post AND user_id=auth.uid() AND active
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;

  IF NOT public.buddy_choice_member(s.program_id,auth.uid())
     OR NOT EXISTS(SELECT 1 FROM buddy_choice_members WHERE program_id=s.program_id
       AND user_id=auth.uid() AND role='first' AND active)
  THEN RAISE EXCEPTION 'First year student access required.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM buddy_programs WHERE id=s.program_id AND choice_enabled)
  THEN RAISE EXCEPTION 'Posting is paused.'; END IF;

  audiences:=public.buddy_post_audiences(p_payload);
  audience:=audiences[1];
  previous_audiences:=public.buddy_post_audiences(s.payload);
  public_id:=nullif(s.payload->>'public_post_id','')::uuid;

  IF audience NOT IN ('assigned_buddy','buddy_program','whole_community') THEN
    RAISE EXCEPTION 'Choose who can see this post.';
  END IF;

  IF 'assigned_buddy'=ANY(audiences)
     AND NOT EXISTS(
       SELECT 1 FROM public.buddy_assigned_pairs p
       WHERE p.program_id=s.program_id
         AND p.student_id=auth.uid()
         AND p.status='confirmed'
         AND public.buddy_assigned_access(p.id)
     )
  THEN RAISE EXCEPTION 'Confirm your assigned Buddy before posting only to them.'; END IF;


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

  IF EXISTS(SELECT 1 FROM jsonb_array_elements((p_payload->'helpType')||(p_payload->'industry')) e
       WHERE jsonb_typeof(e)<>'string' OR length(e::text)>100)
     OR length(coalesce(p_payload->>'time',''))>30 OR length(p_payload::text)>5000
  THEN RAISE EXCEPTION 'Invalid post options.'; END IF;

  IF 'buddy_program'=ANY(previous_audiences) AND NOT ('buddy_program'=ANY(audiences)) THEN
    UPDATE public.buddy_choice_invites
    SET status='withdrawn'
    WHERE post_id=s.id AND status='pending';
    UPDATE public.notifications n SET read_at=coalesce(n.read_at,now()),
      payload=n.payload||jsonb_build_object('resolved','withdrawn')
    WHERE n.payload->>'kind'='buddy_help_offer'
      AND n.payload->>'post_id'=s.id::text
      AND n.payload->>'invite_id' IN (SELECT id::text FROM buddy_choice_invites WHERE post_id=s.id AND status='withdrawn');


    IF NOT ('buddy_program'=ANY(audiences)) THEN
      DELETE FROM public.buddy_recommendation_actions
      WHERE post_id=s.id;
    END IF;
  END IF;

  IF public_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.matches
      WHERE post_id=public_id
    ) INTO has_public_connection;
  ELSE
    has_public_connection:=false;
  END IF;

  IF 'whole_community'=ANY(audiences) THEN
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
          buddy_visible=true,
          created_at=now()
      WHERE id=public_id AND created_by=auth.uid();
    END IF;
  ELSE
    IF public_id IS NOT NULL THEN
      IF has_public_connection THEN
        UPDATE public.posts SET expires_at=now(),buddy_visible=false
        WHERE id=public_id AND created_by=auth.uid();
      ELSE
        DELETE FROM public.posts
        WHERE id=public_id AND created_by=auth.uid();
        public_id:=NULL;
      END IF;
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
    'audiences',to_jsonb(audiences),
    'public_post_id',public_id
  );

  UPDATE public.buddy_choice_posts
  SET payload=clean,created_at=now()
  WHERE id=s.id;
  UPDATE public.posts SET buddy_post_id=s.id WHERE id=public_id;
END;
$$;

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

  IF NOT ('buddy_program'=ANY(public.buddy_post_audiences(s.payload))) THEN
    RAISE EXCEPTION 'This post is not shared with Buddy Program.';
  END IF;

  SELECT least(max_mentees,3) INTO cap
  FROM public.buddy_programs
  WHERE id=s.program_id AND choice_enabled;

  IF NOT EXISTS(SELECT 1 FROM public.buddy_upper_applications a WHERE a.program_id=s.program_id AND a.user_id=auth.uid() AND a.status='approved') THEN RAISE EXCEPTION 'Approved upper year access required.'; END IF;

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
      (CASE WHEN s.user_id=auth.uid() THEN s.payload ELSE s.payload-'public_post_id' END)||
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
        AND EXISTS(SELECT 1 FROM public.buddy_upper_applications a WHERE a.program_id=p.id AND a.user_id=auth.uid() AND a.status='approved')
        AND 'buddy_program'=ANY(public.buddy_post_audiences(s.payload))
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
              AND 'assigned_buddy'=ANY(public.buddy_post_audiences(s.payload))
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

  SELECT * INTO s FROM public.buddy_choice_posts WHERE id=p_post AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));

  SELECT * INTO s
  FROM public.buddy_choice_posts
  WHERE id=p_post AND user_id=auth.uid() AND active;

  IF s.id IS NULL
     OR NOT ('buddy_program'=ANY(public.buddy_post_audiences(s.payload)))
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

CREATE OR REPLACE FUNCTION public.buddy_choice_remove(p_post uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s public.buddy_choice_posts;
  public_id uuid;
  has_public_connection boolean;
BEGIN
  SELECT * INTO s FROM public.buddy_choice_posts WHERE id=p_post AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));

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
    ) INTO has_public_connection;

    IF has_public_connection THEN
      UPDATE public.posts SET expires_at=now(),buddy_visible=false
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

    UPDATE public.notifications n SET read_at=coalesce(n.read_at,now()),
      payload=n.payload||jsonb_build_object('resolved','withdrawn')
    WHERE n.payload->>'kind'='buddy_help_offer'
      AND n.payload->>'post_id'=s.id::text
      AND n.payload->>'invite_id' IN (SELECT id::text FROM buddy_choice_invites WHERE post_id=s.id AND status='withdrawn');
END;
$$;


-- New entry points fail clearly until this migration is installed, rather than
-- letting an old server silently ignore the selected audiences.
CREATE OR REPLACE FUNCTION public.buddy_choice_publish_multi(p_program uuid,p_post jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(p_post ? 'audiences',false) THEN RAISE EXCEPTION 'Choose between 1 and 3 audiences.'; END IF;
 RETURN public.buddy_choice_publish(p_program,p_post);
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_choice_update_multi(p_post uuid,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT coalesce(p_payload ? 'audiences',false) THEN RAISE EXCEPTION 'Choose between 1 and 3 audiences.'; END IF;
 PERFORM public.buddy_choice_update(p_post,p_payload);
END; $$;
REVOKE ALL ON FUNCTION public.buddy_choice_publish_multi(uuid,jsonb),public.buddy_choice_update_multi(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buddy_choice_publish_multi(uuid,jsonb),public.buddy_choice_update_multi(uuid,jsonb) TO authenticated;
-- Public mirrors are projections of the Buddy post. Direct legacy writes are
-- rejected; the owner RPCs below preserve all destinations and validate changes.
CREATE OR REPLACE FUNCTION public.buddy_public_visible(p_buddy uuid,p_visible boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_buddy IS NULL OR EXISTS(
  SELECT 1 FROM buddy_choice_posts s WHERE s.id=p_buddy AND (
   s.user_id=auth.uid() OR (
    buddy_choice_allowed(s.program_id,auth.uid(),s.user_id) AND (
     (p_visible AND s.active AND 'whole_community'=ANY(buddy_post_audiences(s.payload))
      AND ((s.payload->>'expiresAt') IS NULL OR (s.payload->>'expiresAt')::timestamptz>now()))
     OR EXISTS(SELECT 1 FROM matches m WHERE m.post_id=nullif(s.payload->>'public_post_id','')::uuid
       AND auth.uid() IN(m.requester_user_id,m.helper_user_id) AND m.status IN ('active','completed'))
    )
   )
  )
 );
$$;
REVOKE ALL ON FUNCTION public.buddy_public_visible(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buddy_public_visible(uuid,boolean) TO authenticated,anon;
DROP POLICY IF EXISTS buddy_mirror_visibility ON public.posts;
CREATE POLICY buddy_mirror_visibility ON public.posts AS RESTRICTIVE FOR SELECT
 USING(public.buddy_public_visible(buddy_post_id,buddy_visible));
DROP POLICY IF EXISTS buddy_mirror_update ON public.posts;
CREATE POLICY buddy_mirror_update ON public.posts AS RESTRICTIVE FOR UPDATE
 USING(buddy_post_id IS NULL) WITH CHECK(buddy_post_id IS NULL);
DROP POLICY IF EXISTS buddy_mirror_delete ON public.posts;
CREATE POLICY buddy_mirror_delete ON public.posts AS RESTRICTIVE FOR DELETE USING(buddy_post_id IS NULL);
DROP POLICY IF EXISTS buddy_mirror_insert ON public.posts;
CREATE POLICY buddy_mirror_insert ON public.posts AS RESTRICTIVE FOR INSERT WITH CHECK(buddy_post_id IS NULL);

CREATE OR REPLACE FUNCTION public.buddy_public_update(p_post uuid,p_fields jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s buddy_choice_posts; v_payload jsonb;
BEGIN
 SELECT s0.* INTO s FROM buddy_choice_posts s0 JOIN posts p ON p.buddy_post_id=s0.id
 WHERE p.id=p_post AND s0.user_id=auth.uid() AND s0.active AND p.buddy_visible;
 IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;
 v_payload:=s.payload||jsonb_build_object(
  'needs',p_fields->>'need_text','offers',p_fields->>'offer_text',
  'helpType',p_fields->'help_type','industry',p_fields->'industry_tag',
  'time',coalesce(p_fields->>'time_commitment','15 min'),'urgency',p_fields->>'urgency',
  'is_anonymous',coalesce((p_fields->>'is_anonymous')::boolean,true));
 IF p_fields ? 'expiresAt' THEN v_payload:=v_payload||jsonb_build_object('expiresAt',p_fields->'expiresAt'); END IF;
 PERFORM buddy_choice_update(s.id,v_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.buddy_public_remove(p_post uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 SELECT s.id INTO v_id FROM buddy_choice_posts s JOIN posts p ON p.buddy_post_id=s.id
 WHERE p.id=p_post AND s.user_id=auth.uid();
 IF v_id IS NULL THEN RAISE EXCEPTION 'Post not available.'; END IF;
 PERFORM buddy_choice_remove(v_id);
END; $$;

-- Home keeps its existing immediate-connect and identity-consent behavior.
-- Reuse an active relationship created through Buddy or My Buddies without
-- revealing an anonymous conversation or creating a second match/chat.
CREATE OR REPLACE FUNCTION public.buddy_public_connect(p_post uuid)
RETURNS public.matches LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s buddy_choice_posts; v_match matches;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 SELECT s0.* INTO s FROM buddy_choice_posts s0 JOIN posts p ON p.buddy_post_id=s0.id WHERE p.id=p_post;
 IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));
 SELECT * INTO s FROM buddy_choice_posts WHERE id=s.id FOR UPDATE;
 IF NOT s.active OR s.user_id=auth.uid()
 OR NOT buddy_choice_allowed(s.program_id,auth.uid(),s.user_id)
 OR NOT ('whole_community'=ANY(buddy_post_audiences(s.payload)))
 OR ((s.payload->>'expiresAt') IS NOT NULL AND (s.payload->>'expiresAt')::timestamptz<=now())
 OR NOT EXISTS(SELECT 1 FROM posts WHERE id=p_post AND buddy_post_id=s.id AND buddy_visible)
 THEN RAISE EXCEPTION 'Post not available.'; END IF;
 SELECT * INTO v_match FROM matches m WHERE m.status IN ('active','completed')
 AND coalesce(m.source,'post')<>'practice'
 AND ((m.requester_user_id=s.user_id AND m.helper_user_id=auth.uid())
 OR (m.helper_user_id=s.user_id AND m.requester_user_id=auth.uid()))
 ORDER BY m.created_at DESC,m.id LIMIT 1 FOR UPDATE;
 IF v_match.id IS NULL THEN
  INSERT INTO matches(post_id,requester_user_id,helper_user_id,status)
  VALUES(p_post,s.user_id,auth.uid(),'active')
  ON CONFLICT(post_id,helper_user_id) DO UPDATE SET status='active'
  RETURNING * INTO v_match;
 END IF;
 RETURN v_match;
END; $$;
REVOKE ALL ON FUNCTION public.buddy_public_update(uuid,jsonb),public.buddy_public_remove(uuid),public.buddy_public_connect(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buddy_public_update(uuid,jsonb),public.buddy_public_remove(uuid),public.buddy_public_connect(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.buddy_choice_connect(p_invite uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  i public.buddy_choice_invites;
  s public.buddy_choice_posts;
  v_match uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;

  SELECT * INTO i FROM public.buddy_choice_invites WHERE id=p_invite;
  IF NOT FOUND OR auth.uid()<>i.first_id THEN RAISE EXCEPTION 'Help offer is no longer available.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(i.program_id::text,11));

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
     OR NOT ('buddy_program'=ANY(public.buddy_post_audiences(s.payload)))
     OR NOT EXISTS(SELECT 1 FROM buddy_upper_applications a WHERE a.program_id=i.program_id AND a.user_id=i.upper_id AND a.status='approved')
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
  WHERE m.status IN ('active','completed')
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


CREATE OR REPLACE FUNCTION public.buddy_assigned_open_chat(p_pair uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p buddy_assigned_pairs; chat_id uuid;
BEGIN
 SELECT * INTO p FROM buddy_assigned_pairs WHERE id=p_pair;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Confirm your Buddy pairing before opening this chat.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p.program_id::text,11));
 SELECT * INTO p FROM buddy_assigned_pairs WHERE id=p_pair FOR UPDATE;
 IF p.id IS NULL OR NOT buddy_assigned_access(p_pair) THEN
  RAISE EXCEPTION 'Confirm your Buddy pairing before opening this chat.';
 END IF;

 -- Serialize both participants opening the same confirmed pairing.
 -- A saved chat is never silently replaced or revived after an unmatch.
 IF p.match_id IS NOT NULL THEN
  SELECT id INTO chat_id FROM matches
  WHERE id=p.match_id AND status IN ('active','completed')
   AND identity_reveal_status='accepted'
   AND ((requester_user_id=p.mentor_id AND helper_user_id=p.student_id)
     OR (requester_user_id=p.student_id AND helper_user_id=p.mentor_id));
  IF chat_id IS NULL THEN
   RAISE EXCEPTION 'This conversation has ended. Your Buddy questions are still available.';
  END IF;
 ELSE
  -- Reuse a conversation where these two people have already shared their
  -- identities. Never reveal an anonymous conversation through this shortcut.
  SELECT id INTO chat_id FROM matches
  WHERE status IN ('active','completed') AND identity_reveal_status='accepted'
   AND ((requester_user_id=p.mentor_id AND helper_user_id=p.student_id)
     OR (requester_user_id=p.student_id AND helper_user_id=p.mentor_id))
  ORDER BY created_at DESC,id LIMIT 1;

  IF chat_id IS NULL THEN
   INSERT INTO matches(requester_user_id,helper_user_id,status,source,
    identity_reveal_status,identity_reveal_accepted_at)
   VALUES(p.student_id,p.mentor_id,'active','buddy','accepted',now())
   RETURNING id INTO chat_id;
  END IF;
  UPDATE buddy_assigned_pairs SET match_id=chat_id WHERE id=p.id;
 END IF;
 RETURN jsonb_build_object('match_id',chat_id);
END; $$;



CREATE OR REPLACE FUNCTION public.buddy_is_public_mirror(p_post uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM posts WHERE id=p_post AND buddy_post_id IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.buddy_is_public_mirror(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buddy_is_public_mirror(uuid) TO authenticated,anon;
DROP POLICY IF EXISTS buddy_mirror_match_insert ON public.matches;
CREATE POLICY buddy_mirror_match_insert ON public.matches AS RESTRICTIVE FOR INSERT
 WITH CHECK(NOT public.buddy_is_public_mirror(post_id));

CREATE OR REPLACE FUNCTION public.buddy_choice_renew_post(p_post uuid,p_days integer DEFAULT 7)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE s public.buddy_choice_posts;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Choose a renewal between 1 and 30 days.'; END IF;

 SELECT * INTO s FROM public.buddy_choice_posts WHERE id=p_post AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Post not available.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s.program_id::text,11));
 SELECT * INTO s
 FROM public.buddy_choice_posts
 WHERE id=p_post AND user_id=auth.uid()
 FOR UPDATE;

 IF NOT FOUND OR NOT s.active THEN RAISE EXCEPTION 'Post not available.'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.buddy_choice_members m
   WHERE m.program_id=s.program_id AND m.user_id=auth.uid()
     AND m.role='first' AND m.active
 ) THEN RAISE EXCEPTION 'First year student access required.'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.buddy_programs bp
   WHERE bp.id=s.program_id AND bp.choice_enabled
 ) THEN RAISE EXCEPTION 'Posting is paused.'; END IF;
 IF EXISTS(
   SELECT 1 FROM public.buddy_choice_invites i
   WHERE i.program_id=s.program_id AND i.first_id=auth.uid()
     AND i.status='accepted'
 ) THEN RAISE EXCEPTION 'This post already has an accepted buddy.'; END IF;

 UPDATE public.buddy_choice_posts
 SET payload=jsonb_set(
   payload,
   '{expiresAt}',
   to_jsonb((now()+make_interval(days=>p_days))::timestamptz),
   true
 )
 WHERE id=s.id;
 UPDATE public.posts SET expires_at=now()+make_interval(days=>p_days)
 WHERE buddy_post_id=s.id AND buddy_visible
   AND 'whole_community'=ANY(public.buddy_post_audiences(s.payload));
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_choice_renew_post(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buddy_choice_renew_post(uuid,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
