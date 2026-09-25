import { CAREER_FOCUS } from './careerFocus'
import { INTERVIEW_CATEGORIES } from './practiceModes'

export const PRACTICE_DIRECTIONS = ['consulting', 'finance'].map(key => CAREER_FOCUS.find(item => item.key === key))
export const TYPES_BY_DIRECTION = {
  consulting: ['case', 'behavioural'],
  finance: ['finance', 'finance_debt', 'finance_markets', 'finance_behavioural'],
}
export const isFinanceType = type => TYPES_BY_DIRECTION.finance.includes(type)
export const directionForTypes = (types = []) => types.some(isFinanceType) ? 'finance' : 'consulting'
export const practiceTypeLabel = type => INTERVIEW_CATEGORIES[type]?.label || type

/**
 * The selections that belong to `direction`.
 *
 * Switching direction only ever changed which chips were DRAWN, so a
 * type picked under the other direction stayed selected while being
 * invisible and impossible to untick. It was then saved, and every
 * screen that reads the saved types (the preference skills above all)
 * showed that direction's content to someone who had switched away
 * from it. A selection nobody can see or remove is not a choice.
 */
export const typesInDirection = (types = [], direction) =>
  (types || []).filter(type => (TYPES_BY_DIRECTION[direction] || []).includes(type))
