export const BADGE_LEVELS = [
  { min: 0,   id: 'new',       label: 'New Member',        color: '#9CA3AF' },
  { min: 50,  id: 'helper',    label: 'Helper',            color: '#6B9AB8' },
  { min: 100, id: 'connector', label: 'Connector',         color: '#C8A96A' },
  { min: 250, id: 'builder',   label: 'Community Builder', color: '#22AA88' },
  { min: 500, id: 'super',     label: 'Super Connector',   color: '#A88245' },
]

export function getBadge(points) {
  for (let i = BADGE_LEVELS.length - 1; i >= 0; i--) {
    if (points >= BADGE_LEVELS[i].min) return BADGE_LEVELS[i]
  }
  return BADGE_LEVELS[0]
}

export function getNextBadge(points) {
  for (let i = 0; i < BADGE_LEVELS.length; i++) {
    if (points < BADGE_LEVELS[i].min) return BADGE_LEVELS[i]
  }
  return null
}

export function getReliability(scheduled, completed) {
  if (!scheduled || scheduled === 0) return null
  const rate = Math.round((completed / scheduled) * 100)
  if (rate > 90) return { label: 'Highly reliable', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', rate }
  if (rate > 80) return { label: 'Reliable',        color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', rate }
  if (rate < 60) return { label: 'Inconsistent',    color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', rate }
  return { label: null, rate }
}

export const MOCK_ME = {
  points: 120,
  scheduled: 8,
  completed: 7,
  history: [
    { label: 'Referral to McKinsey Toronto',          points: 12, date: '2 days ago'   },
    { label: 'Introduction made to consulting peer',  points: 10, date: '4 days ago'   },
    { label: 'Coffee chat with MBA peer',             points:  5, date: '1 week ago'   },
    { label: 'Resume review for finance student',     points:  4, date: '2 weeks ago'  },
    { label: 'Introduction made to PE contact',       points: 10, date: '3 weeks ago'  },
    { label: 'Coffee chat with product manager',      points:  5, date: '1 month ago'  },
    { label: 'Resume review for consulting recruit',  points:  4, date: '1 month ago'  },
    { label: 'Referral to Bain',                      points: 12, date: '5 weeks ago'  },
    { label: 'Introduction made to ESG researcher',   points: 10, date: '6 weeks ago'  },
    { label: 'Coffee chat with tech founder',         points:  5, date: '2 months ago' },
    { label: 'Resume review for IB candidate',        points:  4, date: '2 months ago' },
  ],
}

export const MOCK_LEADERBOARD = [
  { rank: 1,  name: 'Sarah K.',   points: 487, badge: 'Super Connector',   seed: 'sarah-k-1',   isMe: false, scheduled: 18, completed: 17 },
  { rank: 2,  name: 'Marcus T.',  points: 344, badge: 'Community Builder', seed: 'marcus-t-2',  isMe: false, scheduled: 14, completed: 13 },
  { rank: 3,  name: 'Priya M.',   points: 298, badge: 'Community Builder', seed: 'priya-m-3',   isMe: false, scheduled: 11, completed: 10 },
  { rank: 4,  name: 'Jordan L.',  points: 241, badge: 'Community Builder', seed: 'jordan-l-4',  isMe: false, scheduled: 9,  completed: 7  },
  { rank: 5,  name: 'Alex C.',    points: 188, badge: 'Connector',         seed: 'alex-c-5',    isMe: false, scheduled: 7,  completed: 6  },
  { rank: 6,  name: 'Dana W.',    points: 154, badge: 'Connector',         seed: 'dana-w-6',    isMe: false, scheduled: 6,  completed: 5  },
  { rank: 7,  name: 'You',        points: 120, badge: 'Connector',         seed: 'me',          isMe: true,  scheduled: 8,  completed: 7  },
  { rank: 8,  name: 'Kai R.',     points: 98,  badge: 'Helper',            seed: 'kai-r-8',     isMe: false, scheduled: 4,  completed: 4  },
  { rank: 9,  name: 'Yuna P.',    points: 76,  badge: 'Helper',            seed: 'yuna-p-9',    isMe: false, scheduled: 3,  completed: 2  },
  { rank: 10, name: 'Chris B.',   points: 61,  badge: 'Helper',            seed: 'chris-b-10',  isMe: false, scheduled: 2,  completed: 2  },
]
