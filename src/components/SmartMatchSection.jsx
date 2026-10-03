import { withoutEmDashes } from '../lib/aiCopy'
import { useEffect, useState, useCallback, useRef } from 'react'
import PeerAvatar from './PeerAvatar'
import { generateSmartMatches, fetchVisibleNudges, setNudgeStatus, checkMutualMatch } from '../lib/smartMatch'
import { track } from '../lib/analytics'
import { matchaCta, MATCHA_DEEP } from '../lib/matchaCta'

const C = {
  ground: 'var(--mutu-canvas, #F9F7F4)', ink: '#1A1712', ink2: '#5F584D', ink3: '#9A958B',
  line: '#ECE7DE',
}
const secHead = { margin: '18px 2px 9px' }
const secTitle = { margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }
const primary = { border: 'none', borderRadius: 99, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', ...matchaCta }

export default function SmartMatchSection({ onOpenMatches }) {
  const [nudges, setNudges] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  // Refresh and actions cannot race and replace a newly saved interest with
  // stale pending rows. Ref also protects against rapid repeated clicks.
  const working = useRef(false)

  const load = useCallback(async (refresh = false) => {
    if (working.current) return
    working.current = true
    setLoading(true)
    setError(null)
    try {
      let result = await fetchVisibleNudges()
      if (result.error) throw result.error
      // Show saved interests even if generation of new suggestions fails.
      setNudges(result.nudges)
      if (refresh || !result.nudges.some(n => n.status === 'pending')) {
        const generated = await generateSmartMatches()
        if (generated.error) throw generated.error
        result = await fetchVisibleNudges()
        if (result.error) throw result.error
        setNudges(result.nudges)
      }
      if (result.nudges.length) track('smart_match_shown', { count: result.nudges.length })
    } catch {
      setError('Could not refresh suggestions. Your saved interests are unchanged. Try Refresh again.')
    } finally {
      working.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (nudge, status) => {
    if (working.current || nudge.status !== 'pending') return
    working.current = true
    setBusyId(nudge.id)
    setError(null)
    setNotice(null)
    try {
      const result = await setNudgeStatus(nudge.id, status)
      if (result.error) throw result.error
      track(status === 'interested' ? 'smart_match_interested' : 'smart_match_skipped',
        { candidate_id: nudge.candidate_id, score: nudge.score })
      if (status === 'skipped') {
        setNudges(prev => prev.filter(n => n.id !== nudge.id))
        setNotice('Suggestion skipped.')
        return
      }
      // Interest is already persisted. Never drop the card just because the
      // other person has not expressed interest or the match lookup fails.
      setNudges(prev => prev.map(n => n.id === nudge.id ? { ...n, status: 'interested' } : n))
      setNotice('Interest saved. You can find it here when you return.')
      try {
        const match = await checkMutualMatch(nudge.candidate_id)
        if (match.error) throw match.error
        if (match.matched) {
          setNudges(prev => prev.map(n => n.id === nudge.id ? { ...n, status: 'matched' } : n))
          setNotice('You are both interested. Open Matches to say hello.')
          track('smart_match_mutual', { candidate_id: nudge.candidate_id })
        }
      } catch {
        setNotice('Interest saved. We could not check for a connection yet. Refresh to check again.')
      }
    } catch {
      setError('Could not save your choice. Please try again. If this suggestion has changed, tap Refresh.')
    } finally {
      working.current = false
      setBusyId(null)
    }
  }

  if (loading && !nudges.length) return null
  if (!nudges.length && !error && !notice) return null
  const disabled = loading || Boolean(busyId)

  return (
    <section aria-label="People you should meet">
      <div style={{ ...secHead, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={secTitle}>People you should meet</h2>
        <button type="button" onClick={() => load(true)} disabled={disabled}
          style={{ background: 'none', border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer', color: MATCHA_DEEP, fontWeight: 700, fontSize: 12.5, opacity: disabled ? 0.5 : 1 }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p role="alert" style={{ fontSize: 12.5, color: '#991B1B', lineHeight: 1.5 }}>{error}</p>}
      {notice && <p role="status" style={{ fontSize: 12.5, color: MATCHA_DEEP, lineHeight: 1.5 }}>{notice}</p>}
      {nudges.length > 0 && <div style={{ background: '#FFFFFF', border: '1px solid #EFEBE2', borderRadius: 18, padding: '2px 14px', boxShadow: '0 1px 3px rgba(60,45,10,0.03)' }}>
        {nudges.map((n, i) => (
          <article key={n.id} aria-label={n.publicName ? `Recommendation: ${n.publicName}` : 'Anonymous peer recommendation'}
            style={{ padding: '13px 2px', borderTop: i === 0 ? 'none' : '1px solid #F1EEE7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ flexShrink: 0 }}><PeerAvatar name={n.publicName || 'Anonymous peer'} anonymous={!n.publicName} seed={n.candidate_id} size={40} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{n.publicName || 'Anonymous peer'}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.ink2, marginTop: 2, lineHeight: 1.4 }}>
                  {withoutEmDashes(n.reason)}
                </span>
              </div>
            </div>
            <div style={{ marginTop: 10, marginLeft: 51 }}>
              {n.status === 'matched' ? (
                <>
                  <p style={{ margin: '0 0 7px', color: MATCHA_DEEP, fontSize: 13, fontWeight: 700 }}>You are both interested</p>
                  {onOpenMatches && <button data-mutu-glass="" type="button" onClick={onOpenMatches} style={primary}>View Matches</button>}
                </>
              ) : n.status === 'interested' ? (
                <>
                  <span style={{ fontSize: 13, fontWeight: 700, color: MATCHA_DEEP }}>Interest saved</span>
                  <p style={{ margin: '3px 0 0', fontSize: 12, lineHeight: 1.4, color: C.ink2 }}>Waiting for mutual interest. A connection will appear in Matches if you both choose Interested.</p>
                </>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  <button data-mutu-glass="" type="button" onClick={() => act(n, 'interested')} disabled={disabled}
                    style={{ ...primary, opacity: disabled ? 0.6 : 1 }}>
                    {busyId === n.id ? 'Saving…' : 'Interested'}
                  </button>
                  <button data-mutu-glass="" type="button" onClick={() => act(n, 'skipped')} disabled={disabled}
                    style={{ border: `1px solid ${C.line}`, borderRadius: 99, padding: '6px 13px', background: C.ground, color: C.ink2, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    Skip
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>}
      <p style={{ fontSize: 11.5, color: C.ink2, margin: '7px 2px 0' }}>
        Your interest is private. We only connect you if it is mutual. Members with a private profile stay anonymous until you connect.
      </p>
    </section>
  )
}
