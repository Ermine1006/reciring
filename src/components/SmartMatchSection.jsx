import { useEffect, useState, useCallback } from 'react'
import AnonymousAvatar from './AnonymousAvatar'
import { generateSmartMatches, fetchPendingNudges, setNudgeStatus, checkMutualMatch } from '../lib/smartMatch'
import { track } from '../lib/analytics'
import { matchaCta, MATCHA_DEEP, MATCHA_INK } from '../lib/matchaCta'

// ── Smart Match "People you should meet" (Phase 1.3) ─────────────────
//
// Surfaces the `match_nudges` the scorer produced. Peers stay anonymous —
// we show a deterministic bean avatar (seeded on candidate_id) + the
// identity-free reason string + the compatibility score. The viewer can
// mark interest (recorded for the future mutual-interest handshake) or
// skip. Both write match_nudges.status and log a funnel event.
//
// Degrades quietly: if the Edge Function isn't deployed or the table is
// missing, it renders nothing rather than erroring.

const C = {
  ground: '#FFFFFF', ink: '#1A1712', ink2: '#5F584D', ink3: '#9A958B',
  line: '#ECE7DE', gold: '#A6822A', goldBtn: '#C9A33B', goldBtnInk: '#2E2405',
  goldSoft: '#F8F3E5', goldLine: '#E8D9A7',
}
const secHead = { margin: '18px 2px 9px' }
const secTitle = { margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }

export default function SmartMatchSection() {
  const [nudges, setNudges] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  // Nudge ids that turned into a live mutual match — shown with a celebratory
  // state instead of being removed, so the user knows to head to Matches.
  const [matchedIds, setMatchedIds] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    // Read cached pending nudges first. If none, ask the scorer to generate
    // a fresh set, then re-read. This keeps Home fast on repeat visits and
    // only pays the scoring cost when there's nothing to show.
    let { nudges } = await fetchPendingNudges()
    if (nudges.length === 0) {
      const { error } = await generateSmartMatches()
      if (!error) ({ nudges } = await fetchPendingNudges())
    }
    setNudges(nudges)
    setLoading(false)
    if (nudges.length > 0) track('smart_match_shown', { count: nudges.length })
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    setLoading(true)
    await generateSmartMatches()
    const { nudges: fresh } = await fetchPendingNudges()
    // Keep the current suggestions if a refresh yielded nothing (all seen, or a
    // transient failure) so the section never blanks out on Refresh.
    setNudges(prev => (fresh.length > 0 ? fresh : prev))
    setLoading(false)
  }, [])

  const act = useCallback(async (nudge, status) => {
    if (busyId) return
    setBusyId(nudge.id)
    const { error } = await setNudgeStatus(nudge.id, status)
    if (error) { setBusyId(null); return }
    track(status === 'interested' ? 'smart_match_interested' : 'smart_match_skipped',
      { candidate_id: nudge.candidate_id, score: nudge.score })

    // If marking interest completed a mutual match, celebrate in place rather
    // than removing the card. Otherwise the card resolves and drops out.
    if (status === 'interested') {
      const { matched } = await checkMutualMatch(nudge.candidate_id)
      setBusyId(null)
      if (matched) {
        track('smart_match_mutual', { candidate_id: nudge.candidate_id })
        setMatchedIds(prev => new Set(prev).add(nudge.id))
        return
      }
    } else {
      setBusyId(null)
    }
    setNudges(prev => prev.filter(n => n.id !== nudge.id))
  }, [busyId])

  // Render nothing until we know there's something to show — avoids an empty
  // header flashing on Home for users with no suggestions.
  if (loading && nudges.length === 0) return null
  if (!loading && nudges.length === 0) return null

  return (
    <>
      <div style={{ ...secHead, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={secTitle}>People you should meet</h2>
        <button type="button" onClick={refresh} disabled={loading}
          style={{ background: 'none', border: 'none', padding: 0, cursor: loading ? 'default' : 'pointer', color: MATCHA_DEEP, fontWeight: 700, fontSize: 12.5, fontFamily: 'Inter, system-ui, sans-serif', opacity: loading ? 0.5 : 1 }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {nudges.map(n => (
          <div key={n.id}
            style={{ display: 'flex', alignItems: 'center', gap: 11, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 12px', background: C.ground }}>
            <div style={{ flexShrink: 0 }}><AnonymousAvatar seed={n.candidate_id} size={40} /></div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>Anonymous peer</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: MATCHA_INK, background: '#F5F1E7', borderRadius: 99, padding: '2px 8px', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {n.score}% match
                </span>
              </span>
              <span style={{ display: 'block', fontSize: 12.5, color: C.ink2, marginTop: 2, lineHeight: 1.35, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {n.reason}
              </span>
            </div>

            {matchedIds.has(n.id) ? (
              <div style={{ flexShrink: 0, textAlign: 'center', maxWidth: 118 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: C.goldBtnInk, fontFamily: 'Inter, system-ui, sans-serif' }}>🎉 It’s a match!</span>
                <span style={{ display: 'block', fontSize: 11, color: C.ink2, marginTop: 2, fontFamily: 'Inter, system-ui, sans-serif' }}>Find them in Matches to say hi.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => act(n, 'interested')} disabled={busyId === n.id}
                  style={{ border: 'none', borderRadius: 99, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', opacity: busyId === n.id ? 0.6 : 1, ...matchaCta }}>
                  Interested
                </button>
                <button type="button" onClick={() => act(n, 'skipped')} disabled={busyId === n.id}
                  style={{ border: `1px solid ${C.line}`, borderRadius: 99, padding: '6px 13px', background: C.ground, color: C.ink3, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Skip
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: C.ink3, margin: '7px 2px 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
        Marking interest is private — we’ll only connect you if it’s mutual.
      </p>
    </>
  )
}
