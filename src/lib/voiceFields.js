// Natural language fields only. Credentials and structured values use typing.
export function isVoiceField(field) {
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return false
  return !field.disabled && !field.readOnly && !field.closest('[data-voice-ui], [data-voice-typing="off"]')
    && (field instanceof HTMLTextAreaElement || ['text', 'search'].includes(field.type))
    && !['numeric', 'decimal', 'tel', 'email', 'url'].includes(field.inputMode)
    && !/password|one-time-code|cc-|username/.test(field.autocomplete || '')
}

export function insertVoiceText(field, text, selection) {
  if (!field.isConnected || !isVoiceField(field)) return 'This field is no longer available. Copy your draft before closing.'
  const value = field.value
  const start = Math.min(selection.start ?? value.length, value.length)
  const end = Math.min(selection.end ?? start, value.length)
  const before = value.slice(0, start), after = value.slice(end)
  const words = text.trim()
  if (!words) return 'Say something or type a draft first.'
  const insert = (before && !/\s$/.test(before) ? ' ' : '') + words + (after && !/^\s|^[.,!?;:，。！？]/.test(after) ? ' ' : '')
  const next = before + insert + after
  if (field.maxLength >= 0 && next.length > field.maxLength) return `This field allows ${field.maxLength} characters. Shorten the draft to insert it. Nothing has been changed.`
  // Use the native setter so React's controlled input handler receives the event.
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, next)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.focus()
  field.setSelectionRange(before.length + insert.length, before.length + insert.length)
  return ''
}

// Live voice typing: rewrite the field as before + words + after on every
// update, so the words appear while the person speaks. Clipped to the
// field's maxLength. Returns the caret position just after the words.
export function writeVoiceDraft(field, { before, after }, text) {
  const words = String(text || '').trim()
  const lead = before && words && !/\s$/.test(before) ? ' ' : ''
  const tail = after && words && !/^\s|^[.,!?;:，。！？]/.test(after) ? ' ' : ''
  let next = before + lead + words + tail + after
  if (field.maxLength >= 0 && next.length > field.maxLength) next = next.slice(0, field.maxLength)
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, next)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  return Math.min(next.length, (before + lead + words).length)
}
