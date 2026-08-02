import { categoryEmoji } from '../data/eventCategories'

// Deterministic, tasteful gradient palettes for the no-cover fallback. Chosen
// to sit comfortably in Mutu's warm system rather than clash with it.
const FALLBACKS = [
  ['#EFC79C', '#D8A26A'], // amber
  ['#CBB89A', '#9C8560'], // sand
  ['#B9C7B0', '#8AA37E'], // sage
  ['#C7BBD1', '#9C89AD'], // mauve
  ['#B8C6D6', '#8AA0B8'], // slate blue
  ['#E4B7A6', '#C58B77'], // clay
]

function pick(seed) {
  const s = String(seed || 'mutu')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return FALLBACKS[h % FALLBACKS.length]
}

/**
 * The standard event cover used everywhere (card, detail, dashboard, Prepare,
 * recap). Renders the host's uploaded image_url when present; otherwise a
 * deterministic branded gradient with the category glyph — never a blank box.
 *
 * Props: event, radius (number|string, default 0), aspectRatio (default '16/7').
 */
export default function EventCover({ event, radius = 0, aspectRatio = '16 / 7', style }) {
  const url = event?.image_url
  const label = event?.category || 'Event'
  const [a, b] = pick(event?.id || event?.category)

  const frame = {
    width: '100%', aspectRatio, overflow: 'hidden', position: 'relative',
    borderRadius: radius, ...style,
  }

  if (url) {
    return (
      <div style={frame}>
        <img src={url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    )
  }

  return (
    <div style={{ ...frame, background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {/* soft light + faint interlocking-rings watermark */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 78% 22%, rgba(255,255,255,0.32), transparent 60%)' }} />
      <svg viewBox="0 0 44 32" width="72" style={{ position: 'absolute', right: 14, bottom: 10, opacity: 0.35 }} aria-hidden="true">
        <circle cx="15" cy="16" r="11" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="29" cy="16" r="11" fill="none" stroke="#fff" strokeWidth="2.4" />
      </svg>
      <span style={{ position: 'absolute', left: 14, bottom: 10, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.95)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {categoryEmoji(label)} {label}
      </span>
    </div>
  )
}
