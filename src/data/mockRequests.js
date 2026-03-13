// Mock reciprocal requests for demo — each card has what the person NEEDS and what they OFFER
export const MOCK_REQUESTS = [
  {
    id: 'req-1',
    needs:  "A connection at Bain & Company — ideally someone who can pass my resume or set up a coffee chat before recruiting season.",
    offers: "Happy to buy you a drink at Madison Pub 🍻 and chat about consulting recruiting.",
    category:  'Networking',
    createdAt: '2h ago',
  },
  {
    id: 'req-2',
    needs:  "A study partner for the finance midterm — especially someone strong in derivatives pricing and fixed income.",
    offers: "I can cover financial modelling, DCF, and accounting deeply. Also happy to share my LBO template.",
    category:  'Collaboration',
    createdAt: '5h ago',
  },
  {
    id: 'req-3',
    needs:  "Advice from someone who's done a PE fund internship — how did you prepare for the interviews and what was the culture like?",
    offers: "I interned at McKinsey and can share case prep frameworks, materials, and do mock interviews with you.",
    category:  'Advice',
    createdAt: '1d ago',
  },
  {
    id: 'req-4',
    needs:  "An intro to someone active in Rotman's sustainability club — working on a capstone project in ESG.",
    offers: "I have connections across several CPG and retail companies and can make warm intros for strategy roles.",
    category:  'Networking',
    createdAt: '1d ago',
  },
  {
    id: 'req-5',
    needs:  "A 15-min chat with someone who transitioned from engineering into product management — what actually made it work?",
    offers: "I can review your PM résumé or case study, and share insider knowledge on how tech companies recruit at Rotman.",
    category:  'Advice',
    createdAt: '2d ago',
  },
]

export const CATEGORIES = ['Networking', 'Advice', 'Collaboration', 'Events', 'Other']
