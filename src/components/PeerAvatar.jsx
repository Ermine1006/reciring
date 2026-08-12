import AnonymousAvatar from './AnonymousAvatar'

// ── Unified peer avatar ──────────────────────────────────────────────
// One rule across the whole platform so identity state reads at a glance:
//   • Anonymous peer (identity not revealed to the viewer) → bean avatar.
//   • Revealed / real name → initials monogram (colored circle).
//
// The avatar type MIRRORS the display name, so it never leaks more than the
// name already shows: if the caller renders a real name we show initials; if
// it renders "Anonymous peer" we show the bean. Callers already contain the
// reveal logic when they choose the name, so passing that same name here is
// privacy-safe by construction.

const MONO_GRADS = [
  ['#8B9A6A', '#6C7A4E'], // sage-olive
  ['#8FA6A0', '#5F7D75'], // sage-teal
  ['#A38FB0', '#77638C'], // muted purple
  ['#B58C8C', '#8A5E5E'], // dusty rose
  ['#7E93B8', '#546E96'], // slate blue
  ['#C0A06A', '#8A6E3E'], // warm bronze
]

function hashIdx(s, n) {
  const str = String(s || '')
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h % n
}

function initialsOf(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·'
}

// A name counts as anonymous when it's empty or starts with "Anonymous"
// (covers "Anonymous peer", "Anonymous Peer", "Anonymous FT-MBA member", …).
export function isAnonymousName(name) {
  return !name || /^anonymous\b/i.test(String(name).trim())
}

export default function PeerAvatar({ name, seed, size = 44, anonymous, style }) {
  const anon = anonymous ?? isAnonymousName(name)

  if (anon) {
    return <AnonymousAvatar seed={seed || name || 'anon'} size={size} />
  }

  const [a, b] = MONO_GRADS[hashIdx(seed || name, MONO_GRADS.length)]
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'grid', placeItems: 'center',
        color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.38),
        letterSpacing: '0.01em',
        background: `linear-gradient(145deg, ${a}, ${b})`,
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.35), 0 2px 6px rgba(0,0,0,0.12)',
        fontFamily: 'Inter, system-ui, sans-serif',
        ...style,
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
