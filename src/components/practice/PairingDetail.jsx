import { useState } from 'react'
import PeerAvatar from '../PeerAvatar'
import SessionConfirmCard from './SessionConfirmCard'
import ExchangeProgress from './ExchangeProgress'
import {
  deriveDisplayState, overlapWindows, formatWindow, formatSessionTime, wallTimeToUtc,
} from '../../lib/practiceMatching'
import {
  PRACTICE_TYPE_LABELS, SESSION_AGENDA, DURATION_OPTIONS, DEFAULT_TIMEZONE,
} from '../../data/practiceOptions'
import { matchaCta } from '../../lib/matchaCta'
import SessionSetupFields, { SessionSummary } from './SessionSetupFields'
import GuidedPractice from './GuidedPractice'
import { guideAvailability } from '../../lib/guidedPractice'
import { describeSession, validateSessionSetup, SESSION_MODES } from '../../data/practiceModes'
import { describeMeeting, canJoin, validateMeetingSetup } from '../../data/meetingMethods'
import MeetingDetails from './MeetingDetails'

// One accepted Practice pairing: identities (revealed at acceptance),
// the agreed exchange (immutable snapshots), the Practice chat link,
// mutual propose→confirm scheduling, the two-round agenda, two-sided
// completion, and the verified-exchange banner.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
  sage: '#2F7A55', sageBg: '#EEF5F0',
}
const FONT = 'Inter, system-ui, sans-serif'

const labels = (types = []) => types.map((t) => PRACTICE_TYPE_LABELS[t] || t).join(', ')

// One-tap "Add to Google Calendar" for a confirmed session (same
// URL-template approach the coffee-chat flow already uses).
function googleCalendarUrl(session, partnerName) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const start = new Date(session.scheduled_start)
  const end = new Date(start.getTime() + session.duration_minutes * 60_000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Mock interview with ${partnerName} · Mutu`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: 'Two rounds. One for you, one for your partner. Afterwards, confirm together in Mutu to unlock your shared Mutu Token.',
    location: session.location_type === 'in_person'
      ? (session.location_detail || 'In person')
      : (session.location_detail || 'Virtual'),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function Card({ children, style }) {
  return (
    <div style={{
      background: C.white, borderRadius: 16, border: `1px solid ${C.line}`,
      padding: '13px 15px', marginBottom: 12, ...style,
    }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p style={{ margin: '0 0 6px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: C.gold, fontFamily: FONT }}>
      {children}
    </p>
  )
}

const inputStyle = {
  border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px',
  fontSize: 13, fontFamily: FONT, color: C.ink, background: C.white,
  outline: 'none', boxSizing: 'border-box',
}

// One shared block renders the agreement wherever a session appears,
// so the proposer, the receiver and the scheduled card read the same.
function SessionAgreement({ session }) {
  const d = describeSession(session)
  if (!d.structured) {
    return (
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9A958B', fontFamily: FONT }}>
        Mock interview mode: Not recorded
      </p>
    )
  }
  return (
    <div style={{ margin: '0 0 9px' }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#18160F', fontFamily: FONT }}>
        {d.title}
      </p>
      <p style={{ margin: '1px 0 0', fontSize: 12, color: '#6E6A61', fontFamily: FONT }}>
        {d.detail}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#6E7F4A', fontFamily: FONT, lineHeight: 1.45 }}>
        {d.agreement}
      </p>
    </div>
  )
}

export default function PairingDetail({
  pairing, session, confirmations = [], pairingWindows = [],
  myUserId, counterpartName, busy,
  onBack, onOpenChat, onPropose, onConfirmTime, onDeclineTime,
  onWithdrawTime, onCancelSession, onSubmitConfirmation, onEndPairing,
  sessionModesSupported = false, feedbackSupported = false, onViewProgress,
}) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scheduleAgain, setScheduleAgain] = useState(false)
  const tz = pairing?.my_snapshot?.timezone || DEFAULT_TIMEZONE
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(pairing?.my_snapshot?.duration_minutes || 60)
  const [locationType, setLocationType] = useState('virtual')
  const [locationDetail, setLocationDetail] = useState('')
  const [err, setErr] = useState(null)
  // nothing is preselected: the user chooses a mode deliberately
  const [setup, setSetup] = useState({
    mode: null, category: null, skillFocus: null,
    meetingMethod: null, meetingUrl: '', meetingLocation: '',
  })
  const [guideOpen, setGuideOpen] = useState(false)

  const myConfirmed = confirmations.some((c) => c.user_id === myUserId)
  const state = deriveDisplayState({ pairing, session, myUserId, myConfirmed })
  const name = counterpartName || 'your partner'
  const partnerUserId = pairing?.counterpart_user_id

  const mine = pairingWindows.filter((w) => w.is_mine)
  const theirs = pairingWindows.filter((w) => !w.is_mine)
  const shared = overlapWindows(mine, theirs, 45)

  const setupCheck = validateSessionSetup(setup)
  const meetingCheck = validateMeetingSetup({
    method: setup.meetingMethod, url: setup.meetingUrl, location: setup.meetingLocation,
  })
  const propose = () => {
    setErr(null)
    if (sessionModesSupported && !setupCheck.ok) return setErr(setupCheck.message)
    if (!meetingCheck.ok) return setErr(meetingCheck.message)
    if (!date || !time) return setErr('Pick a date and time.')
    const startsAt = wallTimeToUtc(date, time, tz)
    if (new Date(startsAt) <= new Date()) return setErr('Pick a time in the future.')
    onPropose({
      scheduledStart: startsAt,
      meetingMethod: setup.meetingMethod,
      meetingUrl: setup.meetingUrl,
      meetingLocation: setup.meetingLocation,
      // the mode decides the length people should expect
      durationMinutes: sessionModesSupported && setup.mode
        ? SESSION_MODES[setup.mode].approxMinutes : duration,
      timezone: tz, locationType, locationDetail,
      ...(sessionModesSupported
        ? { sessionMode: setup.mode, interviewCategory: setup.category, skillFocus: setup.skillFocus }
        : {}),
    })
  }

  const fillFromWindow = (w) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).formatToParts(new Date(w.starts_at)).map((p) => [p.type, p.value])
    )
    setDate(`${parts.year}-${parts.month}-${parts.day}`)
    setTime(`${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`)
  }

  // "You practise" but "Maya practises" — and when the snapshot holds
  // no types, say so instead of rendering a sentence with holes in it.
  const snapLine = (snap, who, isYou = false) => {
    const want = labels(snap?.want_types)
    const help = labels(snap?.help_types)
    return (
      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: C.ink2, lineHeight: 1.5, fontFamily: FONT }}>
        <strong style={{ color: C.ink }}>{who}</strong>
        {want || help
          ? <>
              {isYou ? ' practise ' : ' practises '}{want || 'anything'}
              {snap?.want_focus ? ` (“${snap.want_focus}”)` : ''}
              {isYou ? ' and interview for ' : ' and interviews for '}{help || 'anything'}.
            </>
          : ' did not record practice types.'}
      </p>
    )
  }

  // The guide takes over the screen while it is open: one stage at a
  // time, nothing else competing for attention.
  if (guideOpen && session) {
    return (
      <div style={{ minHeight: '100%', background: '#F9F7F4', paddingTop: 10 }}>
        <GuidedPractice
          session={session}
          pairing={pairing}
          userId={myUserId}
          partnerName={name}
          onClose={() => setGuideOpen(false)}
          onConfirmPractice={() => setGuideOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
      <div style={{ padding: '10px 16px 28px', maxWidth: 560, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button type="button" onClick={onBack} aria-label="Back"
            style={{ border: 'none', background: 'none', padding: 6, cursor: 'pointer' }}>
            <svg width="18" height="18" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <PeerAvatar name={name} seed={partnerUserId || pairing?.id} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: FONT }}>{name}</p>
            <p style={{ margin: '1px 0 0', fontSize: 11.5, color: C.goldDark, fontFamily: FONT }}>Mock interview partner · identities revealed</p>
          </div>
          {pairing?.match_id && (
            <button type="button" onClick={() => onOpenChat(pairing.match_id)}
              style={{
                border: `1px solid ${C.goldLight}`, background: C.goldBg, color: C.goldDark,
                borderRadius: 11, padding: '8px 13px', fontSize: 12, fontWeight: 700,
                fontFamily: FONT, cursor: 'pointer', flexShrink: 0,
              }}>
              Open chat
            </button>
          )}
          {/* Overflow: exception handling lives out of the happy path */}
          {onEndPairing && pairing?.status === 'accepted' && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button type="button" aria-label="More options" onClick={() => setMenuOpen(!menuOpen)}
                style={{ border: 'none', background: 'none', padding: '6px 4px', cursor: 'pointer', color: C.ink3, fontSize: 18, lineHeight: 1 }}>
                ⋯
              </button>
              {menuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 30, zIndex: 40,
                  background: C.white, border: `1px solid ${C.line}`, borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, minWidth: 170,
                }}>
                  <button type="button"
                    onClick={() => { setMenuOpen(false); setConfirmEnd(true) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', border: 'none',
                      background: 'none', padding: '9px 12px', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, color: '#B4232A', fontFamily: FONT, cursor: 'pointer',
                    }}>
                    Leave this partnership
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Matched → Scheduled → Completed together */}
        <Card>
          <ExchangeProgress state={state} />
        </Card>

        {/* The agreed exchange (immutable snapshots) */}
        <Card>
          <SectionLabel>Your two rounds</SectionLabel>
          {snapLine(pairing?.my_snapshot, 'You', true)}
          {snapLine(pairing?.their_snapshot, name)}
          {state !== 'verified' && state !== 'disputed' && (
            <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 650, color: C.goldDark, fontFamily: FONT }}>
              ✦ Complete both rounds · Unlock a Mutu Token together
            </p>
          )}
        </Card>

        {/* Scheduling */}
        {(state === 'scheduling' || (state === 'verified' && scheduleAgain)) && (
          <Card>
            <SectionLabel>Pick a time: one proposes, the other confirms</SectionLabel>
            {shared.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ margin: '0 0 4px', fontSize: 11.5, color: C.ink2, fontFamily: FONT }}>You're both free:</p>
                {shared.slice(0, 4).map((w, i) => (
                  <button key={i} type="button" onClick={() => fillFromWindow(w)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', marginBottom: 4,
                      border: `1px solid ${C.goldLight}`, background: C.goldBg, color: C.goldDark,
                      borderRadius: 9, padding: '7px 11px', fontSize: 12, fontWeight: 600,
                      fontFamily: FONT, cursor: 'pointer',
                    }}>
                    {formatWindow(w.starts_at, w.ends_at, tz)}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input type="date" style={{ ...inputStyle, flex: 1.3 }} value={date} onChange={(e) => setDate(e.target.value)} />
              <input type="time" style={{ ...inputStyle, flex: 1 }} value={time} onChange={(e) => setTime(e.target.value)} />
              <select style={{ ...inputStyle, flex: 1 }} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <select style={{ ...inputStyle, flex: 1 }} value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                <option value="virtual">Virtual</option>
                <option value="in_person">In person</option>
              </select>
              <input style={{ ...inputStyle, flex: 1.6 }} value={locationDetail} maxLength={120}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder={locationType === 'virtual' ? 'Zoom / Meet link (optional)' : 'Where?'} />
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink3, fontFamily: FONT }}>
              Times are in {tz.replace('America/', '')} time.
            </p>
            {err && <p role="alert" style={{ margin: '0 0 8px', fontSize: 12, color: '#B4232A', fontFamily: FONT }}>{err}</p>}
            {/* The agreement: mode → interview type → focus, then the
                summary both people will see. */}
            <div style={{ margin: '4px 0 12px' }}>
              <SessionSetupFields
                value={setup}
                onChange={setSetup}
                supported={sessionModesSupported}
                compact
              />
            </div>
            {sessionModesSupported && setupCheck.ok && (
              <div style={{ margin: '0 0 12px' }}>
                <SessionSummary
                  setup={setup}
                  whenLabel={date && time
                    ? formatSessionTime(wallTimeToUtc(date, time, tz), SESSION_MODES[setup.mode].approxMinutes, tz)
                    : null}
                />
              </div>
            )}
            <button type="button" disabled={busy} onClick={propose}
              className="active:scale-[0.98] transition-all"
              style={{
                width: '100%', border: 'none', borderRadius: 12, padding: '11px 0',
                fontSize: 13, fontWeight: 700, fontFamily: FONT,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, ...matchaCta,
              }}>
              {busy ? 'Proposing…' : `Propose this time to ${name}`}
            </button>
          </Card>
        )}

        {(state === 'proposal_sent' || state === 'proposal_received') && session && (
          <Card>
            <SectionLabel>{state === 'proposal_sent' ? 'You proposed' : `${name} proposed`}</SectionLabel>
            <SessionAgreement session={session} />
            <div style={{ margin: '0 0 10px' }}>
              <MeetingDetails session={session} showJoin={false} compact />
            </div>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 650, color: C.ink, fontFamily: FONT }}>
              {formatSessionTime(session.scheduled_start, session.duration_minutes, session.timezone)}
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
              {session.location_type === 'in_person' ? 'In person' : 'Virtual'}
              {session.location_detail ? ` · ${session.location_detail}` : ''}
            </p>
            {state === 'proposal_received' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={busy} onClick={onDeclineTime}
                  style={{
                    flex: 1, border: `1px solid ${C.line}`, background: C.white, color: C.ink2,
                    borderRadius: 11, padding: '10px 0', fontSize: 12.5, fontWeight: 600,
                    fontFamily: FONT, cursor: busy ? 'wait' : 'pointer',
                  }}>
                  Suggest another time
                </button>
                <button type="button" disabled={busy || describeMeeting(session).invalid} onClick={onConfirmTime}
                  className="active:scale-[0.98] transition-all"
                  style={{
                    flex: 1.4, border: 'none', borderRadius: 11, padding: '10px 0',
                    fontSize: 12.5, fontWeight: 700, fontFamily: FONT,
                    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, ...matchaCta,
                  }}>
                  {busy ? 'Confirming…' : 'Confirm this time'}
                </button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={onWithdrawTime}
                style={{
                  border: `1px solid ${C.line}`, background: C.white, color: C.ink3,
                  borderRadius: 11, padding: '8px 14px', fontSize: 12, fontWeight: 600,
                  fontFamily: FONT, cursor: busy ? 'wait' : 'pointer',
                }}>
                Withdraw & propose a different time
              </button>
            )}
          </Card>
        )}

        {state === 'scheduled' && session && (
          <>
            <Card style={{ border: `1px solid ${C.goldLight}` }}>
              <SectionLabel>Scheduled</SectionLabel>
              <SessionAgreement session={session} />
              <div style={{ margin: '0 0 12px' }}>
                <MeetingDetails session={session} />
              </div>
              <p style={{ margin: '0 0 2px', fontSize: 14.5, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
                {formatSessionTime(session.scheduled_start, session.duration_minutes, session.timezone)}
              </p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
                {session.location_type === 'in_person' ? 'In person' : 'Virtual'}
                {session.location_detail ? ` · ${session.location_detail}` : ''}
              </p>
              {(() => {
                const g = guideAvailability({ session, pairing, userId: myUserId })
                if (!g.ok) {
                  return g.reason === 'format_not_recorded' ? (
                    <p style={{ margin: '0 0 10px', fontSize: 11.5, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
                      Guided mock interview is unavailable because this session’s format was not recorded.
                    </p>
                  ) : null
                }
                const started = new Date(session.scheduled_start) <= new Date()
                return (
                  <button type="button" onClick={() => setGuideOpen(true)}
                    className="active:scale-[0.98] transition-all"
                    style={{
                      width: '100%', marginBottom: 10, border: 'none', borderRadius: 12,
                      padding: '12px 0', fontSize: 13.5, fontWeight: 700, fontFamily: FONT,
                      cursor: 'pointer', minHeight: 44, ...matchaCta,
                    }}>
                    {started ? 'Start guided mock interview' : 'Review guide'}
                  </button>
                )
              })()}
              <a
                href={googleCalendarUrl(session, name)}
                target="_blank" rel="noopener noreferrer"
                className="active:scale-[0.98] transition-all"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', boxSizing: 'border-box', textDecoration: 'none',
                  border: `1px solid ${C.goldLight}`, background: C.goldBg,
                  color: C.goldDark, borderRadius: 12, padding: '11px 0',
                  fontSize: 13, fontWeight: 700, fontFamily: FONT,
                }}>
                <svg width="15" height="15" fill="none" stroke={C.goldDark} viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M12 15v4M10 17h4" />
                </svg>
                Add to Google Calendar
              </a>
              <button type="button" disabled={busy} onClick={onCancelSession}
                style={{
                  display: 'block', margin: '10px auto 0',
                  border: 'none', background: 'none', color: C.ink3, fontSize: 12,
                  fontWeight: 600, fontFamily: FONT, cursor: 'pointer', padding: 0,
                  textDecoration: 'underline',
                }}>
                Cancel this session
              </button>
            </Card>
            <Card>
              <SectionLabel>Your two-round agenda</SectionLabel>
              {SESSION_AGENDA.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '3px 0' }}>
                  <span style={{ width: 44, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: C.goldDark, fontFamily: FONT }}>
                    {a.minutes} min
                  </span>
                  <span style={{ fontSize: 12.5, color: C.ink, fontFamily: FONT }}>{a.label}</span>
                </div>
              ))}
              <p style={{ margin: '6px 0 0', fontSize: 11, color: C.ink3, lineHeight: 1.45, fontFamily: FONT }}>
                This is guidance, not a timer. You both practise and you both interview.
                Decide who goes first when you meet.
              </p>
            </Card>
          </>
        )}

        {state === 'ready_to_confirm' && session && (
          <>
          {(() => {
            const g = guideAvailability({ session, pairing, userId: myUserId })
            if (!g.ok) return null
            return (
              <button type="button" onClick={() => setGuideOpen(true)}
                style={{
                  width: 'calc(100% - 32px)', margin: '0 16px 10px', border: `1px solid ${C.line}`,
                  background: C.white, color: C.ink2, borderRadius: 12, padding: '11px 0',
                  fontSize: 12.5, fontWeight: 650, fontFamily: FONT, cursor: 'pointer', minHeight: 44,
                }}>
                Open guided mock interview
              </button>
            )
          })()}
          <SessionConfirmCard
            partnerName={name}
            myUserId={myUserId}
            partnerUserId={partnerUserId}
            busy={busy}
            session={session}
            feedbackSupported={feedbackSupported}
            onSubmit={onSubmitConfirmation}
          />
          </>
        )}

        {state === 'waiting_for_partner' && (
          <Card style={{ background: C.sageBg, border: '1px solid #D7E7DC' }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: C.sage, fontFamily: FONT }}>
              Your confirmation is in
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.ink2, lineHeight: 1.5, fontFamily: FONT }}>
              Waiting for {name} to confirm.
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
              The practice becomes verified only after both participants confirm compatible outcomes.
            </p>
          </Card>
        )}

        {state === 'verified' && (
          <Card style={{ background: C.goldBg, border: `1px solid ${C.goldLight}` }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 750, color: C.goldDark, fontFamily: FONT }}>
              Mock interview verified
            </p>
            {(() => {
              const d = describeSession(session)
              return d.structured ? (
                <p style={{ margin: '5px 0 0', fontSize: 12.5, color: C.ink2, lineHeight: 1.5, fontFamily: FONT }}>
                  {d.title}<br />{d.detail}<br />With {name}
                </p>
              ) : (
                <p style={{ margin: '5px 0 0', fontSize: 12.5, color: C.ink2, fontFamily: FONT }}>With {name}</p>
              )
            })()}
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.goldDark, fontWeight: 650, fontFamily: FONT }}>
              1 shared Token earned
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
              Mock Interview Passport updated
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={onViewProgress}
                className="active:scale-[0.98] transition-all"
                style={{
                  flex: 1.3, minHeight: 44, border: 'none', borderRadius: 11, padding: '11px 0',
                  fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer', ...matchaCta,
                }}>
                View my progress
              </button>
              <button type="button" onClick={() => setScheduleAgain(true)}
                style={{
                  flex: 1, minHeight: 44, border: `1px solid ${C.line}`, background: C.white,
                  color: C.ink2, borderRadius: 11, padding: '11px 0', fontSize: 12.5,
                  fontWeight: 650, fontFamily: FONT, cursor: 'pointer',
                }}>
                Practise again
              </button>
            </div>
          </Card>
        )}

        {state === 'disputed' && (
          <Card>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
              The completion details do not match
            </p>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: C.ink2, lineHeight: 1.55, fontFamily: FONT }}>
              Your responses were different, so this practice has not been verified and no Token was created.
            </p>
            <p style={{ margin: '7px 0 0', fontSize: 11.5, color: C.ink3, lineHeight: 1.5, fontFamily: FONT }}>
              Neither of you needs to do anything. If this looks wrong, message {name} or contact the Mutu team.
            </p>
          </Card>
        )}

        {confirmEnd && (
          <div
            onClick={() => setConfirmEnd(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 85,
              background: 'rgba(24,22,15,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 330, background: C.white, borderRadius: 20,
                border: `1px solid ${C.line}`, padding: '22px 20px 16px',
                boxShadow: '0 16px 44px rgba(0,0,0,0.22)',
              }}>
              <p style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
                Leave this partnership with {name}?
              </p>
              <p style={{ margin: '8px 0 14px', fontSize: 12.5, color: C.ink2, lineHeight: 1.55, fontFamily: FONT }}>
                Your Tokens and your chat both stay. Any scheduled session will be
                cancelled, and {name} will get a friendly notification.
                You two can always match again later.
              </p>
              <button type="button" disabled={busy}
                onClick={() => { setConfirmEnd(false); onEndPairing() }}
                style={{
                  width: '100%', border: 'none', borderRadius: 12, padding: '12px 0',
                  fontSize: 13.5, fontWeight: 700, fontFamily: FONT,
                  background: '#B4232A', color: '#fff',
                  cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
                }}>
                {busy ? 'Leaving…' : 'Yes, leave'}
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)}
                style={{
                  width: '100%', marginTop: 6, border: 'none', background: 'none',
                  padding: '10px 0', fontSize: 13, fontWeight: 650,
                  color: C.ink2, fontFamily: FONT, cursor: 'pointer',
                }}>
                Stay
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
