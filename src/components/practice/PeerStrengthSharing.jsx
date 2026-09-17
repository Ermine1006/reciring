import { useEffect, useState } from 'react'
import { peerStrengthSharing } from '../../lib/practice'

export default function PeerStrengthSharing({ communityId, onChange }) {
  const [shared, setShared] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    peerStrengthSharing(communityId).then(result => { if (active && !result.error) setShared(result.data === true) }).catch(() => {})
    return () => { active = false }
  }, [communityId])
  if (shared === null) return null
  const save = async value => {
    setBusy(true); setError('')
    try {
      const result = await peerStrengthSharing(communityId, value)
      if (result.error) throw result.error
      setShared(result.data === true)
      onChange?.()
    } catch { setError('Could not update sharing. Please try again.') }
    finally { setBusy(false) }
  }
  return <div style={{ margin: '16px 0' }}>
    <label className="quest-response-choice"><input type="checkbox" checked={shared} disabled={busy} onChange={e => save(e.target.checked)} /> Show skills and teammate qualities recognised by practice partners and use them for recommendations</label>
    <small>Only mutually confirmed practice counts. Your name and private tips stay hidden in the pool. You can turn this off anytime.</small>
    {error && <p role="alert">{error}</p>}
  </div>
}
