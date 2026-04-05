// Mock reciprocal requests — structured for scannable swipe cards
//
// Data model:
//   needs    — what the poster is asking for (headline)
//   offers   — what they give in return (revealed prominently on card)
//   category — broad bucket (Networking, Advice, etc.)
//   tags     — specific, filterable skill/context tags
//   time     — estimated time commitment for the helper
//   urgency  — null | 'soon' | 'urgent'  (drives visual indicator)
//   createdAt— relative timestamp

export const MOCK_REQUESTS = [
  {
    id: 'req-1',
    needs:     'A connection at Bain & Company — ideally someone who can pass my resume or set up a coffee chat before recruiting season.',
    offers:    'Happy to buy you a drink at Madison Pub 🍻 and chat about consulting recruiting.',
    category:  'Networking',
    tags:      ['Consulting', 'Coffee Chat', 'Intro'],
    time:      '15 min',
    urgency:   'soon',
    createdAt: '2h ago',
    poster:    { points: 210, scheduled: 9, completed: 8, industries: ['Consulting'] },
  },
  {
    id: 'req-2',
    needs:     'A study partner for the finance midterm — especially someone strong in derivatives pricing and fixed income.',
    offers:    'I can cover financial modelling, DCF, and accounting deeply. Also happy to share my LBO template.',
    category:  'Collaboration',
    tags:      ['Finance', 'Study Group'],
    time:      '1 hr',
    urgency:   null,
    createdAt: '5h ago',
    poster:    { points: 45, scheduled: 2, completed: 2, industries: ['Investment Banking', 'Private Equity'] },
  },
  {
    id: 'req-3',
    needs:     'Advice from someone who\'s done a PE fund internship — how did you prepare for the interviews and what was the culture like?',
    offers:    'I interned at McKinsey and can share case prep frameworks, materials, and do mock interviews with you.',
    category:  'Advice',
    tags:      ['Private Equity', 'Mock Interview', 'Career Advice'],
    time:      '30 min',
    urgency:   'urgent',
    createdAt: '1d ago',
    poster:    { points: 340, scheduled: 12, completed: 11, industries: ['Consulting', 'Private Equity'] },
  },
  {
    id: 'req-4',
    needs:     'An intro to someone active in Rotman\'s sustainability club — working on a capstone project in ESG.',
    offers:    'I have connections across several CPG and retail companies and can make warm intros for strategy roles.',
    category:  'Networking',
    tags:      ['ESG', 'Intro', 'Capstone'],
    time:      '15 min',
    urgency:   null,
    createdAt: '1d ago',
    poster:    { points: 88, scheduled: 5, completed: 3, industries: ['Marketing', 'Operations'] },
  },
  {
    id: 'req-5',
    needs:     'A 15-min chat with someone who transitioned from engineering into product management — what actually made it work?',
    offers:    'I can review your PM résumé or case study, and share insider knowledge on how tech companies recruit at Rotman.',
    category:  'Advice',
    tags:      ['Product Management', 'Resume Review', 'Coffee Chat'],
    time:      '15 min',
    urgency:   'soon',
    createdAt: '2d ago',
    poster:    { points: 154, scheduled: 6, completed: 5, industries: ['Tech'] },
  },
]

export const CATEGORIES = ['Networking', 'Advice', 'Collaboration', 'Events', 'Other']
