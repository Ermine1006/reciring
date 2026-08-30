import { useState } from 'react'
import { mutualFit, formatWindow } from '../../lib/practiceMatching'
import { PRACTICE_TYPE_SHORT } from '../../data/practiceOptions'
import { MATCHA_DEEP, MATCHA_SOFT } from '../../lib/matchaCta'

// One potential practice partner. Answers exactly five things:
// what I practise, what I support, when we can meet, what tapping
// does, and what shared reward exists. One dominant CTA:
//   time chip selected → "Invite to practise · Thu 10:00 AM" (sends a
//   slot-bound invitation — it does NOT book until they accept)
//   no usable times   → "Invite to practise" (choose a time together)
// Anonymity is stated exactly once (the lock line). Turn-taking, not
// trading: two rounds, one for each person.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'
const short = (t) => PRACTICE_TYPE_SHORT[t] || t
const overlap = (a = [], b = []) => a.filter((t) => b.includes(t))

// "Thu 10:00 AM"
function chipTime(w, tz) {
  const d = new Date(w.starts_at)
  const day = new Intl.DateTimeFormat('en-CA', { weekday: 'short', timeZone: tz }).format(d)
  const time = new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
    .format(d).replace(/\s?([ap])\.m\./, (m, p) => ` ${p.toUpperCase()}M`)
  return `${day} ${time}`
}

export default function PartnerCard({ row, myRequest, onInvite, busy }) {
  const windows = (Array.isArray(row.windows) ? row.windows : [])
    .filter((w) => new Date(w.starts_at) > new Date(Date.now() + 2 * 60_000))
  const [slotId, setSlotId] = useState(windows[0]?.id || null)

  if (!myRequest || !mutualFit(myRequest, row)) return null

  const youPractise = overlap(row.help_types, myRequest.want_types)[0]
  const youHelpWith = overlap(row.want_types, myRequest.help_types)[0]
  const slot = windows.find((w) => w.id === slotId) || null

  return (
    <div style={{
      background: C.white, borderRadius: 18, border: `1px solid ${C.line}`,
      padding: '16px 16px 14px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
          textTransform: 'uppercase', color: MATCHA_DEEP, background: MATCHA_SOFT,
          border: '1px solid #DDE3CE', borderRadius: 8, padding: '3px 10px', fontFamily: FONT,
        }}>
          Mock interview
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.ink3, fontFamily: FONT }}>
          Potential mock interview partner
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', fontFamily: FONT }}>
          {short(youPractise)} + {short(youHelpWith)} mock interview
        </h3>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
          color: '#fff', background: MATCHA_DEEP, borderRadius: 99, padding: '4px 11px',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Good practice fit
        </span>
      </div>

      {/* Two rounds, one each — the small ↔ on the divider is the only
          two-way indicator (turn-taking, not trade imagery). */}
      <div style={{ display: 'flex', background: '#F7F5F0', borderRadius: 12, padding: '10px 0', marginBottom: 12 }}>
        <div style={{ flex: 1, padding: '0 14px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink3, fontFamily: FONT }}>Your practice round</p>
          <p style={{ margin: '3px 0 0', fontSize: 14.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>{short(youPractise)}</p>
        </div>
        <div style={{ width: 20, position: 'relative', display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: C.line }} />
          <span aria-hidden="true" style={{ position: 'relative', background: '#F7F5F0', color: MATCHA_DEEP, fontSize: 12, fontWeight: 700, padding: '2px 0', fontFamily: FONT }}>↔</span>
        </div>
        <div style={{ flex: 1, padding: '0 14px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink3, fontFamily: FONT }}>Your support round</p>
          <p style={{ margin: '3px 0 0', fontSize: 14.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>{short(youHelpWith)}</p>
        </div>
      </div>

      {/* Their times as selectable chips */}
      {windows.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
          {windows.map((w) => {
            const on = slot?.id === w.id
            return (
              <button key={w.id} type="button" onClick={() => setSlotId(on ? null : w.id)}
                title={formatWindow(w.starts_at, w.ends_at, row.timezone)}
                style={{
                  border: `1.5px solid ${on ? MATCHA_DEEP : C.line}`, borderRadius: 10,
                  background: on ? MATCHA_SOFT : C.white, color: on ? MATCHA_DEEP : C.ink,
                  padding: '8px 13px', fontSize: 13, fontWeight: 650, fontFamily: FONT, cursor: 'pointer',
                }}>
                {on ? '✓ ' : ''}{chipTime(w, row.timezone)}
              </button>
            )
          })}
        </div>
      )}

      <p style={{ margin: '0 0 5px', fontSize: 12.5, color: C.ink2, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 7 }}>
        <svg width="13" height="13" fill="none" stroke={C.ink3} viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" />
        </svg>
        Anonymous until you both accept
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, fontWeight: 650, color: C.goldDark, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 7 }}>
        <svg width="15" height="11" viewBox="0 0 44 32" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="15" cy="16" r="11" stroke="#C9A33B" strokeWidth="4" />
          <circle cx="29" cy="16" r="11" stroke="#A6822A" strokeWidth="4" opacity="0.7" />
        </svg>
        Complete both rounds · Unlock a Mutu Token together
      </p>

      {/* One dominant CTA */}
      <button type="button" disabled={busy}
        onClick={() => onInvite(row, slot?.id || null)}
        className="active:scale-[0.98] transition-all"
        style={{
          width: '100%', border: 'none', borderRadius: 13,
          padding: '13px 0', fontSize: 14.5, fontWeight: 700, fontFamily: FONT,
          background: MATCHA_DEEP, color: '#fff',
          cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
          boxShadow: '0 2px 10px rgba(92,106,62,0.28)',
        }}>
        {busy ? 'Sending…' : slot ? `Invite to practise · ${chipTime(slot, row.timezone)}` : 'Invite to practise'}
      </button>
      {slot && (
        <button type="button" disabled={busy} onClick={() => onInvite(row, null)}
          style={{
            display: 'block', margin: '7px auto 0', border: 'none', background: 'none',
            padding: 2, fontSize: 12.5, fontWeight: 650, color: C.ink3,
            fontFamily: FONT, cursor: busy ? 'wait' : 'pointer', textDecoration: 'underline',
          }}>
          Choose another time
        </button>
      )}
      {!slot && windows.length === 0 && (
        <p style={{ margin: '7px 0 0', fontSize: 11.5, color: C.ink3, textAlign: 'center', fontFamily: FONT }}>
          You'll choose a time together after you match.
        </p>
      )}
    </div>
  )
}
