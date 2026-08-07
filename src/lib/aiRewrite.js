import { apiUrl } from './apiBase'

// "Make it Easier to Help" — reusable AI rewrite client.
//
// One call site today (the Need/Offer composer, kind='post'). The `kind`
// parameter keeps it reusable: chat intros, event follow-ups, networking and
// referral requests, and profile bios can each add a matching `kind` in
// api/ai-rewrite.js and call this same function.
//
// Returns { text, error }. On any failure, `text` is null and the caller keeps
// the user's original text untouched.
export async function rewriteText({ kind = 'post', text, context, maxChars } = {}) {
  const source = String(text || '').trim()
  if (!source) return { text: null, error: new Error('Nothing to rewrite.') }

  try {
    const res = await fetch(apiUrl('/api/ai-rewrite'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, text: source, context, maxChars }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { text: null, error: new Error(data.error || 'Rewrite failed.') }
    return { text: data.text || null, error: null }
  } catch (err) {
    return { text: null, error: err instanceof Error ? err : new Error('Network error.') }
  }
}

// "Help me fill" — infer profile matching tags from a one-line note plus any
// existing profile info (program / headline / industries). The server returns
// only values from the app's known option lists. Returns { tags, error } where
// tags = { canHelpWith, skillsToLearn, industries } (arrays, possibly empty).
export async function suggestProfileTags({ text, context } = {}) {
  try {
    const res = await fetch(apiUrl('/api/ai-rewrite'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'profile_tags', text: String(text || ''), context: context || {} }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { tags: null, error: new Error(data.error || 'Suggestions failed.') }
    const t = data.tags || {}
    return {
      tags: {
        canHelpWith:  Array.isArray(t.canHelpWith)  ? t.canHelpWith  : [],
        skillsToLearn: Array.isArray(t.skillsToLearn) ? t.skillsToLearn : [],
        industries:   Array.isArray(t.industries)   ? t.industries   : [],
      },
      error: null,
    }
  } catch (err) {
    return { tags: null, error: err instanceof Error ? err : new Error('Network error.') }
  }
}
