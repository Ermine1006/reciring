import AnonymousAvatar from '../AnonymousAvatar'
import { PRACTICE_TYPE_LABELS } from '../../data/practiceOptions'
import { formatWindow } from '../../lib/practiceMatching'
import { matchaCta } from '../../lib/matchaCta'

// Incoming + outgoing Practice invitations. BOTH directions stay
// anonymous until acceptance — the pairing view exposes only the
// snapshots, and we render the bean avatar accordingly.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

const labels = (types = []) => types.map((t) => PRACTICE_TYPE_LABELS[t] || t).join(', ')

function daysLeft(expiresAt) {
  const d = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  return d <= 0 ? 'expiring' : `${d}d left`
}

function Row({ p, incoming, onAccept, onDecline, onWithdraw, busy }) {
  const snap = p.their_snapshot || {}
  return (
    <div style={{
      background: C.white, borderRadius: 14, border: `1px solid ${C.line}`,
      padding: '12px 14px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <AnonymousAvatar seed={p.id} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: C.ink, fontFamily: FONT }}>
            Anonymous Rotman member
          </p>
          <p style={{ margin: '1px 0 0', fontSize: 11, color: C.ink3, fontFamily: FONT }}>
            {incoming ? 'Invited you to practise' : 'You invited them'} · {daysLeft(p.expires_at)}
          </p>
        </div>
      </div>

      <p style={{ margin: '0 0 3px', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.45 }}>
        <strong style={{ color: C.goldDark }}>They want to practise:</strong> {labels(snap.want_types)}
        {snap.want_focus ? `: “${snap.want_focus}”` : ''}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.45 }}>
        <strong style={{ color: C.goldDark }}>They can help you with:</strong> {labels(snap.help_types)}
        {snap.help_context ? ` (${snap.help_context})` : ''}
      </p>

      {/* Proposed time, when the invitation carries one */}
      {p.proposed_starts_at && (
        <div style={{
          background: C.goldBg, border: `1px solid ${C.goldLight}`, borderRadius: 10,
          padding: '8px 12px', marginBottom: 10,
        }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.goldDark, fontFamily: FONT }}>
            {incoming ? 'Proposed time' : 'You proposed'}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.ink, fontFamily: FONT }}>
            {formatWindow(p.proposed_starts_at, p.proposed_ends_at, p.proposed_timezone || 'America/Toronto')}
          </p>
        </div>
      )}

      {incoming ? (
        <>
          {/* ONE action, with its consequence stated right underneath */}
          <button type="button" disabled={busy} onClick={() => onAccept(p)}
            className="active:scale-[0.98] transition-all"
            style={{
              width: '100%', border: 'none', borderRadius: 11, padding: '12px 0',
              fontSize: 13.5, fontWeight: 700, fontFamily: FONT,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              ...matchaCta,
            }}>
            {busy ? 'Accepting…' : 'Practise together'}
          </button>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: C.ink2, lineHeight: 1.5, fontFamily: FONT, textAlign: 'center' }}>
            {p.proposed_starts_at
              ? `Accepting reveals your names and schedules ${formatWindow(p.proposed_starts_at, p.proposed_ends_at, p.proposed_timezone || 'America/Toronto')}.`
              : "Accepting reveals your names. You'll choose a time together next."}
          </p>
          <button type="button" disabled={busy} onClick={() => onDecline(p)}
            style={{
              display: 'block', margin: '7px auto 0', border: 'none', background: 'none',
              padding: 3, fontSize: 12, fontWeight: 650, color: C.ink3,
              fontFamily: FONT, cursor: busy ? 'wait' : 'pointer', textDecoration: 'underline',
            }}>
            Decline
          </button>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={() => onWithdraw(p)}
          style={{
            border: `1px solid ${C.line}`, background: C.white, color: C.ink3,
            borderRadius: 11, padding: '8px 14px', fontSize: 12, fontWeight: 600,
            fontFamily: FONT, cursor: busy ? 'wait' : 'pointer',
          }}>
          Withdraw invitation
        </button>
      )}
    </div>
  )
}

export default function InvitationsList({ pairings = [], onAccept, onDecline, onWithdraw, busyId, only = null }) {
  const invited = pairings.filter((p) => p.status === 'invited')
  const incoming = only === 'outgoing' ? [] : invited.filter((p) => !p.i_invited)
  const outgoing = only === 'incoming' ? [] : invited.filter((p) => p.i_invited)

  // Section mode ('only'): the parent decides headings/empty states.
  if (only) {
    const rows = only === 'incoming' ? incoming : outgoing
    return (
      <div style={{ padding: '0 16px', maxWidth: 560, margin: '0 auto' }}>
        {rows.map((p) => (
          <Row key={p.id} p={p} incoming={only === 'incoming'} busy={busyId === p.id}
            onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw} />
        ))}
      </div>
    )
  }

  if (invited.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 650, color: C.ink, margin: 0, fontFamily: FONT }}>No open invitations</p>
        <p style={{ fontSize: 12.5, color: C.ink3, margin: '5px 0 0', lineHeight: 1.5, fontFamily: FONT }}>
          Invite a partner from Explore, or sit tight. If someone invites you, we'll let you know.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 16px 24px', maxWidth: 560, margin: '0 auto' }}>
      {incoming.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: C.ink2, margin: '10px 0 8px', fontFamily: FONT }}>
            For you · {incoming.length}
          </h3>
          {incoming.map((p) => (
            <Row key={p.id} p={p} incoming busy={busyId === p.id}
              onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw} />
          ))}
        </>
      )}
      {outgoing.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: C.ink2, margin: '14px 0 8px', fontFamily: FONT }}>
            Sent by you · {outgoing.length}
          </h3>
          {outgoing.map((p) => (
            <Row key={p.id} p={p} incoming={false} busy={busyId === p.id}
              onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw} />
          ))}
        </>
      )}
    </div>
  )
}
