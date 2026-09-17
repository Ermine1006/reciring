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
