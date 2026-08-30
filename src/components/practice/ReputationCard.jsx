import { formatFollowThrough } from '../../lib/reputation'
import { MATCHA_DEEP, MATCHA_SOFT } from '../../lib/matchaCta'

// The current user's OWN verified reputation for this community —
// observable behaviour only, no generic score. Percentages hide
// below the minimum sample. (Partner reputation on anonymous cards
// needs server-side aggregates — a deferred backend requirement.)

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

function Stat({ value, label }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.ink, fontFamily: FONT }}>{value}</p>
      <p style={{ margin: '1px 0 0', fontSize: 10.5, color: C.ink3, fontFamily: FONT }}>{label}</p>
    </div>
  )
}

export default function ReputationCard({ reputation }) {
  if (!reputation) return null
  const r = reputation
  const ft = formatFollowThrough(r.followThrough)
  const next = r.nextBadge

  return (
    <div style={{
      background: C.white, borderRadius: 16, border: `1px solid ${C.line}`,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15, color: C.goldDark }}>✦</span>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
          {r.label}
        </p>
      </div>

      {r.verifiedCount === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: C.ink2, lineHeight: 1.5, fontFamily: FONT }}>
          Complete your first verified session to start building your reputation.
          Every number here comes from real, mutually confirmed sessions.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <Stat value={r.verifiedCount} label="Verified sessions" />
          <Stat value={r.uniquePartners} label="People helped" />
          {ft && <Stat value={ft} label="Follow-through" />}
          {r.repeatPartners > 0 && <Stat value={r.repeatPartners} label="Repeat partners" />}
        </div>
      )}

      {next && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 650, color: C.ink2, fontFamily: FONT }}>
              Next: {next.label}
            </span>
            <span style={{ fontSize: 11, color: C.ink3, fontFamily: FONT }}>
              {next.desc}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: MATCHA_SOFT, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.round(next.progress * 100)}%`,
              background: MATCHA_DEEP, borderRadius: 99, transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  )
}
