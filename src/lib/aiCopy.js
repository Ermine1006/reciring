// Normalize generated prose only; leave user-authored text and ordinary hyphens alone.
export function withoutEmDashes(value) {
  return String(value ?? '')
    .replace(/[ \t]*\u2014+[ \t]*/g, ', ')
    .replace(/([,.;:!?])[ \t]*,[ \t]*/g, '$1 ')
    .replace(/,[ \t]*([,.;:!?])/g, '$1')
    .replace(/^[ \t]*,[ \t]*|,[ \t]*$/gm, '')
    .trim()
}
