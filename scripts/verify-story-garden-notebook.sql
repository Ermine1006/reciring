-- Read only. Run after migration-story-garden-notebook.sql.
-- One row: rls_enabled true, all direct permissions false.
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') AS member_select,
 has_table_privilege('authenticated',c.oid,'INSERT') AS member_insert,
 has_table_privilege('authenticated',c.oid,'UPDATE') AS member_update,
 has_table_privilege('authenticated',c.oid,'DELETE') AS member_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='story_notebooks';
-- Two rows: security_definer true, anon_execute false, member_execute true.
SELECT p.proname,p.prosecdef AS security_definer,p.proconfig AS settings,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('story_notebook_get','story_notebook_save');
-- One row: count_projection_installed true, both execute permissions false.
SELECT position('received_reader_count' IN pg_get_functiondef(p.oid))>0 AS count_projection_installed,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='story_private' AND p.proname='project';
