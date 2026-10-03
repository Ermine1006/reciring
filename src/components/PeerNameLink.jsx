import { usePeerProfile } from '../context/PeerProfileContext'

// A member's visible name. When `peerId` is set (only pass it for members who
// chose a Public profile) the name opens their profile in the right drawer.
// Otherwise it renders as plain text, so anonymous names are never clickable.
export default function PeerNameLink({ peerId, children, style, className }) {
  const openProfile = usePeerProfile(peerId)
  if (!openProfile) return <span style={style} className={className}>{children}</span>
  const stop = e => e.stopPropagation()
  return (
    <button
      type="button"
      className={className}
      aria-label={typeof children === 'string' ? `View ${children}'s profile` : 'View profile'}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={e => { e.stopPropagation(); e.preventDefault(); openProfile() }}
      style={{
        background: 'none', border: 0, padding: 0, margin: 0, font: 'inherit', color: 'inherit',
        cursor: 'pointer', textAlign: 'inherit', textDecoration: 'underline',
        textDecorationColor: 'rgba(201,163,59,0.55)', textUnderlineOffset: 3, textDecorationThickness: 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}
