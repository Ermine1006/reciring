-- Story Garden v1. PROPOSAL: the founder runs this in Supabase SQL Editor.
-- Never run from the app or a deployment hook. No existing product rows change.
-- Requires the existing profiles, communities, community_members and blocks.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.community_members') IS NULL
     OR to_regclass('public.blocks') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='profiles' AND column_name='access_status')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='profiles' AND column_name='name') THEN
    RAISE EXCEPTION 'Story Garden prerequisites are missing. Review the existing community schema first.';
  END IF;
  IF to_regclass('public.stories') IS NOT NULL
     AND obj_description(to_regclass('public.stories')) IS DISTINCT FROM 'Mutu Story Garden schema v1' THEN
    RAISE EXCEPTION 'An unrelated stories table exists. Stop and review before proceeding.';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS story_private;
REVOKE ALL ON SCHEMA story_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
  topic text NOT NULL CHECK (topic IN ('work','mba','people','becoming')),
  identity_mode text NOT NULL DEFAULT 'anonymous' CHECK (identity_mode IN ('anonymous','named')),
  response_mode text NOT NULL DEFAULT 'sharing' CHECK (response_mode IN ('sharing','conversation')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','withdrawn','removed')),
  pledge_version text,
  pledged_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (status <> 'published' OR
    (char_length(btrim(body, E' \n\r\t')) > 0 AND pledge_version IS NOT NULL AND pledge_version='own-words-v1' AND pledged_at IS NOT NULL))
);
COMMENT ON TABLE public.stories IS 'Mutu Story Garden schema v1';
CREATE INDEX IF NOT EXISTS stories_garden ON public.stories(community_id, published_at DESC, id DESC)
  WHERE status='published';
CREATE INDEX IF NOT EXISTS stories_owner ON public.stories(author_id, community_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.story_bookmarks (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(story_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.story_reactions (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('warmth','relate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(story_id,user_id,kind)
);
CREATE TABLE IF NOT EXISTS public.story_replies (
  id uuid PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000 AND char_length(btrim(body,E' \n\r\t'))>0),
  identity_mode text NOT NULL DEFAULT 'anonymous' CHECK (identity_mode IN ('anonymous','named')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','removed')),
  pledge_version text NOT NULL CHECK (pledge_version='own-words-v1'),
  pledged_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS story_replies_page ON public.story_replies(story_id,created_at DESC,id DESC)
  WHERE status='active';
-- A separate private mute avoids exposing an anonymous writer through the
-- existing blocks table, whose blocker can SELECT blocked_user_id.
CREATE TABLE IF NOT EXISTS public.story_mutes (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  writer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,writer_id),
  CHECK(user_id<>writer_id)
);
CREATE TABLE IF NOT EXISTS public.story_moderators (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY(community_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.story_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES public.story_replies(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  writer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('privacy','unkind','ai_concern','spam','other')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details)<=2000),
  title_snapshot text NOT NULL,
  body_snapshot text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS story_reports_one_open ON public.story_reports
  (reporter_id,story_id,coalesce(reply_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE status='open';

-- No raw client table access, including for owners. Every read below is an
-- explicit projection. RLS remains deny-by-default as an additional barrier.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stories','story_bookmarks','story_reactions','story_replies',
                          'story_mutes','story_moderators','story_reports'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION story_private.eligible(u uuid,c uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT u IS NOT NULL
   AND EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND access_status='active')
   AND EXISTS(SELECT 1 FROM public.community_members WHERE user_id=u AND community_id=c AND status='member');
$$;
CREATE OR REPLACE FUNCTION story_private.blocked(a uuid,b uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.blocks WHERE
   (blocker_id=a AND blocked_user_id=b) OR (blocker_id=b AND blocked_user_id=a))
 OR EXISTS(SELECT 1 FROM public.story_mutes WHERE
   (user_id=a AND writer_id=b) OR (user_id=b AND writer_id=a));
$$;
CREATE OR REPLACE FUNCTION story_private.readable(s public.stories) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT story_private.eligible(auth.uid(),s.community_id)
 AND (s.author_id=auth.uid() OR
   (s.status='published' AND story_private.eligible(s.author_id,s.community_id)
    AND NOT story_private.blocked(auth.uid(),s.author_id)));
$$;
CREATE OR REPLACE FUNCTION story_private.require_access(c uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT story_private.eligible(auth.uid(),c) THEN
   RAISE EXCEPTION 'STORY_ACCESS' USING ERRCODE='42501';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION story_private.require_story(i uuid) RETURNS public.stories
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public.stories;
BEGIN
 SELECT * INTO s FROM public.stories WHERE id=i;
 IF s.id IS NULL OR NOT story_private.readable(s) THEN
   RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 RETURN s;
END $$;
CREATE OR REPLACE FUNCTION story_private.project(s public.stories, detail boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object(
   'id',s.id,'title',s.title,'excerpt',left(s.body,180),'topic',s.topic,
   'identity_mode',s.identity_mode,'response_mode',s.response_mode,
   'author_name',CASE WHEN s.identity_mode='named' THEN
     (SELECT coalesce(nullif(btrim(name),''),'A community member') FROM public.profiles WHERE id=s.author_id)
     ELSE 'A community member' END,
   'is_mine',s.author_id=auth.uid(),'published_at',s.published_at,
   'bookmarked',EXISTS(SELECT 1 FROM public.story_bookmarks WHERE story_id=s.id AND user_id=auth.uid()),
   'my_reactions',coalesce((SELECT jsonb_agg(kind ORDER BY kind) FROM public.story_reactions
                           WHERE story_id=s.id AND user_id=auth.uid()),'[]'::jsonb)
 ) || CASE WHEN detail THEN jsonb_build_object('body',s.body) ELSE '{}'::jsonb END
   || CASE WHEN s.author_id=auth.uid() THEN jsonb_build_object('version',s.version,'status',s.status,
        'updated_at',s.updated_at,
        'received_reactions',coalesce((SELECT jsonb_agg(DISTINCT kind) FROM public.story_reactions r
          WHERE r.story_id=s.id AND story_private.eligible(r.user_id,s.community_id)
          AND NOT story_private.blocked(auth.uid(),r.user_id)),'[]'::jsonb))
      ELSE '{}'::jsonb END;
$$;
CREATE OR REPLACE FUNCTION story_private.reply_visible(r public.story_replies,s public.stories) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT r.status='active' AND story_private.readable(s)
 AND story_private.eligible(r.author_id,s.community_id)
 AND NOT story_private.blocked(auth.uid(),r.author_id)
 AND NOT story_private.blocked(s.author_id,r.author_id);
$$;
CREATE OR REPLACE FUNCTION story_private.reply_project(r public.story_replies,s public.stories) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',r.id,'body',r.body,'created_at',r.created_at,
   'identity_mode',r.identity_mode,'is_mine',r.author_id=auth.uid(),
   'is_story_author',r.author_id=s.author_id,
   'author_name',CASE WHEN r.author_id=s.author_id AND s.identity_mode='anonymous' THEN 'Story author'
     WHEN r.identity_mode='named' THEN (SELECT coalesce(nullif(btrim(name),''),'A community member')
                                     FROM public.profiles WHERE id=r.author_id)
     ELSE 'A community member' END)
 || CASE WHEN r.author_id=auth.uid() THEN jsonb_build_object('version',r.version) ELSE '{}'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION public.story_access(p_community_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM story_private.require_access(p_community_id);
 RETURN jsonb_build_object('schema_version',1,'can_moderate',
   EXISTS(SELECT 1 FROM public.story_moderators WHERE user_id=auth.uid() AND community_id=p_community_id),
   'my_name',(SELECT coalesce(nullif(btrim(name),''),'A community member') FROM public.profiles WHERE id=auth.uid()));
END $$;

CREATE OR REPLACE FUNCTION public.story_list(
 p_community_id uuid,p_view text DEFAULT 'garden',p_topic text DEFAULT NULL,
 p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 4
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; n integer:=least(greatest(coalesce(p_limit,4),1),24);
BEGIN
 PERFORM story_private.require_access(p_community_id);
 IF p_view IS NULL OR p_view NOT IN ('garden','mine','bookmarks')
    OR ((p_before IS NULL)<>(p_before_id IS NULL))
    OR (p_topic IS NOT NULL AND p_topic NOT IN ('work','mba','people','becoming')) THEN
   RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023';
 END IF;
 WITH eligible AS (
   SELECT s.*,CASE WHEN p_view='mine' THEN s.updated_at ELSE s.published_at END AS sort_at
   FROM public.stories s WHERE s.community_id=p_community_id AND story_private.readable(s)
    AND (p_topic IS NULL OR s.topic=p_topic)
    AND CASE WHEN p_view='mine' THEN s.author_id=auth.uid()
        WHEN p_view='bookmarks' THEN s.status='published' AND EXISTS
          (SELECT 1 FROM public.story_bookmarks b WHERE b.story_id=s.id AND b.user_id=auth.uid())
        ELSE s.status='published' END
 ), page AS (
   SELECT * FROM eligible WHERE p_before IS NULL OR (sort_at,id)<(p_before,p_before_id)
   ORDER BY sort_at DESC,id DESC LIMIT n+1
 ), shown AS (SELECT * FROM page ORDER BY sort_at DESC,id DESC LIMIT n),
 last_row AS (SELECT sort_at,id FROM shown ORDER BY sort_at,id LIMIT 1)
 SELECT jsonb_build_object('items',coalesce(
   (SELECT jsonb_agg(story_private.project(s,p_view='mine') ORDER BY shown.sort_at DESC,shown.id DESC)
    FROM shown JOIN public.stories s ON s.id=shown.id),'[]'::jsonb),
   'next_cursor',CASE WHEN (SELECT count(*) FROM page)>n THEN
     (SELECT jsonb_build_object('at',sort_at,'id',id) FROM last_row) ELSE NULL END)
 INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.story_get(p_story_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories;
BEGIN
 s:=story_private.require_story(p_story_id);
 RETURN story_private.project(s,true);
END $$;

CREATE OR REPLACE FUNCTION public.story_save(
 p_id uuid,p_community_id uuid,p_title text,p_body text,p_topic text,
 p_identity_mode text DEFAULT 'anonymous',p_response_mode text DEFAULT 'sharing',
 p_expected_version integer DEFAULT 0,p_publish boolean DEFAULT false,p_pledge boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories; target_status text;
BEGIN
 PERFORM story_private.require_access(p_community_id);
 IF p_id IS NULL OR p_title IS NULL OR p_body IS NULL OR p_expected_version IS NULL
 OR p_publish IS NULL OR p_pledge IS NULL OR char_length(p_title)>120 OR char_length(p_body)>20000
 OR p_topic IS NULL OR p_topic NOT IN ('work','mba','people','becoming')
 OR p_identity_mode IS NULL OR p_identity_mode NOT IN ('anonymous','named')
 OR p_response_mode IS NULL OR p_response_mode NOT IN ('sharing','conversation') THEN
   RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023';
 END IF;
 IF p_publish AND (NOT p_pledge OR char_length(btrim(p_body,E' \n\r\t'))=0) THEN
   RAISE EXCEPTION 'STORY_PLEDGE' USING ERRCODE='22023';
 END IF;
 -- Serialize this author's writes, including the first client-generated UUID.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7321));
 SELECT * INTO s FROM public.stories WHERE id=p_id FOR UPDATE;
 IF s.id IS NOT NULL THEN
   IF s.author_id<>auth.uid() OR s.community_id<>p_community_id THEN
     RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501';
   END IF;
   IF s.status='removed' THEN RAISE EXCEPTION 'STORY_REMOVED' USING ERRCODE='42501'; END IF;
   IF s.status='published' AND NOT p_publish THEN
     RAISE EXCEPTION 'STORY_SHARED_EDIT' USING ERRCODE='22023';
   END IF;
   target_status:=CASE WHEN p_publish THEN 'published' ELSE 'draft' END;
   -- An identical retry after a lost response is safe and creates no extra row.
   IF (s.title,s.body,s.topic,s.identity_mode,s.response_mode,s.status)=
      (p_title,p_body,p_topic,p_identity_mode,p_response_mode,target_status) THEN
     RETURN story_private.project(s,true);
   END IF;
   IF s.version<>p_expected_version THEN RAISE EXCEPTION 'STORY_CONFLICT' USING ERRCODE='40001'; END IF;
   UPDATE public.stories SET title=p_title,body=p_body,topic=p_topic,
     identity_mode=p_identity_mode,response_mode=p_response_mode,status=target_status,
     pledge_version=CASE WHEN p_publish THEN 'own-words-v1' ELSE pledge_version END,
     pledged_at=CASE WHEN p_publish THEN now() ELSE pledged_at END,
     published_at=CASE WHEN p_publish THEN coalesce(published_at,now()) ELSE published_at END,
     updated_at=clock_timestamp(),version=version+1 WHERE id=p_id RETURNING * INTO s;
 ELSE
   IF p_expected_version<>0 THEN RAISE EXCEPTION 'STORY_CONFLICT' USING ERRCODE='40001'; END IF;
   IF (SELECT count(*) FROM public.stories WHERE author_id=auth.uid() AND created_at>now()-interval '1 day')>=20 THEN
     RAISE EXCEPTION 'STORY_RATE_LIMIT' USING ERRCODE='P0001';
   END IF;
   INSERT INTO public.stories(id,community_id,author_id,title,body,topic,identity_mode,response_mode,
     status,pledge_version,pledged_at,published_at)
   VALUES(p_id,p_community_id,auth.uid(),p_title,p_body,p_topic,p_identity_mode,p_response_mode,
     CASE WHEN p_publish THEN 'published' ELSE 'draft' END,
     CASE WHEN p_publish THEN 'own-words-v1' END,CASE WHEN p_publish THEN now() END,
     CASE WHEN p_publish THEN now() END) RETURNING * INTO s;
 END IF;
 RETURN story_private.project(s,true);
END $$;

CREATE OR REPLACE FUNCTION public.story_withdraw(p_story_id uuid,p_expected_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories;
BEGIN
 SELECT * INTO s FROM public.stories WHERE id=p_story_id AND author_id=auth.uid() FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 PERFORM story_private.require_access(s.community_id);
 IF s.status='removed' THEN RAISE EXCEPTION 'STORY_REMOVED' USING ERRCODE='42501'; END IF;
 IF s.status='withdrawn' THEN RETURN story_private.project(s,true); END IF;
 IF p_expected_version IS NULL OR s.version<>p_expected_version THEN
   RAISE EXCEPTION 'STORY_CONFLICT' USING ERRCODE='40001';
 END IF;
 UPDATE public.stories SET status='withdrawn',version=version+1,updated_at=clock_timestamp()
   WHERE id=s.id RETURNING * INTO s;
 RETURN story_private.project(s,true);
END $$;

CREATE OR REPLACE FUNCTION public.story_set_bookmark(p_story_id uuid,p_value boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories;
BEGIN
 IF auth.uid() IS NULL OR p_value IS NULL THEN RAISE EXCEPTION 'STORY_ACCESS' USING ERRCODE='42501'; END IF;
 IF NOT p_value THEN DELETE FROM public.story_bookmarks WHERE story_id=p_story_id AND user_id=auth.uid();
 ELSE
   s:=story_private.require_story(p_story_id);
   IF s.status<>'published' THEN RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501'; END IF;
   INSERT INTO public.story_bookmarks(story_id,user_id) VALUES(p_story_id,auth.uid()) ON CONFLICT DO NOTHING;
 END IF;
 RETURN jsonb_build_object('bookmarked',p_value);
END $$;

CREATE OR REPLACE FUNCTION public.story_set_reaction(p_story_id uuid,p_kind text,p_value boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'STORY_ACCESS' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('warmth','relate') OR p_value IS NULL THEN
   RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023';
 END IF;
 IF NOT p_value THEN DELETE FROM public.story_reactions
   WHERE story_id=p_story_id AND user_id=auth.uid() AND kind=p_kind;
 ELSE
   s:=story_private.require_story(p_story_id);
   IF s.status<>'published' OR s.author_id=auth.uid() THEN
     RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501';
   END IF;
   INSERT INTO public.story_reactions(story_id,user_id,kind) VALUES(p_story_id,auth.uid(),p_kind)
     ON CONFLICT DO NOTHING;
 END IF;
 RETURN jsonb_build_object('kind',p_kind,'selected',p_value);
END $$;

CREATE OR REPLACE FUNCTION public.story_list_replies(
 p_story_id uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories; result jsonb; n integer:=least(greatest(coalesce(p_limit,20),1),50);
BEGIN
 s:=story_private.require_story(p_story_id);
 IF (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023'; END IF;
 WITH page AS (
   SELECT r.* FROM public.story_replies r WHERE r.story_id=s.id AND story_private.reply_visible(r,s)
     AND (p_before IS NULL OR (r.created_at,r.id)<(p_before,p_before_id))
   ORDER BY r.created_at DESC,r.id DESC LIMIT n+1
 ), shown AS (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT n),
 last_row AS (SELECT created_at,id FROM shown ORDER BY created_at,id LIMIT 1)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(story_private.reply_project(r,s)
   ORDER BY shown.created_at DESC,shown.id DESC) FROM shown JOIN public.story_replies r ON r.id=shown.id),'[]'::jsonb),
   'next_cursor',CASE WHEN (SELECT count(*) FROM page)>n THEN
    (SELECT jsonb_build_object('at',created_at,'id',id) FROM last_row) END) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.story_save_reply(
 p_id uuid,p_story_id uuid,p_body text,p_identity_mode text DEFAULT 'anonymous',p_expected_version integer DEFAULT 0,
 p_pledge boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories; r public.story_replies;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'STORY_ACCESS' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7321));
 -- Parent row lock serializes publication/withdrawal/reply-mode changes with replies.
 SELECT * INTO s FROM public.stories WHERE id=p_story_id FOR UPDATE;
 IF s.id IS NULL OR NOT story_private.readable(s) OR s.status<>'published' THEN
   RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 IF s.response_mode<>'conversation' THEN RAISE EXCEPTION 'STORY_REPLIES_CLOSED' USING ERRCODE='42501'; END IF;
 IF p_pledge IS DISTINCT FROM true THEN RAISE EXCEPTION 'STORY_PLEDGE' USING ERRCODE='22023'; END IF;
 IF p_id IS NULL OR p_body IS NULL OR char_length(p_body)>2000 OR char_length(btrim(p_body,E' \n\r\t'))=0
    OR p_identity_mode IS NULL OR p_identity_mode NOT IN ('anonymous','named') OR p_expected_version IS NULL THEN
   RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023';
 END IF;
 SELECT * INTO r FROM public.story_replies WHERE id=p_id FOR UPDATE;
 IF r.id IS NOT NULL THEN
   IF r.author_id<>auth.uid() OR r.story_id<>p_story_id OR r.status<>'active' THEN
     RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501';
   END IF;
   IF r.body=p_body AND r.identity_mode=p_identity_mode THEN RETURN story_private.reply_project(r,s); END IF;
   IF r.version<>p_expected_version THEN RAISE EXCEPTION 'STORY_CONFLICT' USING ERRCODE='40001'; END IF;
   UPDATE public.story_replies SET body=p_body,identity_mode=p_identity_mode,version=version+1,pledged_at=clock_timestamp(),
     updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO r;
 ELSE
   IF p_expected_version<>0 THEN RAISE EXCEPTION 'STORY_CONFLICT' USING ERRCODE='40001'; END IF;
   IF (SELECT count(*) FROM public.story_replies WHERE author_id=auth.uid() AND created_at>now()-interval '1 hour')>=30 THEN
     RAISE EXCEPTION 'STORY_RATE_LIMIT' USING ERRCODE='P0001';
   END IF;
   INSERT INTO public.story_replies(id,story_id,author_id,body,identity_mode,pledge_version,pledged_at)
     VALUES(p_id,p_story_id,auth.uid(),p_body,p_identity_mode,'own-words-v1',now()) RETURNING * INTO r;
 END IF;
 RETURN story_private.reply_project(r,s);
END $$;

CREATE OR REPLACE FUNCTION public.story_delete_reply(p_reply_id uuid,p_expected_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.story_replies;
BEGIN
 SELECT * INTO r FROM public.story_replies WHERE id=p_reply_id AND author_id=auth.uid() FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF r.status='deleted' THEN RETURN jsonb_build_object('deleted',true); END IF;
 IF p_expected_version IS NULL OR r.version<>p_expected_version THEN
   RAISE EXCEPTION 'STORY_CONFLICT' USING ERRCODE='40001';
 END IF;
 -- Owners can remove their own words even after losing access or reply closure.
 UPDATE public.story_replies SET status='deleted',body='[Deleted]',version=version+1,
   updated_at=clock_timestamp() WHERE id=p_reply_id;
 RETURN jsonb_build_object('deleted',true);
END $$;

CREATE OR REPLACE FUNCTION public.story_report(
 p_story_id uuid,p_reply_id uuid DEFAULT NULL,p_reason text DEFAULT 'other',p_details text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories; r public.story_replies; writer uuid; content text;
BEGIN
 s:=story_private.require_story(p_story_id);
 IF s.status<>'published' OR p_reason IS NULL OR p_reason NOT IN ('privacy','unkind','ai_concern','spam','other')
    OR p_details IS NULL OR char_length(p_details)>2000 THEN RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023'; END IF;
 writer:=s.author_id; content:=s.body;
 IF p_reply_id IS NOT NULL THEN
   SELECT * INTO r FROM public.story_replies WHERE id=p_reply_id AND story_id=s.id;
   IF r.id IS NULL OR NOT story_private.reply_visible(r,s) THEN
     RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501';
   END IF;
   writer:=r.author_id; content:=r.body;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7321));
 IF NOT EXISTS(SELECT 1 FROM public.story_reports WHERE reporter_id=auth.uid() AND story_id=s.id
    AND reply_id IS NOT DISTINCT FROM p_reply_id AND status='open') THEN
   IF (SELECT count(*) FROM public.story_reports WHERE reporter_id=auth.uid() AND created_at>now()-interval '1 day')>=20 THEN
     RAISE EXCEPTION 'STORY_RATE_LIMIT' USING ERRCODE='P0001';
   END IF;
   INSERT INTO public.story_reports(community_id,story_id,reply_id,reporter_id,writer_id,reason,details,title_snapshot,body_snapshot)
   VALUES(s.community_id,s.id,p_reply_id,auth.uid(),writer,p_reason,p_details,s.title,content);
 END IF;
 RETURN jsonb_build_object('submitted',true);
END $$;

CREATE OR REPLACE FUNCTION public.story_mute_writer(p_story_id uuid,p_reply_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.stories; r public.story_replies; writer uuid;
BEGIN
 s:=story_private.require_story(p_story_id); writer:=s.author_id;
 IF p_reply_id IS NOT NULL THEN
   SELECT * INTO r FROM public.story_replies WHERE id=p_reply_id AND story_id=s.id;
   IF r.id IS NULL OR NOT story_private.reply_visible(r,s) THEN
     RAISE EXCEPTION 'STORY_UNAVAILABLE' USING ERRCODE='42501';
   END IF;
   writer:=r.author_id;
 END IF;
 IF writer=auth.uid() THEN RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023'; END IF;
 INSERT INTO public.story_mutes(user_id,writer_id) VALUES(auth.uid(),writer) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('muted',true);
END $$;

CREATE OR REPLACE FUNCTION public.story_clear_mutes() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'STORY_ACCESS' USING ERRCODE='42501'; END IF;
 DELETE FROM public.story_mutes WHERE user_id=auth.uid();
 RETURN jsonb_build_object('cleared',true);
END $$;

CREATE OR REPLACE FUNCTION public.story_moderation_queue(p_community_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM story_private.require_access(p_community_id);
 IF NOT EXISTS(SELECT 1 FROM public.story_moderators WHERE community_id=p_community_id AND user_id=auth.uid()) THEN
   RAISE EXCEPTION 'STORY_ACCESS' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY created_at,id),'[]'::jsonb) INTO result FROM (
   SELECT r.id,r.story_id,r.reply_id,r.reason,r.details,r.title_snapshot,r.body_snapshot,r.created_at,
     p.name AS writer_name,p.email AS writer_email
   FROM public.story_reports r JOIN public.profiles p ON p.id=r.writer_id
   WHERE r.community_id=p_community_id AND r.status='open' ORDER BY r.created_at,r.id LIMIT 50
 ) rows;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.story_review_report(p_report_id uuid,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.story_reports;
BEGIN
 SELECT * INTO r FROM public.story_reports WHERE id=p_report_id FOR UPDATE;
 IF r.id IS NULL OR NOT story_private.eligible(auth.uid(),r.community_id)
   OR NOT EXISTS(SELECT 1 FROM public.story_moderators WHERE community_id=r.community_id AND user_id=auth.uid()) THEN
   RAISE EXCEPTION 'STORY_ACCESS' USING ERRCODE='42501';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('dismiss','remove') THEN RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023'; END IF;
 IF r.status<>'open' THEN RETURN jsonb_build_object('reviewed',true); END IF;
 IF p_action='remove' THEN
   IF r.reply_id IS NULL THEN UPDATE public.stories SET status='removed',version=version+1,
      updated_at=clock_timestamp() WHERE id=r.story_id;
   ELSE UPDATE public.story_replies SET status='removed',version=version+1,
      updated_at=clock_timestamp() WHERE id=r.reply_id; END IF;
 END IF;
 UPDATE public.story_reports SET status=CASE WHEN p_action='dismiss' THEN 'dismissed' ELSE 'removed' END,
   reviewed_at=clock_timestamp(),reviewed_by=auth.uid() WHERE id=r.id;
 RETURN jsonb_build_object('reviewed',true);
END $$;

-- Only public API entrypoints are callable. Private helpers are not an API and
-- never receive client USAGE/EXECUTE grants, including through PUBLIC.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA story_private FROM PUBLIC,anon,authenticated;
DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   AND p.proname IN ('story_access','story_list','story_get','story_save','story_withdraw',
     'story_set_bookmark','story_set_reaction','story_list_replies','story_save_reply',
     'story_delete_reply','story_report','story_mute_writer','story_clear_mutes',
     'story_moderation_queue','story_review_report') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Moderator setup is a separate, deliberate founder action. See
-- docs/story-garden-launch.md. No account is silently made a moderator here.
