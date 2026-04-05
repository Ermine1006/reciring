/*
 * ReciRingLogo — premium metallic wordmark lockup
 *
 * Icon: Two interlocking gold rings, symbolising reciprocity.
 * Wordmark: "ReciRing" in Playfair Display with a warm gold gradient.
 *
 * Micro-interaction: the entire lockup lifts 2px on hover with
 * a deepened drop shadow — restrained luxury, not playful.
 */
import { useState } from 'react'

/* ── Gradient definitions ─────────────────────────────────────── */
const WORDMARK_GRADIENT =
  'linear-gradient(135deg, #7A5910 0%, #C8A832 38%, #D4AF37 55%, #8B6914 100%)'

/* ── Interlocking Rings icon ─────────────────────────────────── */
function InterlockingRings({ size }) {
  const W = 44
  const H = 32
  const R = 11          // ring radius
  const SW = 2.8        // stroke width
  const CY = H / 2      // vertical center
  const LX = 15         // left ring center x
  const RX = 29         // right ring center x

  return (
    <svg
      width={size}
      height={size * (H / W)}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ringGoldL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#FFD700" />
          <stop offset="50%"  stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#B8962E" />
        </linearGradient>
        <linearGradient id="ringGoldR" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#FFD700" />
          <stop offset="50%"  stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#9A7B1F" />
        </linearGradient>
      </defs>

      {/* Left ring — back half behind right ring */}
      <circle cx={LX} cy={CY} r={R} fill="none" stroke="url(#ringGoldL)" strokeWidth={SW}
        clipPath="url(#clipLeftBack)" />

      {/* Right ring — full */}
      <circle cx={RX} cy={CY} r={R} fill="none" stroke="url(#ringGoldR)" strokeWidth={SW} />

      {/* Left ring — front half over right ring */}
      <circle cx={LX} cy={CY} r={R} fill="none" stroke="url(#ringGoldL)" strokeWidth={SW}
        clipPath="url(#clipLeftFront)" />

      <defs>
        {/* Clip: left half of the overlap zone — the part of the left ring that goes BEHIND */}
        <clipPath id="clipLeftBack">
          <rect x="0" y="0" width={RX - R + SW / 2} height={H} />
        </clipPath>
        {/* Clip: right portion of left ring that overlaps — goes IN FRONT */}
        <clipPath id="clipLeftFront">
          <rect x={RX - R + SW / 2} y="0" width={W} height={CY} />
        </clipPath>
      </defs>
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
      {/* Interlocking rings icon */}
      <div
        style={{
          filter: hovered
            ? 'drop-shadow(0 5px 12px rgba(180,138,0,0.38))'
            : 'drop-shadow(0 2px 6px rgba(110,80,0,0.22))',
          transition: 'filter 0.28s ease',
        }}
      >
        <InterlockingRings size={size} />
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
