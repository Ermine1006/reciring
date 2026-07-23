import { useState, useEffect } from 'react'
import { fetchEventMatches } from '../lib/eventMatch'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#1A1712', textSub: '#6B6152', textMuted: '#9CA3AF', white: '#FFFFFF', border: '#EFEAE0',
}

/**
 * "People to meet here" — the payoff of the join-intent capture. Shows the
 * current user a ranked list of other attendees whose need/offer complements
 * theirs (v1 rule-based matcher in lib/eventMatch). Only rendered once the user
 * has joined; if they joined without stating intentions, it nudges them to add
 * some rather than showing an empty list.
 */
export default function EventMatchList({ eventId, userId }) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [needsIntentions, setNeedsIntentions] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchEventMatches(eventId, userId).then(({ data, needsMyIntentions }) => {
      if (!alive) return
      setNeedsIntentions(Boolean(needsMyIntentions))
      setMatches(data || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [eventId, userId])

  if (loading) return null

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 18 }}>✨</span>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.ink, margin: 0, fontFamily: 'Fraunces, Georgia, serif' }}>
        People to meet here
      </h3>
    </div>
  )

  if (needsIntentions) {
    return (
      <section style={{ marginTop: 20 }}>
        {header}
        <div style={{ background: C.goldBg, border: `1px solid ${C.goldLight}`, borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ margin: 0, fontSize: 13, color: C.goldDark, lineHeight: 1.5 }}>
            Add what you're looking for and what you can offer at this event, and we'll suggest who to meet.
          </p>
        </div>
      </section>
    )
  }

  if (matches.length === 0) {
    return (
      <section style={{ marginTop: 20 }}>
        {header}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
            No strong matches yet — check back as more people join and add what they're after.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section style={{ marginTop: 20 }}>
      {header}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {matches.slice(0, 8).map(m => (
          <div key={m.userId} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
                {m.name}{m.program ? <span style={{ color: C.textMuted, fontWeight: 500 }}>{' · '}{m.program}</span> : null}
              </span>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: C.goldDark }}>{m.reason}</p>
            {m.need && (
              <p style={{ margin: '0 0 4px', fontSize: 13, color: C.ink, lineHeight: 1.4 }}>
                <span style={{ color: C.textMuted, fontWeight: 600 }}>Needs: </span>{m.need}
              </p>
            )}
            {m.offer && (
              <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.4 }}>
                <span style={{ color: C.textMuted, fontWeight: 600 }}>Offers: </span>{m.offer}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
