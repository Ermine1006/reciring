import { describeMeeting, canJoin, NOT_RECORDED } from '../../data/meetingMethods'

// ── Where two people are meeting ────────────────────────────────────
// Shown identically in the chat proposal, the scheduled card, the
// session detail and the Guided Practice lobby, always read from the
// session row (never from message text or local state).
//
// The platform and host are shown instead of a long raw URL, the link
// opens with target="_blank" and rel="noopener noreferrer", and only a
// link that passed validation is ever clickable.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

export default function MeetingDetails({ session, showJoin = true, compact = false }) {
  const m = describeMeeting(session)
  if (!m.recorded) {
    return (
      <p style={{ margin: 0, fontSize: 11.5, color: C.ink3, fontFamily: FONT }}>
        {NOT_RECORDED}
      </p>
    )
  }
  const joinable = showJoin && canJoin(session)
  return (
    <div>
      <p style={{ margin: 0, fontSize: compact ? 12 : 12.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>
        {m.label}
      </p>
      {m.host && (
        <p style={{
          margin: '1px 0 0', fontSize: 11.5, color: C.ink3, fontFamily: FONT,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {m.host}
        </p>
      )}
      {m.location && (
        <p style={{ margin: '1px 0 0', fontSize: 11.5, color: C.ink2, fontFamily: FONT, lineHeight: 1.45 }}>
          {m.location}
        </p>
      )}
      {m.invalid && (
        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#B4232A', fontFamily: FONT, lineHeight: 1.45 }}>
          Ask the sender to add a meeting link
        </p>
      )}
      {joinable && (
        <a href={m.url} target="_blank" rel="noopener noreferrer"
          className="active:scale-[0.98] transition-all"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: 8, minHeight: 44, textDecoration: 'none',
            border: `1px solid ${C.goldLight}`, background: C.goldBg, color: C.goldDark,
            borderRadius: 12, padding: '11px 0', fontSize: 13, fontWeight: 700, fontFamily: FONT,
          }}>
          Join meeting
        </a>
      )}
    </div>
  )
}
