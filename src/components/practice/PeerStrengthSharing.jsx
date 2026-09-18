import { useEffect, useState } from 'react'
import { peerStrengthSharing, practiceHistorySharing } from '../../lib/practice'

export default function PeerStrengthSharing({ communityId, onChange, history = false }) {
  const sharing = history ? practiceHistorySharing : peerStrengthSharing
  const [shared, setShared] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    sharing(communityId).then(result => { if (active && !result.error) setShared(result.data === true) }).catch(() => {})
    return () => { active = false }
  }, [communityId, sharing])
  if (shared === null) return null
  const save = async value => {
    setBusy(true); setError('')
    try {
      const result = await sharing(communityId, value)
      if (result.error) throw result.error
      setShared(result.data === true)
      onChange?.()
    } catch { setError('Could not update sharing. Please try again.') }
    finally { setBusy(false) }
  }
  return <div style={{ margin: '16px 0' }}>
    <label className="quest-response-choice"><input type="checkbox" checked={shared} disabled={busy} onChange={e => save(e.target.checked)} /> {history ? 'Show my completed practice and partner counts on my pool card' : 'Show skills and teammate qualities recognised by practice partners and use them for recommendations'}</label>
    <small>Only mutually confirmed practice counts. Your name and private tips stay hidden in the pool. You can turn this off anytime.</small>
    {error && <p role="alert">{error}</p>}
  </div>
}
