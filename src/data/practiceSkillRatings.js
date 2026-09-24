import { SKILLS_BY_CATEGORY } from './practiceModes'

export const LEADERSHIP_SKILL = { key: 'leadership', label: 'Leadership' }
export const RATING_ANCHORS = [
  'Needed frequent guidance', 'Needed some guidance', 'Worked independently',
  'Clear and well supported', 'Adapted confidently to challenges',
]
export function feedbackSkills(category, leadershipEnabled = true) {
  const skills = SKILLS_BY_CATEGORY[category] || []
  return leadershipEnabled ? skills : skills.filter(skill => skill.key !== 'leadership')
}
export function validSkillRatings(ratings, category) {
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) return false
  const entries = Object.entries(ratings)
  return entries.length <= 3 && entries.every(([skill, score]) =>
    feedbackSkills(category).some(s => s.key === skill) && Number.isInteger(score) && score >= 1 && score <= 5)
}
