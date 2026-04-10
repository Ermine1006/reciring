-- 6 realistic MBA posts — paste into Supabase SQL Editor and run.

INSERT INTO posts (created_by, need_text, offer_text, help_type, industry_tag, time_commitment, urgency, is_anonymous, created_at)
VALUES
  ('00000000-bbbb-4000-8000-000000000001',
   'Applying to MBB this cycle — would really appreciate a referral or quick advice on positioning.',
   'Can do casing practice with you or share my full prep framework',
   ARRAY['Referral','Mock Interview'], ARRAY['Consulting'],
   '45 min', 'urgent', true, now() - interval '1 hour'),

  ('00000000-bbbb-4000-8000-000000000002',
   'Exploring PM roles in Big Tech vs startups — would love honest insights from someone in either.',
   'Happy to help review resumes or do behavioral mock interviews',
   ARRAY['Advice'], ARRAY['Tech'],
   '20 min', NULL, true, now() - interval '5 hours'),

  ('00000000-bbbb-4000-8000-000000000003',
   'Currently building an MVP and thinking about first fundraising — any founders willing to share what *actually* worked?',
   'Can offer intros to 2 early-stage angels I''ve worked with',
   ARRAY['Advice','Intro'], ARRAY['VC'],
   '30 min', 'soon', true, now() - interval '10 hours'),

  ('00000000-bbbb-4000-8000-000000000004',
   'Honestly struggling with networking — how do you make it feel less transactional?',
   'Happy to be your practice buddy for coffee chats / intros',
   ARRAY['Advice'], ARRAY[]::text[],
   '15 min', NULL, true, now() - interval '16 hours'),

  ('00000000-bbbb-4000-8000-000000000005',
   'Recruiting for investment banking — would appreciate tips on technical interview prep.',
   'Can share my valuation cheat sheet + practice questions',
   ARRAY['Mock Interview','Advice'], ARRAY['Investment Banking'],
   '45 min', 'soon', true, now() - interval '22 hours'),

  ('00000000-bbbb-4000-8000-000000000006',
   'Pivoting from engineering to business roles — anyone made a similar transition?',
   'Can help with technical product discussions or mock PM interviews',
   ARRAY['Advice'], ARRAY['Tech'],
   '30 min', NULL, true, now() - interval '28 hours');
