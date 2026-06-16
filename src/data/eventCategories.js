// Event category definitions — kept in one place so the create form,
// the card display, and any future filters all agree on the labels
// and emoji icons. `id` is what's stored in the DB; `label` is what
// the user sees; `emoji` is the icon shown on cards.

export const EVENT_CATEGORIES = [
  { id: 'Sports',       label: 'Sports',       emoji: '🏐' },
  { id: 'Career',       label: 'Career',       emoji: '💼' },
  { id: 'Networking',   label: 'Networking',   emoji: '🤝' },
  { id: 'Wellness',     label: 'Wellness',     emoji: '🧘' },
  { id: 'Social',       label: 'Social',       emoji: '🍷' },
  { id: 'Study Group',  label: 'Study Group',  emoji: '📚' },
  { id: 'Startup',      label: 'Startup',      emoji: '🚀' },
  { id: 'Other',        label: 'Other',        emoji: '✨' },
]

export function categoryEmoji(categoryId) {
  return EVENT_CATEGORIES.find(c => c.id === categoryId)?.emoji || '✨'
}
