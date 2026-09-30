// Keep valid JSON and at least one record from each loaded section. Cutting the
// serialized string can drop entire sections and leave the AI with broken JSON.
export function serializeAssistantContext(context, maxChars = 12000) {
  const source = context && typeof context === 'object' && !Array.isArray(context) ? context : {}
  const full = JSON.stringify(source)
  if (full.length <= maxChars) return full
  function compact(value, items, chars) {
    if (typeof value === 'string') return value.length > chars ? value.slice(0, chars) + '…' : value
    if (Array.isArray(value)) return value.slice(0, items).map(v => compact(v, items, chars))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compact(v, items, chars)]))
    return value
  }
  for (const [items, chars] of [[8, 400], [5, 250], [3, 160], [1, 80]]) {
    const serialized = JSON.stringify({ ...compact(source, items, chars), context_limited: true })
    if (serialized.length <= maxChars) return serialized
  }
  return JSON.stringify({ context_limited: true, context_unavailable: true })
}
