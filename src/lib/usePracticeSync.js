import { useEffect, useRef } from 'react'
import { fetchMyPairings, fetchMySessions } from './practice'

const fingerprint = rows => JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)))

// Poll the authorized views, not raw pairing tables (which deliberately have no read policy).
// Only changed state triggers the full hub reload. Hidden tabs do no background work.
export default function usePracticeSync({ userId, enabled, pairings, sessions, onChange }) {
  const current = useRef({ pairings, sessions, onChange })
  current.current = { pairings, sessions, onChange }
  useEffect(() => {
    if (!enabled || !userId) return
    let disposed = false
    let checking = false
    const check = async () => {
      if (disposed || checking || document.visibilityState === 'hidden') return
      checking = true
      try {
        const [p, s] = await Promise.all([fetchMyPairings(), fetchMySessions()])
        if (disposed || p.error || s.error) return
        const latest = current.current
        if (fingerprint(p.data || []) !== fingerprint(latest.pairings) || fingerprint(s.data || []) !== fingerprint(latest.sessions)) {
          await latest.onChange()
        }
      } catch { /* Keep existing data; manual refresh and the next poll can retry. */ }
      finally { checking = false }
    }
    const interval = window.setInterval(check, 15000)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [userId, enabled])
}
