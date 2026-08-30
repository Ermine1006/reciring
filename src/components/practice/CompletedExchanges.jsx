import PeerAvatar from '../PeerAvatar'
import { PRACTICE_TYPE_LABELS } from '../../data/practiceOptions'

// Verified exchange history — one SHARED token per verified session,
// appearing identically in both participants' lists. No scores, no
// balances, no ranks: each row is a proof that a reciprocal exchange
// really happened.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

export default function CompletedExchanges({ tokens = [], myUserId, namesById = {} }) {
  if (tokens.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 650, color: C.ink, margin: 0, fontFamily: FONT }}>
          No verified sessions yet
        </p>
        <p style={{ fontSize: 12.5, color: C.ink3, margin: '5px 0 0', lineHeight: 1.5, fontFamily: FONT }}>
          Complete a session and confirm it from both sides, and your first shared
          Mutu Token will appear here.
        </p>
      </div>
    )
  }

  // Repeat-pair counts per counterpart (depth, shown as a quiet label).
  const perPeer = {}
  for (const t of tokens) {
    const peer = t.user_lo === myUserId ? t.user_hi : t.user_lo
    perPeer[peer] = (perPeer[peer] || 0) + 1
  }

  return (
    <div style={{ padding: '4px 16px 24px', maxWidth: 560, margin: '0 auto' }}>
      <p style={{ fontSize: 12.5, color: C.ink2, margin: '8px 0 12px', lineHeight: 1.5, fontFamily: FONT }}>
        {tokens.length} verified session{tokens.length === 1 ? '' : 's'} ·{' '}
        {Object.keys(perPeer).length} mock interview partner{Object.keys(perPeer).length === 1 ? '' : 's'}
      </p>
      {tokens.map((t) => {
        const peerId = t.user_lo === myUserId ? t.user_hi : t.user_lo
        const name = namesById[peerId] || 'Mock interview partner'
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: C.white, borderRadius: 14, border: `1px solid ${C.line}`,
            padding: '12px 14px', marginBottom: 10,
          }}>
            <PeerAvatar name={name} seed={peerId} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                {perPeer[peerId] > 1 && (
                  <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: C.goldDark, background: C.goldBg, border: `1px solid ${C.goldLight}`, borderRadius: 5, padding: '1px 6px' }}>
                    ×{perPeer[peerId]}
                  </span>
                )}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
                {(t.exchange_types || []).map((x) => PRACTICE_TYPE_LABELS[x] || x).join(' + ') || 'Mock interview session'}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 15, color: C.goldDark }}>✦</p>
              <p style={{ margin: 0, fontSize: 10.5, color: C.ink3, fontFamily: FONT }}>{fmtDate(t.verified_at)}</p>
            </div>
          </div>
        )
      })}
      <p style={{ fontSize: 11, color: C.ink3, margin: '4px 0 0', lineHeight: 1.5, fontFamily: FONT }}>
        A Token is a shared record that both people showed up and helped. It can't be bought, spent, or transferred.
      </p>
    </div>
  )
}
