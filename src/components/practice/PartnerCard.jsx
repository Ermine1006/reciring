import AnonymousAvatar from '../AnonymousAvatar'
import { teammateTraitName } from '../../data/practiceTeammateTraits'
import { skillName, responseRecord } from '../../lib/practiceRecommendations'
import { useState } from 'react'
import { mutualFit, formatWindow } from '../../lib/practiceMatching'
import { PRACTICE_TYPE_SHORT } from '../../data/practiceOptions'
import { MATCHA_DEEP, MATCHA_SOFT } from '../../lib/matchaCta'
import { SKILLS_BY_CATEGORY } from '../../data/practiceModes'

// One potential practice partner. Answers exactly five things:
// what I practise, what I support, when we can meet, what tapping
// does, and what shared reward exists. One dominant CTA:
//   time chip selected → "Invite to practise · Thu 10:00 AM" (sends a
//   slot-bound invitation — it does NOT book until they accept)
//   no usable times   → "Invite to practise" (choose a time together)
// Anonymity is stated exactly once (the lock line). Turn-taking, not
// trading: two rounds, one for each person.
//
// One card can also carry `previously_declined`: the server saying
// "you turned down an invitation from this member". Since declining
// no longer hides them from you, the pool would otherwise let you
// invite the very person you just said no to, with no way to tell.
// It reports YOUR OWN action back to you, so it reveals nothing new,
// and it is never set the other way round — being declined stays
// private to the person who declined.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: 'var(--mutu-surface, #FFFFFF)',
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

export default function PartnerCard({ row, myRequest, onInvite, busy, compact = false }) {
  const Signals = compact ? 'details' : 'div'
  const windows = (Array.isArray(row.windows) ? row.windows : [])
    .filter((w) => new Date(w.starts_at) > new Date(Date.now() + 2 * 60_000))
  const [slotId, setSlotId] = useState(windows[0]?.id || null)

  if (!myRequest || !mutualFit(myRequest, row)) return null

  const youPractise = overlap(row.help_types, myRequest.want_types)[0]
  const youHelpWith = overlap(row.want_types, myRequest.help_types)[0]
  const rec = row.recommendation
  const response = responseRecord(rec?.response_record)
  const focusKeys = (myRequest.want_types || []).flatMap(type => (SKILLS_BY_CATEGORY[type] || []).map(skill => skill.key))
  const relevant = ([...new Set([...(rec?.peer_relevant_skills || []), ...(rec?.relevant_skills || [])])])
    .filter(key => focusKeys.includes(key)).map(skillName).filter(Boolean)
  const skills = (rec?.support_skills || []).map(skillName).filter(Boolean)
  const history = rec?.practice_history && Number.isInteger(rec.practice_history.sessions) && Number.isInteger(rec.practice_history.partners) && rec.practice_history.sessions >= rec.practice_history.partners && rec.practice_history.partners >= 0 ? rec.practice_history : null
  const evidence = (rec?.peer_strengths || []).filter(e => Number.isInteger(e.partners) && e.partners > 0)
  const peerSkills = evidence.filter(e => skillName(e.skill))
  const traits = evidence.filter(e => teammateTraitName(e.skill))
  const slot = windows.find((w) => w.id === slotId) || null

  return (
    <div className={compact ? 'garden-compact-partner' : undefined} style={{
      background: C.white, borderRadius: 24, border: `1px solid ${C.line}`,
      padding: '22px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ flexShrink: 0 }}><AnonymousAvatar seed={`practice:${row.request_id}`} size={64} /></div>
        <div style={{ minWidth: 0 }}><h3 style={{ margin: '0 0 5px', fontSize: 21, color: C.ink }}>Your next teammate</h3>
          <p style={{ margin: 0, color: C.ink2, fontSize: 13 }}>{short(youPractise)} practice · Community member</p>
          <p style={{ margin: '6px 0 0', color: C.ink2, fontSize: 12 }}>Identity hidden until you both accept</p>
        </div>
      </div>
      {/* A shared count of zero says "beginner" to anyone reading the
          card, which is wrong for the many members who arrive mid cycle
          having practised elsewhere, and it is the discouraging empty
          state our own principles rule out. Someone with nothing
          confirmed yet gets a plain, neutral line instead of a 0. */}
      {history && (history.sessions > 0
        ? <div style={{ display: 'flex', gap: 28, paddingBottom: 16, marginBottom: 18, borderBottom: `1px solid ${C.line}` }}>
            <div><strong style={{ fontSize: 24 }}>{history.sessions}</strong><div style={{ color: C.ink2, fontSize: 12 }}>practices completed</div></div>
            <div><strong style={{ fontSize: 24 }}>{history.partners}</strong><div style={{ color: C.ink2, fontSize: 12 }}>different partners</div></div>
          </div>
        : <div style={{ paddingBottom: 16, marginBottom: 18, borderBottom: `1px solid ${C.line}` }}>
            <p style={{ margin: 0, fontSize: 13, color: C.ink2 }}>New to practising on Mutu</p>
          </div>)}
      <div style={{ background: MATCHA_SOFT, color: MATCHA_DEEP, borderRadius: 14, padding: 14, marginBottom: 18, fontSize: 13, lineHeight: 1.5 }}>
        <strong style={{ display: 'block', fontSize: 11, marginBottom: 5 }}>WHY YOU COULD HELP EACH OTHER</strong>
        {relevant.length ? `They can support your focus: ${relevant.join(', ')}.` : `They can support your ${short(youPractise).toLowerCase()} practice.`} You can help with {short(youHelpWith).toLowerCase()}.
      </div>
      <Signals className={compact ? 'garden-partner-signals' : undefined} style={{ fontFamily: FONT, fontSize: 13, lineHeight: 1.5 }}>
        {compact && <summary>Skills & response history</summary>}
        {peerSkills.length > 0 && <BadgeGroup title="Skills recognised by partners" entries={peerSkills} label={skillName} />}
        {traits.length > 0 && <BadgeGroup title="What partners appreciate" entries={traits} label={teammateTraitName} green />}
        {skills.length > 0 && <div style={{ marginBottom: 18 }}><p style={{ margin: '0 0 8px', color: C.ink2 }}>Happy to help with</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{skills.map(s => <span key={s} style={{ padding: '6px 10px', background: '#F7F5F0', borderRadius: 10 }}>{s}</span>)}</div>
          <small style={{ color: C.ink2 }}>Chosen by this member</small></div>}
        {!peerSkills.length && !traits.length && <p style={{ color: C.ink2 }}>No shared partner feedback yet</p>}
        <p style={{ margin: '16px 0 4px' }}>{response ? `Answered ${rec.response_record.prompt} of ${rec.response_record.total} invitations within 48h` : 'No shared invitation response history yet'}</p>
        {response && <small style={{ color: C.ink2 }}>Accepting or declining both count · Last 90 days</small>}
        {rec?.similar_response === true && response && <p style={{ color: MATCHA_DEEP }}>Similar invitation response habits</p>}
        <details style={{ color: C.ink2, fontSize: 12, margin: '14px 0 18px' }}><summary style={{ cursor: 'pointer', minHeight: 32 }}>What these signals mean</summary>
          <p>Practice totals count sessions confirmed by both people in this community. Each partner counts once per badge. Responsive is partner feedback about coordination. Invitation responses do not measure chat reply speed.</p>
          <p>Members choose what to share. Missing records do not mean poor performance. Improvement tips stay private.</p>
        </details>
      </Signals>

      {/* Their times as selectable chips */}
      {windows.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
          {windows.map((w) => {
            const on = slot?.id === w.id
            return (
              <button data-mutu-glass="" key={w.id} type="button" onClick={() => setSlotId(on ? null : w.id)}
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

      {/* Your own past decline, said plainly and without judgement.
          It sits directly above the CTA because that is the moment
          it changes a decision. Absent on an un-migrated server, and
          the card simply reads as it always did. */}
      {row.previously_declined === true && (
        <p style={{
          margin: '0 0 12px', padding: '9px 11px', background: '#F7F5F0',
          borderRadius: 10, fontSize: 12.5, lineHeight: 1.45, color: C.ink2,
          fontFamily: FONT, display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.ink3}
            strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" />
          </svg>
          <span>
            You declined an invitation from this member before. You can still
            invite them if you would like to.
          </span>
        </p>
      )}

      {/* One dominant CTA */}
      <button data-mutu-glass="" type="button" disabled={busy}
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

function BadgeGroup({ title, entries, label, green = false }) {
  return <div style={{ marginBottom: 18 }}><p style={{ margin: '0 0 8px', color: C.ink2 }}>{title}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{entries.map(e => <span key={e.skill} style={{ borderRadius: 10, padding: '7px 10px', background: green ? MATCHA_SOFT : C.goldBg, color: green ? MATCHA_DEEP : C.goldDark, border: `1px solid ${green ? '#DDE3CE' : C.goldLight}` }}>✓ {label(e.skill)} <small>· {e.partners} {e.partners === 1 ? 'partner' : 'partners'}</small></span>)}</div>
  </div>
}
