/*
 * ReciRingLogo — icon + wordmark lockup
 *
 * Icon: two interlocking rings in gold, representing reciprocal exchange.
 * Wordmark: "ReciRing" in Fraunces serif, black.
 */
export default function ReciRingLogo({ size = 22 }) {
  // Ring geometry — two overlapping circles in a 30 × 18 canvas
  const r  = 8          // ring radius
  const cy = 9          // vertical center
  const lx = 9          // left ring center x
  const rx = 21         // right ring center x  (gap = rx - lx - 2r = 4 → nice overlap)

  // Scale everything relative to requested size
  const scale     = size / 18
  const vbWidth   = 30
  const vbHeight  = 18
  const svgWidth  = vbWidth  * scale
  const svgHeight = vbHeight * scale

  return (
    <div className="flex items-center" style={{ gap: 9 }}>
      {/* ── Interlocking rings icon ── */}
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${vbWidth} ${vbHeight}`}
        fill="none"
        aria-hidden="true"
      >
        {/*
         * Draw each ring as a full circle.
         * The left ring is clipped so its right half doesn't overdraw the
         * right ring's left arc, giving a true "link" appearance.
         * We paint: left ring back-half → right ring → left ring front-half.
         */}
        <defs>
          {/* Clip left half of canvas — for the back arc of left ring */}
          <clipPath id="rrl-left-back">
            <rect x="0" y="0" width={lx} height={vbHeight} />
          </clipPath>
          {/* Clip right half of canvas — for the front arc of left ring */}
          <clipPath id="rrl-left-front">
            <rect x={lx} y="0" width={vbWidth - lx} height={vbHeight} />
          </clipPath>
        </defs>

        {/* Left ring — back half (sits behind right ring) */}
        <circle
          cx={lx} cy={cy} r={r}
          stroke="#C8A96A"
          strokeWidth={1.6}
          clipPath="url(#rrl-left-back)"
        />

        {/* Right ring — full circle (sits in front of left ring's back half) */}
        <circle
          cx={rx} cy={cy} r={r}
          stroke="#C8A96A"
          strokeWidth={1.6}
        />

        {/* Left ring — front half (sits in front of right ring) */}
        <circle
          cx={lx} cy={cy} r={r}
          stroke="#C8A96A"
          strokeWidth={1.6}
          clipPath="url(#rrl-left-front)"
        />
      </svg>

      {/* ── Wordmark ── */}
      <span
        style={{
          fontFamily: 'Fraunces, "Playfair Display", Georgia, serif',
          fontSize: size + 2,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: '#111111',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        ReciRing
      </span>
    </div>
  )
}
