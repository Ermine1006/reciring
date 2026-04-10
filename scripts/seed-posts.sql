-- Seed 12 realistic MBA-style posts into the posts table.
-- Run this in the Supabase SQL Editor (bypasses RLS).

INSERT INTO posts (created_by, need_text, offer_text, help_type, industry_tag, time_commitment, urgency, is_anonymous, created_at)
VALUES
  ('00000000-aaaa-4000-8000-000000000001',
   'Looking for a referral to McKinsey Toronto office. I have a first-round interview scheduled for next month and want to connect with someone on the inside.',
   'Happy to share my consulting case prep materials and do mock cases together.',
   ARRAY['Referral','Mock Interview'], ARRAY['Consulting'],
   '30 min', 'soon', true, now() - interval '0 hours'),

  ('00000000-aaaa-4000-8000-000000000002',
   'Need someone to review my IB resume before the January recruiting cycle. Targeting bulge bracket firms in NYC.',
   'Can help with financial modeling — built LBO and DCF models at my previous role in corporate finance.',
   ARRAY['Resume Review'], ARRAY['Investment Banking'],
   '30 min', NULL, true, now() - interval '6 hours'),

  ('00000000-aaaa-4000-8000-000000000003',
   'Seeking a coffee chat with anyone who interned in Product Management at a FAANG company. Want to understand the PM recruiting timeline.',
   'I worked 3 years in UX research — happy to review your portfolio or do mock PM interviews.',
   ARRAY['Coffee Chat','Advice'], ARRAY['Tech'],
   '15 min', NULL, true, now() - interval '12 hours'),

  ('00000000-aaaa-4000-8000-000000000004',
   'Forming a study group for the Strategy & Competition final exam. Looking for 3-4 serious classmates to meet twice a week.',
   'I scored top 10% on the midterm and have detailed notes from every lecture.',
   ARRAY['Study Group'], ARRAY[]::text[],
   '2+ hr', 'urgent', true, now() - interval '18 hours'),

  ('00000000-aaaa-4000-8000-000000000005',
   'Looking for an intro to anyone working in VC — specifically early-stage funds in the Toronto/Waterloo ecosystem.',
   'Previously co-founded a seed-stage startup. Can share fundraising decks and pitch feedback.',
   ARRAY['Intro','Coffee Chat'], ARRAY['VC'],
   '15 min', NULL, true, now() - interval '24 hours'),

  ('00000000-aaaa-4000-8000-000000000006',
   'Need a mock behavioral interview partner for upcoming BCG final round. Ideally someone who has done consulting recruiting before.',
   'Offering to share my detailed interview tracker spreadsheet with 50+ company contacts and timelines.',
   ARRAY['Mock Interview'], ARRAY['Consulting'],
   '1 hr', 'soon', true, now() - interval '30 hours'),

  ('00000000-aaaa-4000-8000-000000000007',
   'Trying to break into private equity from a non-finance background. Would love advice on how to position my ops experience.',
   'Can help with operations strategy frameworks and supply chain case studies.',
   ARRAY['Advice','Coffee Chat'], ARRAY['Private Equity','Operations'],
   '30 min', NULL, true, now() - interval '36 hours'),

  ('00000000-aaaa-4000-8000-000000000008',
   'Looking for someone to review my marketing internship cover letters. Applying to CPG brand management programs.',
   'Worked 4 years in digital marketing at an agency. Can review your go-to-market plans or campaign decks.',
   ARRAY['Resume Review','Advice'], ARRAY['Marketing'],
   '15 min', NULL, true, now() - interval '42 hours'),

  ('00000000-aaaa-4000-8000-000000000009',
   'Need a referral or intro to the Goldman Sachs TMT group. Have a networking event coming up and want to be prepared.',
   'I can walk you through valuation methodologies — spent 2 years at a boutique bank.',
   ARRAY['Referral','Intro'], ARRAY['Investment Banking'],
   '30 min', 'soon', true, now() - interval '48 hours'),

  ('00000000-aaaa-4000-8000-000000000010',
   'Starting a study group for the Data Analytics elective. Need people comfortable with Python and SQL.',
   'I have 5 years of data engineering experience and can help debug code or explain statistical concepts.',
   ARRAY['Study Group'], ARRAY['Tech'],
   '2+ hr', NULL, true, now() - interval '54 hours'),

  ('00000000-aaaa-4000-8000-000000000011',
   'Would love a coffee chat with someone who transitioned from engineering to consulting. How did you frame your story?',
   'Happy to share my technical interview prep resources and system design frameworks.',
   ARRAY['Coffee Chat','Advice'], ARRAY['Consulting','Tech'],
   '15 min', NULL, true, now() - interval '60 hours'),

  ('00000000-aaaa-4000-8000-000000000012',
   'Urgently need a mock case interview partner — Deloitte final round is this Friday. Preferably someone familiar with human capital cases.',
   'Can offer resume reviews for operations or HR roles — I was a senior HRBP before Rotman.',
   ARRAY['Mock Interview','Resume Review'], ARRAY['Consulting','Operations'],
   '1 hr', 'urgent', true, now() - interval '66 hours');
