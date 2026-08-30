// An existing community Event inside the unified Exchange feed.
// Reuses the Events backend as-is. NO token is promised: events have
// no reliable completion-verification mechanism today (deferred
// backend requirement) — the card is honest about that by simply
// not mentioning a reward.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

function fmtEventTime(iso) {
  const d = new Date(iso)
  const s = new Intl.DateTimeFormat('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
  return s.replace(/, (\d)/, ' · $1').replace(/\ba\.m\./, 'AM').replace(/\bp\.m\./, 'PM')
}

export default function ExchangeEventCard({ event, onOpen }) {
  return (
    <div style={{
      background: C.white, borderRadius: 18, border: `1px solid ${C.line}`,
      padding: '15px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: C.goldDark, background: C.goldBg, border: `1px solid ${C.goldLight}`,
          borderRadius: 6, padding: '2.5px 8px', fontFamily: FONT,
        }}>
          Community Event{event.category ? ` · ${event.category}` : ''}
        </span>
      </div>

      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: FONT, lineHeight: 1.3 }}>
        {event.title}
      </p>
      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: C.ink2, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="14" height="14" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
        {fmtEventTime(event.start_at)}
        {event.location ? ` · ${event.location}` : ''}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: C.ink3, fontFamily: FONT }}>
        {event.attendee_count > 0
          ? `${event.attendee_count} going · show up and take part with the community`
          : 'Show up and take part with the community'}
      </p>

      <button
        type="button" onClick={() => onOpen(event.id)}
        className="active:scale-[0.98] transition-all"
        style={{
          width: '100%', border: `1px solid ${C.goldLight}`, background: C.goldBg,
          color: C.goldDark, borderRadius: 12, padding: '10px 0',
          fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
        }}>
        View event →
      </button>
    </div>
  )
}
