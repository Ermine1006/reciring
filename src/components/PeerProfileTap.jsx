import { usePeerProfile } from '../context/PeerProfileContext'

// Wraps a member's avatar. When `peerId` is set (only pass it for members who
// chose a Public profile) tapping the avatar opens their profile in the right
// drawer. Otherwise the avatar renders as is, so anonymous ones never open.
export default function PeerProfileTap({ peerId, name, children, style }) {
  const openProfile = usePeerProfile(peerId)
  if (!openProfile) return children
  const stop = e => e.stopPropagation()
  return (
    <button
      type="button"
      aria-label={name ? `View ${name}'s profile` : 'View profile'}
      className="active:scale-95"
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={e => { e.stopPropagation(); e.preventDefault(); openProfile() }}
      style={{ display: 'inline-flex', flexShrink: 0, background: 'none', border: 0, padding: 0, margin: 0, borderRadius: '50%', cursor: 'pointer', transition: 'transform 120ms ease', ...style }}
    >
      {children}
    </button>
  )
}
