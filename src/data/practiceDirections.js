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
