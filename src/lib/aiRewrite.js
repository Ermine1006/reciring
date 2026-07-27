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
export async function rewriteText({ kind = 'post', text, context } = {}) {
  const source = String(text || '').trim()
  if (!source) return { text: null, error: new Error('Nothing to rewrite.') }

  try {
    const res = await fetch(apiUrl('/api/ai-rewrite'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, text: source, context }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { text: null, error: new Error(data.error || 'Rewrite failed.') }
    return { text: data.text || null, error: null }
  } catch (err) {
    return { text: null, error: err instanceof Error ? err : new Error('Network error.') }
  }
}
