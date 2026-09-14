-- Run AFTER migration-buddy-program.sql. This creates a CLOSED program.
-- Confirm the owner email below. No students are enrolled automatically.
DO $$
DECLARE
 owner_email text := 'erminelyu@gmail.com';
 community_slug text := 'rotman';
 program_name text := 'Rotman Buddy Program 2026';
 owner_id uuid; community uuid; program uuid;
BEGIN
 SELECT id INTO owner_id FROM auth.users WHERE lower(email)=lower(owner_email);
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Owner account not found. Update owner_email before running.'; END IF;
 SELECT id INTO community FROM public.communities WHERE slug=community_slug;
 IF community IS NULL THEN RAISE EXCEPTION 'Rotman community not found.'; END IF;
 SELECT id INTO program FROM public.buddy_programs WHERE community_id=community AND name=program_name ORDER BY created_at LIMIT 1;
 IF program IS NULL THEN
  INSERT INTO public.buddy_programs(community_id,name) VALUES(community,program_name) RETURNING id INTO program;
 END IF;
 INSERT INTO public.buddy_coordinators(program_id,user_id) VALUES(program,owner_id) ON CONFLICT DO NOTHING;
 RAISE NOTICE 'Closed Buddy Program ready: %',program;
END $$;
-- To give Freeda coordinator access, first verify her registered account email.
-- Then run the following after replacing the placeholder. Do not guess her email.
-- INSERT INTO public.buddy_coordinators(program_id,user_id)
-- SELECT p.id,u.id FROM public.buddy_programs p CROSS JOIN auth.users u
-- WHERE p.name='Rotman Buddy Program 2026' AND lower(u.email)=lower('FREEDA_VERIFIED_EMAIL')
-- ON CONFLICT DO NOTHING;
