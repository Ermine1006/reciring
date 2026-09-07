// Story themes are editorial places, not Career Focus categories.
export const STORY_TOPICS = [
  { id: 'work', label: 'At work' },
  { id: 'mba', label: 'MBA moments' },
  { id: 'people', label: 'Between people' },
  { id: 'becoming', label: 'Still becoming' },
]
export const STORY_TOPIC_LABELS = Object.fromEntries(STORY_TOPICS.map(t => [t.id, t.label]))
export const STORY_LIMITS = { title: 120, body: 20000, reply: 2000, report: 2000 }
export const STORY_PLEDGE = 'I wrote this myself, without AI writing or rewriting.'
export const STORY_PROMPTS = [
  'Something I learned the messy way…',
  'A small moment I want to remember…',
  'Something I am still figuring out…',
]
export const STORY_REACTIONS = [
  { id: 'warmth', label: 'This stayed with me' },
  { id: 'relate', label: 'I’ve felt this too' },
]
export const STORY_REPORT_REASONS = [
  { id: 'privacy', label: 'Someone’s privacy' },
  { id: 'unkind', label: 'Unkind or harmful content' },
  { id: 'ai_concern', label: 'Concern about the own words agreement' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Something else' },
]

export function newStoryId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Older supported WebViews have Web Crypto, but not randomUUID yet.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function newStoryDraft() {
  return {
    id: newStoryId(), title: '', body: '', topic: 'becoming',
    identity_mode: 'anonymous', response_mode: 'sharing', version: 0, status: 'draft',
  }
}

export const newStoryReply = () => ({ id: newStoryId(), body: '', identity_mode: 'anonymous', version: 0 })
export const storyReplySnapshot = reply => reply.body ? JSON.stringify([reply.body, reply.identity_mode]) : ''

export function storyErrorMessage(error) {
  const message = String(error?.message || '')
  const code = error?.code
  if (message.includes('STORY_CONFLICT')) return 'This page changed somewhere else. Your words are still here. Copy them before opening the latest version.'
  if (message.includes('STORY_PLEDGE')) return 'Please add your own words and confirm the writing agreement before sharing.'
  if (message.includes('STORY_REPLIES_CLOSED')) return 'The author has closed written replies. Your words are still here.'
  if (message.includes('STORY_RATE_LIMIT')) return 'Please take a little time before trying again. Your words are still here.'
  if (message.includes('STORY_REMOVED')) return 'This page was removed by the community team. It cannot be shared again.'
  if (message.includes('STORY_SHARED_EDIT')) return 'Preview your changes to update your shared page, or take it back to a private draft first.'
  if (message.includes('STORY_UNAVAILABLE')) return 'This page is no longer available.'
  if (message.includes('STORY_ACCESS') || code === '42501') return 'Your community access needs to be checked again.'
  if (message.includes('STORY_INPUT')) return 'Please check your page and try again.'
  if (code === 'PGRST202' || code === '42883') return 'The Story Garden is not ready yet. Please check back soon.'
  return 'We couldn’t complete that step. Your words are still here. Please try again.'
}

export function validateStory(draft, { publish = false, pledge = false } = {}) {
  if (!draft || !STORY_TOPICS.some(t => t.id === draft.topic)
      || !['anonymous', 'named'].includes(draft.identity_mode)
      || !['sharing', 'conversation'].includes(draft.response_mode)) return 'Please check your page settings.'
  if (typeof draft.title !== 'string' || typeof draft.body !== 'string') return 'Please add your own words.'
  if (draft.title.length > STORY_LIMITS.title || draft.body.length > STORY_LIMITS.body) return 'Your page is a little too long. Please shorten it before saving.'
  if (publish && (!draft.body.trim() || !pledge)) return 'Please add your own words and confirm the writing agreement before sharing.'
  return null
}

// Explicit authored fields only; server-supplied ids/names never become profile
// joins or matching signals. Compare unchanged text without normalizing it.
export function storyDraftSnapshot(draft) {
  return JSON.stringify([draft.id, draft.title, draft.body, draft.topic, draft.identity_mode, draft.response_mode])
}
