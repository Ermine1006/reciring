-- READ ONLY. Founder may run after migration-story-garden.sql.
-- All client table privileges below should be false, RLS should be true.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') AS member_select,
  has_table_privilege('authenticated',c.oid,'INSERT') AS member_insert,
  has_table_privilege('authenticated',c.oid,'UPDATE') AS member_update,
  has_table_privilege('authenticated',c.oid,'DELETE') AS member_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
  ('stories','story_bookmarks','story_reactions','story_replies','story_mutes','story_reports','story_moderators')
ORDER BY c.relname;

-- Every public entrypoint should be SECURITY DEFINER, callable by members,
-- not anon. search_path should be fixed to pg_catalog,public.
SELECT p.oid::regprocedure AS function_name, p.prosecdef AS security_definer,
  p.proconfig AS settings,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('story_access','story_list','story_get','story_save','story_withdraw',
  'story_set_bookmark','story_set_reaction','story_list_replies','story_save_reply',
  'story_delete_reply','story_report','story_mute_writer','story_clear_mutes',
  'story_moderation_queue','story_review_report')
ORDER BY p.proname;

-- Both schema USAGE and helper EXECUTE should be false for client roles.
SELECT has_schema_privilege('anon','story_private','USAGE') AS anon_usage,
       has_schema_privilege('authenticated','story_private','USAGE') AS member_usage;
SELECT p.oid::regprocedure AS helper,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='story_private' ORDER BY p.proname;

-- Moderator enrollment is deliberate and separate. This exposes no stories.
SELECT c.name AS community, count(m.user_id) AS appointed_moderators
FROM public.communities c LEFT JOIN public.story_moderators m ON m.community_id=c.id
WHERE c.slug='rotman' GROUP BY c.id,c.name;
