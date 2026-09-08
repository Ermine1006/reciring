-- Founder runs manually in Supabase SQL Editor.
-- All current registered Auth accounts, including pending accounts and all
-- communities. Excludes anonymous guest sessions. Deleted accounts no longer
-- exist in auth.users. No profile, approval or viewer-block filter.
BEGIN;
CREATE OR REPLACE FUNCTION public.mutu_registration_count() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;
  RETURN (SELECT count(*) FROM auth.users WHERE is_anonymous IS NOT TRUE);
END $$;
REVOKE ALL ON FUNCTION public.mutu_registration_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutu_registration_count() TO authenticated;
COMMIT;
