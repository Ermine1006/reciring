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
// Required env var: OPENROUTER_API_KEY (set in the Vercel project settings).
//
// Backend: OpenRouter (OpenAI-compatible chat/completions). To switch the model
// or provider, change MODEL below — nothing else. kimi-k2 is fast and cheap,
// which fits these latency-sensitive short tasks within Vercel's function
// timeout; kimi-k3 (reasoning) is higher quality but too slow here.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'moonshotai/kimi-k2'

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

  // What a student offers IN RETURN on a Discover request — the reciprocal
  // exchange. A clear, appealing offer makes their ask easier to say yes to.
  post_offer: {
    instructions: `You are rewriting what a student can OFFER in return on a request they're posting. A clear, concrete offer makes the whole request easier to say yes to.

Keep it to 1-2 short sentences. Name the specific help, time, introduction, or knowledge they'll give back — genuine and appealing, without overselling. Do not invent expertise, connections, or credentials that aren't in the input or context.

Examples (original -> improved):
"can grab coffee" -> "Happy to grab coffee and share what I've learned, and to return the favor however I can down the line."
"help with resume" -> "In return, I'm glad to review your resume or give feedback on recruiting materials whenever it's useful."`,
  },

  // What a student says they NEED at a specific event — drives the in-event
  // matcher that pairs attendees, so a clear ask means better matches.
  event_need: {
    instructions: `You are rewriting what a student says they NEED at a specific networking event. This is what the event's matcher uses to pair them with the right people to meet, so another attendee should instantly see whether they — or someone they know — can help.

Keep it to 1-2 short sentences. Make the ask specific and genuine: name the kind of person, introduction, feedback, or help that would actually move them forward. Do not invent specifics that aren't in the input or context.

Examples (original -> improved):
"meet investors" -> "Hoping to meet early-stage investors — or anyone who can introduce me to one — for a consumer AI product I'm building."
"want a job" -> "Looking for leads or referrals for a product role in fintech. If you know a team that's hiring, I'd love an intro."`,
  },

  // What a student says they can OFFER at an event — helps the matcher pair
  // them with people whose needs they can meet, and makes their value clear.
  event_offer: {
    instructions: `You are rewriting what a student says they can OFFER at a specific networking event. This helps the event's matcher pair them with people whose needs they can meet, and makes their value clear to others.

Keep it to 1-2 short sentences. Make the offer concrete and appealing without overselling: name the specific help, introduction, knowledge, or resource they can give. Do not invent expertise, connections, or credentials that aren't in the input or context.

Examples (original -> improved):
"can help with coding" -> "Happy to talk through technical questions — I build ML systems and can help with architecture, hiring, or getting an MVP shipped."
"share my network" -> "Glad to make intros in the fintech space, and to share what actually worked (and didn't) when we raised our seed round."`,
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
  if (context.title)    parts.push(`Event / post title: ${context.title}`)
  if (context.helpType?.length)  parts.push(`Help type: ${context.helpType.join(', ')}`)
  if (context.industry?.length)  parts.push(`Industry: ${context.industry.join(', ')}`)
  if (context.time)     parts.push(`Time commitment: ${context.time}`)
  if (context.need)     parts.push(`What they need: ${context.need}`)
  if (context.offer)    parts.push(`What they offer: ${context.offer}`)
  if (parts.length === 0) return ''
  return `\n\nContext (use only to stay accurate — do not repeat it verbatim or invent beyond it):\n${parts.join('\n')}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'method not allowed' })

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'AI rewrite is not configured (missing OPENROUTER_API_KEY).' })
  }

  const body = req.body || {}

  // "Tell Mutu what happened" — structured capture extraction (Phase 4).
  // Same backend/key; returns { capture: {...} } instead of { text }.
  if (body.mode === 'capture') {
    return handleCapture(body, res)
  }

  // "Ask Mutu" — networking assistant grounded ONLY on the user's own data,
  // which the client passes in body.context (Phase 5). Returns { answer }.
  if (body.mode === 'assistant') {
    return handleAssistant(body, res)
  }

  // "Help me fill" — infer profile matching tags from a one-liner + existing
  // profile info. Returns { tags: { canHelpWith, skillsToLearn, industries } },
  // each constrained to the app's known option lists.
  if (body.mode === 'profile_tags') {
    return handleProfileTags(body, res)
  }

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
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // Optional OpenRouter attribution (shows up in your OpenRouter dashboard).
        'HTTP-Referer':  'https://muturing.com',
        'X-Title':       'Mutu',
      },
      body: JSON.stringify({
        model: MODEL,
        // Generous ceiling: kimi-k3 is a reasoning model, so leave room for
        // its thinking budget on top of the short final rewrite.
        max_tokens: 1500,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: userMessage },
        ],
      }),
    })

    const data = await resp.json().catch(() => ({}))

    if (!resp.ok) {
      const status = resp.status
      const detail = data?.error?.message || data?.error || `HTTP ${status}`
      console.error('[ai-rewrite] failed:', status, detail)

      // Map the common first-time causes to a clear message. `detail` echoes
      // the raw OpenRouter error so setup problems are diagnosable client-side.
      let msg = 'Rewrite failed. Please try again.'
      let code = 502
      if (status === 401)      { msg = 'The OpenRouter API key is invalid.'; code = 401 }
      else if (status === 403) { msg = "This API key can't access the model."; code = 403 }
      else if (status === 404) { msg = 'Model not found — check the model slug.'; code = 404 }
      else if (status === 429) { msg = 'Busy right now — try again in a moment.'; code = 429 }
      else if (status === 402 || /credit|insufficient|billing|balance/i.test(String(detail))) {
        msg = 'The OpenRouter account is out of credits — top up at openrouter.ai.'
        code = 402
      }
      return res.status(code).json({ error: msg, detail: String(detail) })
    }

    const choice = data?.choices?.[0]
    // Some models signal a safety block via finish_reason.
    if (choice?.finish_reason === 'content_filter') {
      return res.status(422).json({ error: 'Could not rewrite this text.' })
    }

    let improved = String(choice?.message?.content || '')
      .trim()
      .replace(/^["'“”]+|["'“”]+$/g, '') // strip stray wrapping quotes
      .trim()

    if (!improved) return res.status(502).json({ error: 'Empty rewrite.' })
    improved = clampToLimit(improved, maxChars) // never exceed the editor limit
    return res.status(200).json({ text: improved })
  } catch (err) {
    const detail = err?.message || 'unknown'
    console.error('[ai-rewrite] network error:', detail)
    return res.status(502).json({ error: 'Rewrite failed. Please try again.', detail })
  }
}

// ── "Tell Mutu what happened" — structured capture extraction ──────────
// Turns a free-text note about someone met at an event into a structured draft
// the user confirms before saving. Never invents facts; unknown fields = ''.
async function handleCapture(body, res) {
  const text = String(body.text || '').trim().slice(0, 2000)
  if (!text) return res.status(400).json({ error: 'Nothing to capture.' })
  const eventTitle = String(body.context?.eventTitle || '').slice(0, 160)

  const system = `You extract structured networking follow-up details from a short note a user wrote about someone they met at an event.

Return ONLY a compact JSON object — no prose, no markdown, no code fences — with exactly these string keys:
- "person": the other person's name, or "" if not stated
- "context": where/how they met in a short phrase (e.g. "Met at ${eventTitle || 'the event'}")
- "need": what that person is looking for, or ""
- "commitment": what the USER promised to do for them, or ""
- "next_action": the user's concrete next step, or ""
- "due": a short suggested deadline like "Tomorrow", "This week", "Next Monday", or "" if none implied

Rules: Use ONLY facts present in the note. Do not invent names, companies, needs, or commitments. If a field is unknown, use an empty string. Output must be valid JSON parseable as-is.`

  const user = `Note:\n${text}${eventTitle ? `\n\n(Event: ${eventTitle})` : ''}`

  let resp
  try {
    resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':  'https://muturing.com',
        'X-Title':       'Mutu',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
      }),
    })
  } catch (err) {
    return res.status(502).json({ error: 'Capture failed. Please try again.', detail: err?.message })
  }

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const detail = data?.error?.message || data?.error || `HTTP ${resp.status}`
    console.error('[ai-rewrite:capture] failed:', resp.status, detail)
    return res.status(resp.status === 402 ? 402 : 502).json({ error: 'Capture failed. Please try again.', detail: String(detail) })
  }

  const raw = String(data?.choices?.[0]?.message?.content || '')
  const capture = parseCaptureJSON(raw)
  if (!capture) return res.status(502).json({ error: 'Could not structure that note — try rephrasing.' })
  return res.status(200).json({ capture })
}

// ── "Ask Mutu" — networking assistant over the user's own data ─────────
// The client sends the question plus a compact JSON of the user's OWN
// encounters / follow-ups / events (all RLS-scoped on the client). The model
// answers only from that; it never has access to anyone else's data.
async function handleAssistant(body, res) {
  const question = String(body.text || '').trim().slice(0, 500)
  if (!question) return res.status(400).json({ error: 'Ask a question.' })
  // Cap the grounding payload so we stay within a sane token budget.
  const context = JSON.stringify(body.context || {}).slice(0, 12000)

  const system = `You are Mutu's networking assistant. You help a user remember and act on the people they met at events.

You can ONLY use the JSON data provided in the user's message — it is that user's own private networking record (people they met, commitments, follow-ups, events). Never invent people, companies, needs, or commitments that aren't in the data. Never reveal information about anyone the user has no record of — you only know what's in this JSON.

The JSON has TWO separate groups of people — never merge them:
- "people" = people the user has actually MET in person or logged a real conversation with. Only these have topics, notes, commitments, and next actions.
- "connections" = people the user KNOWS from Community (matched, identity revealed, or chatted) but has NOT met in person yet. Each has a "relationship" label. Never say the user "met" a connection — say they matched, are connected, or have chatted. You may suggest meeting or following up with a connection when relevant.

If the answer isn't in the data, say so plainly. In particular, if the user asks what they discussed with someone and that person has no "topics" or "note" recorded, reply exactly: "I don't have a record of what you discussed. Would you like to add a note?"

Each person has THREE independent states — never collapse them into a single "followed up":
- "message_state": how the user's follow-up MESSAGE stands. "sent" = they already sent a message (see "message_sent_on"); "drafted" = they wrote a draft but have NOT sent it yet; "none" = no message written. A drafted message is NOT a sent message — never say someone was messaged or contacted unless message_state is "sent".
- "action_state": a concrete NEXT ACTION / task (in "next_action"). "pending" = still open (this is what "open next actions" means); "completed" = done; "dismissed" = dropped; "none" = no action set.
- Meeting someone (they appear in the data) is separate from both — being met does not imply any message or action.

Use these precisely: "met but not messaged", "draft waiting to send", "message sent, action still open", etc.

Do the task the user asks:
- Answer questions about who they met, what they need, or what was promised.
- Recommend the most useful next step when asked (a draft to send, a pending action to close, or someone met but not yet contacted).
- When asked to draft or write a message, produce a short, warm, specific follow-up (2–4 sentences) they could send as-is.

Style: concise, warm, plain. No preamble, no bullet-point dumps unless listing people. Refer to people by name. Keep answers under ~120 words unless drafting a message.`

  const user = `Question: ${question}\n\nMy networking data (JSON):\n${context}`

  let resp
  try {
    resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':  'https://muturing.com',
        'X-Title':       'Mutu',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1400,
        temperature: 0.35,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
      }),
    })
  } catch (err) {
    return res.status(502).json({ error: 'Ask Mutu is unavailable right now.', detail: err?.message })
  }

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const detail = data?.error?.message || data?.error || `HTTP ${resp.status}`
    console.error('[ai-rewrite:assistant] failed:', resp.status, detail)
    return res.status(resp.status === 402 ? 402 : 502).json({ error: 'Ask Mutu is unavailable right now.', detail: String(detail) })
  }

  const answer = String(data?.choices?.[0]?.message?.content || '').trim()
  if (!answer) return res.status(502).json({ error: 'No answer — try rephrasing.' })
  return res.status(200).json({ answer })
}

// ── "Help me fill" — infer profile matching tags ────────────────────
// Keep these in sync with src/data/requestOptions.js (HELP_TYPES / INDUSTRIES).
const PT_HELP_TYPES = ['Referral', 'Coffee Chat', 'Resume Review', 'Mock Interview', 'Intro', 'Study Group', 'Advice']
const PT_INDUSTRIES = ['Consulting', 'Investment Banking', 'Tech', 'Private Equity', 'VC', 'Marketing', 'Operations', 'Other']

async function handleProfileTags(body, res) {
  const c = body.context || {}
  const note = String(body.text || '').trim().slice(0, 500)
  const known = [
    note && `What they said: ${note}`,
    c.program && `Program: ${c.program}`,
    c.headline && `Headline / role: ${c.headline}`,
    Array.isArray(c.industries) && c.industries.length && `Industry interests: ${c.industries.join(', ')}`,
  ].filter(Boolean).join('\n')

  if (!known) return res.status(400).json({ error: 'Add a sentence or some profile info first.' })

  const system = `You set up a Rotman/UofT student's peer-networking profile so a matcher can pair them well.

From the info given, decide THREE things — but ONLY choose from these exact lists (copy the labels verbatim, never invent new ones):
- HELP_TYPES = ${JSON.stringify(PT_HELP_TYPES)}
- INDUSTRIES = ${JSON.stringify(PT_INDUSTRIES)}

Return STRICT JSON, no prose, no code fences:
{"canHelpWith": [up to 5 HELP_TYPES they could offer others], "skillsToLearn": [up to 5 HELP_TYPES they'd want from a peer], "industries": [up to 3 INDUSTRIES]}

Rules: pick only well-supported items; fewer is fine. If unsure about a field, return an empty array. Do not put the same label in both canHelpWith and skillsToLearn unless clearly justified.`

  let resp
  try {
    resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://muturing.com',
        'X-Title': 'Mutu',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: known },
        ],
      }),
    })
  } catch (err) {
    return res.status(502).json({ error: 'Suggestions are unavailable right now.', detail: err?.message })
  }

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const detail = data?.error?.message || data?.error || `HTTP ${resp.status}`
    console.error('[ai-rewrite:profile_tags] failed:', resp.status, detail)
    return res.status(resp.status === 402 ? 402 : 502).json({ error: 'Suggestions are unavailable right now.', detail: String(detail) })
  }

  const parsed = parseCaptureJSON(data?.choices?.[0]?.message?.content || '') || {}
  const clean = (arr, allowed, cap) => {
    const seen = new Set()
    const out = []
    for (const v of Array.isArray(arr) ? arr : []) {
      const hit = allowed.find(a => a.toLowerCase() === String(v).trim().toLowerCase())
      if (hit && !seen.has(hit)) { seen.add(hit); out.push(hit) }
      if (out.length >= cap) break
    }
    return out
  }
  return res.status(200).json({
    tags: {
      canHelpWith:  clean(parsed.canHelpWith,  PT_HELP_TYPES, 5),
      skillsToLearn: clean(parsed.skillsToLearn, PT_HELP_TYPES, 5),
      industries:   clean(parsed.industries,   PT_INDUSTRIES, 3),
    },
  })
}

// Parse the model's JSON, tolerating code fences / surrounding prose.
function parseCaptureJSON(raw) {
  if (!raw) return null
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  let obj
  try { obj = JSON.parse(s) } catch { return null }
  if (!obj || typeof obj !== 'object') return null
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 400) : '')
  return {
    person:      str(obj.person),
    context:     str(obj.context),
    need:        str(obj.need),
    commitment:  str(obj.commitment),
    next_action: str(obj.next_action),
    due:         str(obj.due),
  }
}
