/**
 * Seed 12 realistic MBA-style posts into Supabase.
 *
 * Usage:  node scripts/seed-posts.js
 *
 * Each post uses a random fake user UUID so they appear as different people.
 * Adjust the SUPABASE_URL / SUPABASE_ANON_KEY below or set env vars.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL  || 'https://xdiwmainkvbopjpatieg.supabase.co'
const SUPABASE_KEY  = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PTuOLC9FaC0ycWnAKwHlDQ_UKWf6Lkg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Deterministic fake UUIDs so re-running is idempotent-ish
const fakeUsers = [
  '00000000-aaaa-4000-8000-000000000001',
  '00000000-aaaa-4000-8000-000000000002',
  '00000000-aaaa-4000-8000-000000000003',
  '00000000-aaaa-4000-8000-000000000004',
  '00000000-aaaa-4000-8000-000000000005',
  '00000000-aaaa-4000-8000-000000000006',
  '00000000-aaaa-4000-8000-000000000007',
  '00000000-aaaa-4000-8000-000000000008',
  '00000000-aaaa-4000-8000-000000000009',
  '00000000-aaaa-4000-8000-000000000010',
  '00000000-aaaa-4000-8000-000000000011',
  '00000000-aaaa-4000-8000-000000000012',
]

const posts = [
  {
    created_by: fakeUsers[0],
    need_text: 'Looking for a referral to McKinsey Toronto office. I have a first-round interview scheduled for next month and want to connect with someone on the inside.',
    offer_text: 'Happy to share my consulting case prep materials and do mock cases together.',
    help_type: ['Referral', 'Mock Interview'],
    industry_tag: ['Consulting'],
    time_commitment: '30 min',
    urgency: 'soon',
  },
  {
    created_by: fakeUsers[1],
    need_text: 'Need someone to review my IB resume before the January recruiting cycle. Targeting bulge bracket firms in NYC.',
    offer_text: 'Can help with financial modeling — built LBO and DCF models at my previous role in corporate finance.',
    help_type: ['Resume Review'],
    industry_tag: ['Investment Banking'],
    time_commitment: '30 min',
    urgency: null,
  },
  {
    created_by: fakeUsers[2],
    need_text: 'Seeking a coffee chat with anyone who interned in Product Management at a FAANG company. Want to understand the PM recruiting timeline.',
    offer_text: 'I worked 3 years in UX research — happy to review your portfolio or do mock PM interviews.',
    help_type: ['Coffee Chat', 'Advice'],
    industry_tag: ['Tech'],
    time_commitment: '15 min',
    urgency: null,
  },
  {
    created_by: fakeUsers[3],
    need_text: 'Forming a study group for the Strategy & Competition final exam. Looking for 3-4 serious classmates to meet twice a week.',
    offer_text: 'I scored top 10% on the midterm and have detailed notes from every lecture.',
    help_type: ['Study Group'],
    industry_tag: [],
    time_commitment: '2+ hr',
    urgency: 'urgent',
  },
  {
    created_by: fakeUsers[4],
    need_text: 'Looking for an intro to anyone working in VC — specifically early-stage funds in the Toronto/Waterloo ecosystem.',
    offer_text: 'Previously co-founded a seed-stage startup. Can share fundraising decks and pitch feedback.',
    help_type: ['Intro', 'Coffee Chat'],
    industry_tag: ['VC'],
    time_commitment: '15 min',
    urgency: null,
  },
  {
    created_by: fakeUsers[5],
    need_text: 'Need a mock behavioral interview partner for upcoming BCG final round. Ideally someone who has done consulting recruiting before.',
    offer_text: 'Offering to share my detailed interview tracker spreadsheet with 50+ company contacts and timelines.',
    help_type: ['Mock Interview'],
    industry_tag: ['Consulting'],
    time_commitment: '1 hr',
    urgency: 'soon',
  },
  {
    created_by: fakeUsers[6],
    need_text: 'Trying to break into private equity from a non-finance background. Would love advice on how to position my ops experience.',
    offer_text: 'Can help with operations strategy frameworks and supply chain case studies.',
    help_type: ['Advice', 'Coffee Chat'],
    industry_tag: ['Private Equity', 'Operations'],
    time_commitment: '30 min',
    urgency: null,
  },
  {
    created_by: fakeUsers[7],
    need_text: 'Looking for someone to review my marketing internship cover letters. Applying to CPG brand management programs.',
    offer_text: 'Worked 4 years in digital marketing at an agency. Can review your go-to-market plans or campaign decks.',
    help_type: ['Resume Review', 'Advice'],
    industry_tag: ['Marketing'],
    time_commitment: '15 min',
    urgency: null,
  },
  {
    created_by: fakeUsers[8],
    need_text: 'Need a referral or intro to the Goldman Sachs TMT group. Have a networking event coming up and want to be prepared.',
    offer_text: 'I can walk you through valuation methodologies — spent 2 years at a boutique bank.',
    help_type: ['Referral', 'Intro'],
    industry_tag: ['Investment Banking'],
    time_commitment: '30 min',
    urgency: 'soon',
  },
  {
    created_by: fakeUsers[9],
    need_text: 'Starting a study group for the Data Analytics elective. Need people comfortable with Python and SQL.',
    offer_text: 'I have 5 years of data engineering experience and can help debug code or explain statistical concepts.',
    help_type: ['Study Group'],
    industry_tag: ['Tech'],
    time_commitment: '2+ hr',
    urgency: null,
  },
  {
    created_by: fakeUsers[10],
    need_text: 'Would love a coffee chat with someone who transitioned from engineering to consulting. How did you frame your story?',
    offer_text: 'Happy to share my technical interview prep resources and system design frameworks.',
    help_type: ['Coffee Chat', 'Advice'],
    industry_tag: ['Consulting', 'Tech'],
    time_commitment: '15 min',
    urgency: null,
  },
  {
    created_by: fakeUsers[11],
    need_text: 'Urgently need a mock case interview partner — Deloitte final round is this Friday. Preferably someone familiar with human capital cases.',
    offer_text: 'Can offer resume reviews for operations or HR roles — I was a senior HRBP before Rotman.',
    help_type: ['Mock Interview', 'Resume Review'],
    industry_tag: ['Consulting', 'Operations'],
    time_commitment: '1 hr',
    urgency: 'urgent',
  },
]

// Stagger created_at so posts are spread over the last 3 days
const now = Date.now()
const rows = posts.map((p, i) => ({
  ...p,
  is_anonymous: true,
  created_at: new Date(now - i * 6 * 3600 * 1000).toISOString(), // ~6 hours apart
}))

async function seed() {
  console.log('Inserting 12 seed posts…')
  const { data, error } = await supabase
    .from('posts')
    .insert(rows)
    .select('id, need_text')

  if (error) {
    console.error('Insert failed:', error.message)
    process.exit(1)
  }

  console.log(`Done — inserted ${data.length} posts:`)
  data.forEach(r => console.log(`  ${r.id}  ${r.need_text.slice(0, 60)}…`))
}

seed()
