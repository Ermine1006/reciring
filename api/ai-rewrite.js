// Vercel serverless function — POST /api/ai-rewrite
//
// "Make it Easier to Help" — rewrites a user's text so it's clearer and more
// likely to get a meaningful response. Built as a reusable, multi-kind service:
// the composer uses kind='post' today; chat intros, event follow-ups, referral
// requests, and profile bios can add their own `kind` here later without
// touching call sites.
//
// Request:  { kind?: string, text: string, context?: object }
// Response: { text: string }   (the improved text, ready to publish)
//
// Required env var: ANTHROPIC_API_KEY (set in the Vercel project settings).

import Anthropic from '@anthropic-ai/sdk'

// Shared writing rules — every kind inherits these. The philosophy (SMART) is
// applied internally and NEVER named in the output.
const SHARED_RULES = `You rewrite short pieces of text for Mutu, a peer-networking app for university students and alumni. Your job is to make the text clearer, warmer, and more likely to get a meaningful response — as if a thoughtful, articulate real person wrote it.

Rewrite so the result naturally becomes: more specific, more meaningful, more action-oriented, more realistic, and (only when it fits) more time-aware. Optimize for clarity, human authenticity, a higher chance of response, and an easy value exchange.

Voice: a real person. Professional, warm, direct, confident, concise.

NEVER use filler or corporate/AI phrasing such as: "I hope this message finds you well", "I am thrilled", "As an AI", "leverage", "passionate", "excited to announce". Don't make it sound like a press release or a cover letter.

Hard rules:
- Keep the user's original meaning and intent. Do not change what they are actually asking for.
- Do NOT invent facts, credentials, experience, company names, numbers, or details that aren't in the input or context.
- Do not exaggerate and do not pad the length. If key details are missing, write naturally around them rather than making things up.
- If the input is already clear and well-written, make only light improvements.

Output rules:
- Return ONLY the rewritten text, ready to publish as-is.
- No preamble, no explanation, no labels, no quotation marks around it, no options or alternatives. Do not include any internal or system XML tags.`

const KINDS = {
  // Need/Offer post composer — the request description a peer reads in Discover.
  post: {
    instructions: `You are rewriting the description of a request a student is posting. It should read as a genuine, specific ask that a peer can immediately see how to help with.

Keep it to 1-2 short sentences. Where natural, close with a light, low-pressure invitation to connect or make an introduction (e.g. "an intro would be a huge help").

Examples (original -> improved):
"Looking for a co-founder." -> "I'm looking for a technical co-founder to help build an AI networking platform for MBA communities. If you're interested or know someone who might be a good fit, I'd love to connect."
"Need internship." -> "I'm looking for a summer internship in venture capital or startup investing. If you know of an opportunity or someone I should speak with, I'd really appreciate an introduction."
"Need help with fundraising." -> "I'm looking for advice from founders or investors who have experience raising pre-seed funding. Even a short conversation or introduction would be incredibly helpful."`,
  },
}

// Guarantee the rewrite fits the editor's limit even if the model overshoots.
// Trims to the last complete sentence within `limit`; falls back to a clean
// word boundary so we never cut mid-word.
function clampToLimit(text, limit) {
  if (!limit || text.length <= limit) return text
  const slice = text.slice(0, limit)
  // Prefer ending on a complete sentence within the limit (drop an overflowing
  // trailing sentence rather than cut it mid-thought). A small floor avoids a
  // degenerate result if the first sentence is tiny.
  const lastSentence = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (lastSentence >= 40) return slice.slice(0, lastSentence + 1).trim()
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).replace(/[\s,;:]+$/, '').trim()
}

function buildContextLine(context = {}) {
  const parts = []
  if (context.title)    parts.push(`Post title: ${context.title}`)
  if (context.helpType?.length)  parts.push(`Help type: ${context.helpType.join(', ')}`)
  if (context.industry?.length)  parts.push(`Industry: ${context.industry.join(', ')}`)
  if (context.time)     parts.push(`Time commitment: ${context.time}`)
  if (context.offer)    parts.push(`What they offer in return: ${context.offer}`)
  if (parts.length === 0) return ''
  return `\n\nContext (use only to stay accurate — do not repeat it verbatim or invent beyond it):\n${parts.join('\n')}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method not allowed' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'AI rewrite is not configured (missing ANTHROPIC_API_KEY).' })
  }

  const body = req.body || {}
  const kind = KINDS[body.kind] ? body.kind : 'post'
  const text = String(body.text || '').trim().slice(0, 2000)
  if (!text) return res.status(400).json({ error: 'Nothing to rewrite.' })

  // Hard character ceiling from the caller (the composer passes its editor
  // limit). Aim a little under it in the prompt so we rarely have to clamp.
  const maxChars = Number.isFinite(body.maxChars)
    ? Math.min(Math.max(Math.floor(body.maxChars), 40), 1000)
    : null
  const lengthLine = maxChars
    ? `\n\nHARD LIMIT: your rewrite must be at most ${maxChars} characters — aim for about ${Math.round(maxChars * 0.9)}. Count characters, and cut detail to fit rather than going over.`
    : ''

  const system = `${SHARED_RULES}\n\n${KINDS[kind].instructions}`
  const userMessage = `Rewrite this so it's clearer and easier to help with:\n\n${text}${buildContextLine(body.context)}${lengthLine}`

  try {
    const client = new Anthropic() // reads ANTHROPIC_API_KEY from env
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 400,
      output_config: { effort: 'low' }, // simple, latency-sensitive rewrite
      system,
      messages: [{ role: 'user', content: userMessage }],
    })

    // Opus 5 can decline via safety classifiers — check before reading content.
    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Could not rewrite this text.' })
    }

    let improved = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/^["'“”]+|["'“”]+$/g, '') // strip stray wrapping quotes
      .trim()

    if (!improved) return res.status(502).json({ error: 'Empty rewrite.' })
    improved = clampToLimit(improved, maxChars) // never exceed the editor limit
    return res.status(200).json({ text: improved })
  } catch (err) {
    const status = err?.status
    const detail = err?.error?.error?.message || err?.message || 'unknown'
    console.error('[ai-rewrite] failed:', status, detail)

    // Map the most common first-time causes to a clear message. `detail` echoes
    // the raw Anthropic error so setup problems are diagnosable from the client.
    let msg = 'Rewrite failed. Please try again.'
    let code = 502
    if (status === 401) { msg = 'The Anthropic API key is invalid.'; code = 401 }
    else if (status === 403) { msg = 'This API key can\'t access the model.'; code = 403 }
    else if (status === 404) { msg = 'Model not found for this API key.'; code = 404 }
    else if (status === 429) { msg = 'Busy right now — try again in a moment.'; code = 429 }
    else if (/credit balance|billing|too low/i.test(detail)) {
      msg = 'The Anthropic account has no credit — add billing/credits in the Anthropic console.'
      code = 402
    }
    return res.status(code).json({ error: msg, detail })
  }
}
