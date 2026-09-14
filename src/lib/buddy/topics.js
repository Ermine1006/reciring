import { CAREER_FOCUS } from '../../data/careerFocus.js'

// Support topics, plus the existing canonical Career Focus taxonomy.
export const BUDDY_TOPICS = [
  ...CAREER_FOCUS,
  { key: 'recruiting', label: 'Recruiting' },
  { key: 'career_transition', label: 'Career transition' },
  { key: 'toronto_life', label: 'Life in Toronto' },
  { key: 'rotman_settling', label: 'Settling into Rotman' },
  { key: 'course_choices', label: 'Course choices' },
  { key: 'clubs_community', label: 'Clubs & community' },
  { key: 'ai_tools', label: 'AI tools' },
  { key: 'coding', label: 'Coding' },
]
export const topicLabel = (key) => BUDDY_TOPICS.find(t => t.key === key)?.label || key
export const cleanTopics = (values) => [...new Set((Array.isArray(values) ? values : []).filter(v => BUDDY_TOPICS.some(t => t.key === v)))].slice(0, 8)
