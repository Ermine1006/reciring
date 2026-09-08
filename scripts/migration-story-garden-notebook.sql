-- Run manually AFTER migration-story-garden.sql. Safe to rerun.
-- Private cover settings and author-only counts. No demo data or rollout changes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.story_notebooks (
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  color text NOT NULL DEFAULT 'matcha' CHECK(color IN ('matcha','cream','lilac')),
  stamp text NOT NULL DEFAULT 'leaf' CHECK(stamp IN ('leaf','flower','sprout')),
  pen_name text NOT NULL DEFAULT '' CHECK(char_length(pen_name)<=60),
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY(community_id,user_id)
);
ALTER TABLE public.story_notebooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_notebooks FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.story_notebook_get(p_community_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 PERFORM story_private.require_access(p_community_id);
 SELECT jsonb_build_object('color',color,'stamp',stamp,'pen_name',pen_name,'version',version)
 INTO result FROM public.story_notebooks WHERE community_id=p_community_id AND user_id=auth.uid();
 RETURN coalesce(result,jsonb_build_object('color','matcha','stamp','leaf','pen_name','','version',0));
END $$;
CREATE OR REPLACE FUNCTION public.story_notebook_save(
 p_community_id uuid,p_color text,p_stamp text,p_pen_name text,p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE saved integer;
BEGIN
 PERFORM story_private.require_access(p_community_id);
 IF p_color IS NULL OR p_color NOT IN ('matcha','cream','lilac') OR p_stamp IS NULL
 OR p_stamp NOT IN ('leaf','flower','sprout') OR p_pen_name IS NULL OR char_length(p_pen_name)>60
 OR p_expected_version IS NULL OR p_expected_version<0 THEN
   RAISE EXCEPTION 'STORY_INPUT' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.story_notebooks AS n(community_id,user_id,color,stamp,pen_name)
 SELECT p_community_id,auth.uid(),p_color,p_stamp,p_pen_name WHERE p_expected_version=0
 ON CONFLICT DO NOTHING RETURNING version INTO saved;
 IF saved IS NULL THEN
   UPDATE public.story_notebooks SET color=p_color,stamp=p_stamp,pen_name=p_pen_name,version=version+1
   WHERE community_id=p_community_id AND user_id=auth.uid() AND version=p_expected_version
   RETURNING version INTO saved;
 END IF;
 IF saved IS NULL THEN RAISE EXCEPTION 'STORY_CONFLICT' USING ERRCODE='40001'; END IF;
 RETURN public.story_notebook_get(p_community_id);
END $$;
REVOKE ALL ON FUNCTION public.story_notebook_get(uuid),public.story_notebook_save(uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.story_notebook_get(uuid),public.story_notebook_save(uuid,text,text,text,integer) TO authenticated;
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
        'received_reader_count',(SELECT count(DISTINCT r.user_id) FROM public.story_reactions r
          WHERE r.story_id=s.id AND r.user_id<>s.author_id
          AND story_private.eligible(r.user_id,s.community_id)
          AND NOT story_private.blocked(auth.uid(),r.user_id)),
        'received_reactions',coalesce((SELECT jsonb_agg(DISTINCT kind) FROM public.story_reactions r
          WHERE r.story_id=s.id AND story_private.eligible(r.user_id,s.community_id)
          AND NOT story_private.blocked(auth.uid(),r.user_id)),'[]'::jsonb))
      ELSE '{}'::jsonb END;
$$;

REVOKE ALL ON FUNCTION story_private.project(public.stories,boolean) FROM PUBLIC,anon,authenticated;
COMMIT;
