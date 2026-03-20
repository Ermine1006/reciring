/*
 * ReciRingLogo — premium metallic wordmark lockup
 *
 * Icon: 3D extruded gold "R" in Playfair Display italic,
 *       built from layered SVG text with a metallic gradient on the front face.
 * Wordmark: "ReciRing" in Playfair Display with a warm gold gradient.
 *
 * Micro-interaction: the entire lockup lifts 2px on hover with
 * a deepened drop shadow — restrained luxury, not playful.
 */
import { useState } from 'react'

/* ── Gradient definitions ─────────────────────────────────────── */
const WORDMARK_GRADIENT =
  'linear-gradient(135deg, #7A5910 0%, #C8A832 38%, #D4AF37 55%, #8B6914 100%)'

/* ── Metallic R icon ──────────────────────────────────────────── */
/*
 * Three offset copies of the italic "R" simulate a cast-metal extrusion.
 * The frontmost copy carries a five-stop gradient that goes from bright
 * champagne (highlight) through warm gold to deep amber (shadow edge),
 * matching the light-from-upper-left look of the reference photograph.
 */
function MetallicR({ size }) {
  const W = 40        // viewBox width
  const H = 48        // viewBox height
  const FONT_SIZE = 52
  const BX = 1        // baseline x — slight left margin so extrusion stays in frame
  const BY = 43       // baseline y

  const EXTRUSION = [
    { dx: 3, dy: 3.5, fill: '#4E3206', opacity: 0.55 }, // deepest shadow
    { dx: 2, dy: 2.5, fill: '#7A5910', opacity: 0.72 },
    { dx: 1, dy: 1.5, fill: '#B8962E', opacity: 0.88 },
  ]

  const textProps = {
    fontFamily: "'Playfair Display', 'Georgia', serif",
    fontSize: FONT_SIZE,
    fontStyle: 'italic',
    fontWeight: '400',
  }

  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox={`0 0 ${W} ${H}`}
      style={{ overflow: 'visible', display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        {/*
         * Five-stop gradient simulates convex metallic surface:
         * bright highlight → rich gold → warm gold → deep gold → dark edge
         */}
        <linearGradient id="rLogoGold" x1="12%" y1="4%" x2="88%" y2="96%">
          <stop offset="0%"   stopColor="#FFF8D6" /> {/* specular highlight   */}
          <stop offset="18%"  stopColor="#FFD700" /> {/* bright gold          */}
          <stop offset="44%"  stopColor="#D4AF37" /> {/* warm mid gold        */}
          <stop offset="72%"  stopColor="#B8962E" /> {/* deeper gold          */}
          <stop offset="100%" stopColor="#7A5910" /> {/* shadow edge          */}
        </linearGradient>
      </defs>

      {/* Back-most extrusion layers */}
      {EXTRUSION.map(({ dx, dy, fill, opacity }, i) => (
        <text
          key={i}
          x={BX + dx}
          y={BY + dy}
          fill={fill}
          opacity={opacity}
          {...textProps}
        >
          R
        </text>
      ))}

      {/* Front face — metallic gradient */}
      <text x={BX} y={BY} fill="url(#rLogoGold)" {...textProps}>
        R
      </text>
    </svg>
  )
}

/* ── Exported component ───────────────────────────────────────── */
export default function ReciRingLogo({ size = 30 }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        // Luxury lift — subtle spring-feel cubic-bezier
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
      aria-label="ReciRing — home"
    >
      {/* 3-D metallic "R" */}
      <div
        style={{
          filter: hovered
            ? 'drop-shadow(0 7px 16px rgba(180,138,0,0.42))'
            : 'drop-shadow(0 3px 8px rgba(110,80,0,0.26))',
          transition: 'filter 0.28s ease',
        }}
      >
        <MetallicR size={size} />
      </div>

      {/* Gold-gradient wordmark in Playfair Display */}
      <span
        style={{
          fontFamily: "'Playfair Display', 'Georgia', serif",
          fontSize: Math.round(size * 0.72),
          fontWeight: 500,
          letterSpacing: '0.07em',
          background: WORDMARK_GRADIENT,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent', // fallback
          lineHeight: 1,
          paddingBottom: 1,     // prevents descender clip on some browsers
          userSelect: 'none',
        }}
      >
        ReciRing
      </span>
    </button>
  )
}
