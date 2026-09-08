-- Founder runs manually. Read only. No individual user data returned.
-- First result: one row; security_definer true, anon_execute false,
-- member_execute true, settings contains search_path=pg_catalog.
SELECT p.proname,p.prosecdef AS security_definer,p.proconfig AS settings,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='mutu_registration_count';
-- Expected current homepage total. Does not require a browser session.
SELECT count(*) AS mutu_registered_users
FROM auth.users WHERE is_anonymous IS NOT TRUE;
