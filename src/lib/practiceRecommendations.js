import { SKILLS_BY_CATEGORY } from '../data/practiceModes'
import { SUGGESTIONS } from '../data/practiceFeedback'

export const skillName = key => Object.values(SKILLS_BY_CATEGORY).flat().find(s => s.key === key)?.label || null

// Only the recipient's unreported, mutually verified feedback can suggest a focus.
// These suggestions remain private until the recipient explicitly saves a focus.
export function feedbackFocusSuggestions(feedback, sessions, userId) {
  const verified = new Set(sessions.filter(s => s.status === 'verified').map(s => s.id))
  const latest = [...feedback].filter(f => f.recipient_user_id === userId && !f.reported_at && verified.has(f.session_id))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 3)
  return [...new Set(latest.flatMap(f => Object.values(SUGGESTIONS).flat().find(s => s.code === f.suggestion_code)?.skills || []))]
}

export function responseRecord(record) {
  if (!record || !Number.isInteger(record.total) || !Number.isInteger(record.prompt) || record.total < 3 || record.prompt < 0 || record.prompt > record.total) return null
  return `${record.prompt} of ${record.total} invitations answered within 48 hours`
}
