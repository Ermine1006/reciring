import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import PeerProfileCard from '../components/PeerProfileCard'
import { useAuth } from './AuthContext'

// One right-side profile drawer for the whole app. Any surface that names a
// member who chose a Public profile can open it with that member's user id.
// Private or anonymous members are never passed in, and the server refuses
// anything that is not a Public profile, so this cannot reveal identities.
const PeerProfileContext = createContext(null)

export function PeerProfileProvider({ children }) {
  const { user } = useAuth()
  const [peerId, setPeerId] = useState(null)
  const openPeerProfile = useCallback(id => { if (id && id !== user?.id) setPeerId(id) }, [user?.id])
  const value = useMemo(() => ({ openPeerProfile, currentUserId: user?.id || null }), [openPeerProfile, user?.id])
  return (
    <PeerProfileContext.Provider value={value}>
      {children}
      <PeerProfileCard open={Boolean(peerId && user?.id)} peerId={peerId} currentUserId={user?.id} onClose={() => setPeerId(null)} />
    </PeerProfileContext.Provider>
  )
}

// Returns a function that opens this Public member's profile, or null when no
// provider is mounted (tests, previews) so callers render a plain name.
// Your own name is never a profile link.
export function usePeerProfile(peerId) {
  const ctx = useContext(PeerProfileContext)
  if (!ctx || !peerId || peerId === ctx.currentUserId) return null
  return () => ctx.openPeerProfile(peerId)
}
