// Template-based follow-up message generator.
//
// Deliberately not an LLM call — the MVP wants "warm, professional,
// editable draft" and the user reads it themselves before sending.
// A template with a small number of context slots hits that bar
// with zero external latency + no privacy surface.
//
// Signature:
//
//   generateFollowUp({
//     recipientName,     // 'Sarah' or 'Sarah Chen'; first name preferred
//     eventTitle,        // 'Hermes Agent Set-up'
//     topics,            // ['AI', 'Hiring']
//     theirNeed,         // '…technical co-founder…' or null
//     myOffer,           // 'startup recruiting support' or null
//     privateNote,       // owner-only; only included when explicitly asked
//     includeNote,       // false by default — private notes stay private
//   }) → { subject, body }

function firstName(n) {
  return String(n || '').trim().split(/\s+/)[0] || 'there'
}

function joinTopics(topics) {
  const arr = (topics || []).filter(Boolean)
  if (arr.length === 0) return null
  if (arr.length === 1) return arr[0]
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`
}

export function generateFollowUp({
  recipientName,
  eventTitle,
  topics = [],
  theirNeed = null,
  myOffer = null,
  privateNote = null,
  includeNote = false,
} = {}) {
  const name  = firstName(recipientName)
  const event = String(eventTitle || 'the event').trim() || 'the event'
  const topicPhrase = joinTopics(topics)

  const parts = []

  // Opening — warm, event-anchored.
  parts.push(`Hi ${name},`)
  parts.push('')
  parts.push(`It was great meeting you at ${event}.`)

  // Middle — reference conversation if we have topics.
  if (topicPhrase) {
    parts[parts.length - 1] += ` I enjoyed our conversation about ${topicPhrase.toLowerCase()}.`
  }

  // Value-recall — the specific reason we're following up.
  if (theirNeed && myOffer) {
    parts.push('')
    parts.push(`You mentioned that you're looking for ${cleanFragment(theirNeed)}, and I may be able to help — I offer ${cleanFragment(myOffer)}. Would you like to continue the conversation?`)
  } else if (theirNeed) {
    parts.push('')
    parts.push(`You mentioned you're looking for ${cleanFragment(theirNeed)}. I'd love to think through that with you if it's still on your mind.`)
  } else if (myOffer) {
    parts.push('')
    parts.push(`I offer ${cleanFragment(myOffer)} — happy to share more if it's useful.`)
  } else {
    parts.push('')
    parts.push(`Would you like to continue the conversation over a coffee chat?`)
  }

  // Private-note context — only if the user explicitly ticked it.
  // Note is trimmed and truncated to prevent accidental over-sharing.
  if (includeNote && privateNote && privateNote.trim()) {
    parts.push('')
    parts.push(`(For context: ${cleanFragment(privateNote).slice(0, 200)})`)
  }

  parts.push('')
  parts.push('Talk soon,')

  return {
    subject: `Following up on ${event}`,
    body:    parts.join('\n'),
  }
}

function cleanFragment(s) {
  return String(s || '').trim().replace(/^\s*[—–-]\s*/, '').replace(/\s*[.!?]+$/, '')
}
