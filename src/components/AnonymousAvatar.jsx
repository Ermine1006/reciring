/*
 * AnonymousAvatar — cute bean mascot, deterministic per seed.
 *
 * 64×64 viewBox scaled to `size` px via CSS.
 * Unique gradient IDs use React useId() to avoid SVG collisions
 * when multiple cards are visible simultaneously.
 * Circular clip is done with CSS borderRadius — no SVG clipPath needed.
 */
import { useId } from 'react'

/* ── deterministic hash ──────────────────────────────────────────── */
function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) + str.charCodeAt(i)) & 0xffffffff
  }
  return Math.abs(h)
}

/* ── 8 soft pastel palettes ──────────────────────────────────────── */
const PALETTES = [
  { bg: '#F5DDD5', bodyLt: '#FFF2EC', body: '#FFD0BC', bodyDk: '#FFAA90', eyes: '#2D1A33', cheek: '#FF9B8A' },
  { bg: '#D5E5F8', bodyLt: '#E8F0FF', body: '#BBCEFF', bodyDk: '#8AAAF0', eyes: '#1A2640', cheek: '#6688DD' },
  { bg: '#E5D5F8', bodyLt: '#EEE8FF', body: '#D0BBFF', bodyDk: '#AA88EE', eyes: '#28184A', cheek: '#AA77EE' },
  { bg: '#D5F0E5', bodyLt: '#E8F8EE', body: '#B8EECE', bodyDk: '#80CCAA', eyes: '#183A28', cheek: '#55BB88' },
  { bg: '#F5D5E0', bodyLt: '#FFECEE', body: '#FFC0CC', bodyDk: '#EE8899', eyes: '#3A1820', cheek: '#EE6688' },
  { bg: '#F8EDD5', bodyLt: '#FFF8E5', body: '#FFE2AA', bodyDk: '#EEC070', eyes: '#382A14', cheek: '#DDAA44' },
  { bg: '#D5EEF8', bodyLt: '#E5F6FF', body: '#AADDF8', bodyDk: '#70BBDD', eyes: '#14303A', cheek: '#44AACC' },
  { bg: '#EED5F8', bodyLt: '#F5E8FF', body: '#E2BBFF', bodyDk: '#BB88EE', eyes: '#30184A', cheek: '#BB66EE' },
]

/* ── 5 accessory variants (index 0 = none) ───────────────────────── */
// Rendered as JSX — each receives the palette `p` and `eyeColor`
const renderAccessory = (variant, p) => {
  switch (variant) {
    /* ── Bow on top of head ── */
    case 1: return (
      <g>
        <ellipse cx="0" cy="0" rx="7" ry="3.8" fill="#FF9EC5"
          transform="translate(25, 11) rotate(-32)" />
        <ellipse cx="0" cy="0" rx="7" ry="3.8" fill="#FF9EC5"
          transform="translate(39, 11) rotate(32)" />
        <circle cx="32" cy="11" r="3.2" fill="#FF6EAA" />
      </g>
    )
    /* ── Flower on top of head ── */
    case 2: return (
      <g>
        <circle cx="32" cy="6.5"  r="3.8" fill="#FFE566" opacity="0.95" />
        <circle cx="32" cy="15"   r="3.8" fill="#FFE566" opacity="0.95" />
        <circle cx="27.7" cy="10.8" r="3.8" fill="#FFE566" opacity="0.95" />
        <circle cx="36.3" cy="10.8" r="3.8" fill="#FFE566" opacity="0.95" />
        <circle cx="32" cy="10.8" r="3.2" fill="#FF9933" />
      </g>
    )
    /* ── Tiny star badge on chest ── */
    case 3: return (
      <path
        d="M32 38 L33.5 42 L37.7 42.15 L34.4 44.8 L35.5 48.85 L32 46.5 L28.5 48.85 L29.6 44.8 L26.3 42.15 L30.5 42 Z"
        fill="#C8A96A" stroke="#A88245" strokeWidth="0.6"
      />
    )
    /* ── Round glasses over eyes ── */
    case 4: return (
      <g fill="none" stroke={p.eyes} strokeWidth="1.5" opacity="0.72">
        <circle cx="24" cy="26" r="6" />
        <circle cx="40" cy="26" r="6" />
        <line x1="30" y1="26" x2="34" y2="26" />
        <line x1="18" y1="24" x2="15" y2="22" />
        <line x1="46" y1="24" x2="49" y2="22" />
      </g>
    )
    default: return null
  }
}

/* ── Component ───────────────────────────────────────────────────── */
export default function AnonymousAvatar({ seed = 'anon', size = 36 }) {
  const uid    = useId()
  const gradId = `av-${uid}`

  const h   = djb2(seed)
  const p   = PALETTES[h % PALETTES.length]
  const acc = (h >> 6) % 5          // 0–4  accessory variant
  const mouthWide = (h >> 10) % 2  // 0 = wide smile, 1 = softer

  // Bow & flower sit ON TOP of the head — draw after body rect
  const accOnHead  = acc === 1 || acc === 2
  // Star & glasses sit on the face/body — draw after eyes / over eyes
  const accOnFace  = acc === 3 || acc === 4

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ display: 'block', flexShrink: 0, borderRadius: '50%', overflow: 'hidden' }}
      aria-hidden="true"
    >
      <defs>
        {/* Body gradient: light top-left → mid → dark bottom-right */}
        <linearGradient id={gradId} x1="18%" y1="12%" x2="82%" y2="92%">
          <stop offset="0%"   stopColor={p.bodyLt} />
          <stop offset="50%"  stopColor={p.body}   />
          <stop offset="100%" stopColor={p.bodyDk} />
        </linearGradient>
      </defs>

      {/* ── Background ───────────────────────────────── */}
      <rect width="64" height="64" fill={p.bg} />

      {/* ── Arms — sit BEHIND the body ───────────────── */}
      <ellipse cx="0" cy="0" rx="10.5" ry="6" fill={p.body}
        transform="translate(10, 38) rotate(-18)" />
      <ellipse cx="0" cy="0" rx="10.5" ry="6" fill={p.body}
        transform="translate(54, 38) rotate(18)" />

      {/* ── Feet ─────────────────────────────────────── */}
      <ellipse cx="22" cy="57" rx="7.5" ry="4.5" fill={p.bodyDk} />
      <ellipse cx="42" cy="57" rx="7.5" ry="4.5" fill={p.bodyDk} />

      {/* ── Bean body ────────────────────────────────── */}
      <rect x="13" y="10" width="38" height="50" rx="19" fill={`url(#${gradId})`} />

      {/* Body gloss highlights */}
      <ellipse cx="22" cy="19" rx="8.5" ry="5"
        fill="white" opacity="0.4" transform="rotate(-22, 22, 19)" />
      <ellipse cx="42" cy="53" rx="5" ry="3"
        fill="white" opacity="0.08" />

      {/* ── Head/top accessories (bow, flower) ───────── */}
      {accOnHead && renderAccessory(acc, p)}

      {/* ── Eyes ─────────────────────────────────────── */}
      <circle cx="24" cy="26" r="4.8" fill={p.eyes} />
      <circle cx="40" cy="26" r="4.8" fill={p.eyes} />

      {/* Eye gloss highlights */}
      <circle cx="25.8" cy="23.5" r="2"   fill="white" opacity="0.9" />
      <circle cx="41.8" cy="23.5" r="2"   fill="white" opacity="0.9" />
      <circle cx="24.5" cy="25.8" r="0.8" fill="white" opacity="0.5" />
      <circle cx="40.5" cy="25.8" r="0.8" fill="white" opacity="0.5" />

      {/* ── Face/chest accessories (glasses, star) ────── */}
      {accOnFace && renderAccessory(acc, p)}

      {/* ── Cheek blush ──────────────────────────────── */}
      <ellipse cx="17" cy="32.5" rx="5.5" ry="3.5" fill={p.cheek} opacity="0.48" />
      <ellipse cx="47" cy="32.5" rx="5.5" ry="3.5" fill={p.cheek} opacity="0.48" />

      {/* ── Mouth ────────────────────────────────────── */}
      <path
        d={mouthWide
          ? 'M 25 36.5 Q 32 43 39 36.5'
          : 'M 27 36.5 Q 32 41 37 36.5'
        }
        fill="none"
        stroke={p.eyes}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}
