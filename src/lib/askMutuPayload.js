// Keep valid JSON and at least one record from each loaded section. Cutting the
// serialized string can drop entire sections and leave the AI with broken JSON.
export function serializeAssistantContext(context, maxChars = 12000, question = '') {
  let source = context && typeof context === 'object' && !Array.isArray(context) ? context : {}
  const full = JSON.stringify(source)
  if (full.length <= maxChars) return full
  // Keep a named person in view even when a large network must be shortened.
  const asked = String(question).toLocaleLowerCase()
  function prioritize(value) {
    if (Array.isArray(value)) return value.map(prioritize).sort((a, b) => {
      const mentioned = row => [row?.name, row?.buddy_name, row?.peer_name].some(name =>
        typeof name === 'string' && name.length > 1 && (asked.includes(name.toLocaleLowerCase())
          || name.toLocaleLowerCase().split(/\s+/).some(part => part.length >= 3 && asked.split(/[^\p{L}\p{N}]+/u).includes(part))))
      return Number(mentioned(b)) - Number(mentioned(a))
    })
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, prioritize(v)]))
    return value
  }
  source = prioritize(source)
  function compact(value, items, chars) {
    if (typeof value === 'string') return value.length > chars ? value.slice(0, chars) + '…' : value
    if (Array.isArray(value)) return value.slice(0, items).map(v => compact(v, items, chars))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compact(v, items, chars)]))
    return value
  }
  const fallbacks = []
  for (const [items, chars] of [[8, 400], [5, 250], [3, 160], [1, 80]]) {
    const reduced = compact(source, items, chars)
    // Own profile is the anchor for every question, including hobbies that may
    // occur late in a tag list. Prefer it intact before reducing it as a fallback.
    const anchored = JSON.stringify({ ...reduced, me: source.me, context_limited: true })
    if (anchored.length <= maxChars) return anchored
    const serialized = JSON.stringify({ ...reduced, context_limited: true })
    if (serialized.length <= maxChars) fallbacks.push(serialized)
  }
  if (fallbacks.length) return fallbacks[0]
  return JSON.stringify({ context_limited: true, context_unavailable: true })
}
