import { useState, useEffect, useCallback } from 'react'
import SessionConfirmCard from './SessionConfirmCard'
import TokenUnlockModal from './TokenUnlockModal'
import {
  fetchMyPairings, fetchMySessions, fetchSessionConfirmations,
  proposePracticeSession, confirmPracticeSession, declinePracticeSession,
  withdrawPracticeSession, submitPracticeConfirmation, fetchMyExchangeTokens,
  fetchSessionModeSupport,
} from '../../lib/practice'
import { deriveDisplayState, formatSessionTime, wallTimeToUtc } from '../../lib/practiceMatching'
import { practiceErrorMessage, DEFAULT_TIMEZONE } from '../../data/practiceOptions'
import SessionSetupFields, { SessionSummary } from './SessionSetupFields'
import { describeSession, validateSessionSetup, SESSION_MODES } from '../../data/practiceModes'
import { describeMeeting, canJoin, validateMeetingSetup } from '../../data/meetingMethods'
import MeetingDetails from './MeetingDetails'
import { MATCHA_DEEP, matchaCta } from '../../lib/matchaCta'

// ── The ONE "Next step" card inside an Exchange chat ─────────────
// People coordinate in chat, so the current required action lives
// here too. Single source of truth: every action calls the existing
// Practice RPC wrappers; this card only *reads and renders* state.

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B', line: '#E9E5DD', white: '#FFFFFF',
}
const FONT = 'Inter, system-ui, sans-serif'

const inputStyle = {
  border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px',
  fontSize: 13, fontFamily: FONT, color: C.ink, background: C.white,
  outline: 'none', boxSizing: 'border-box', minWidth: 0,
}

function calendarUrl(session, partnerName) {
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

const primaryBtn = {
  width: '100%', border: 'none', borderRadius: 12, padding: '12px 0',
  fontSize: 13.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer', ...matchaCta,
}
const quietLink = {
  display: 'block', margin: '7px auto 0', border: 'none', background: 'none',
  padding: 3, fontSize: 12, fontWeight: 650, color: C.ink3,
  fontFamily: FONT, cursor: 'pointer', textDecoration: 'underline',
}

export default function ExchangeNextStep({ matchId, currentUserId, peerName, onOpenDetails }) {
  const name = peerName || 'your partner'
  const [pairing, setPairing] = useState(null)
  const [session, setSession] = useState(null)
  const [myConfirmed, setMyConfirmed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [scheduler, setScheduler] = useState(false)     // inline mini-scheduler open
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [tokenModal, setTokenModal] = useState(false)
  const [tokenCount, setTokenCount] = useState(null)
  const [setup, setSetup] = useState({
    mode: null, category: null, skillFocus: null,
    meetingMethod: null, meetingUrl: '', meetingLocation: '',
  })
  const [reviewing, setReviewing] = useState(false)
  const [modesSupported, setModesSupported] = useState(false)

  const load = useCallback(async () => {
    const [{ data: prs }, { data: sess }, modeSupport] = await Promise.all([
      fetchMyPairings(), fetchMySessions(), fetchSessionModeSupport(),
    ])
    setModesSupported(Boolean(modeSupport?.supported))
    const p = (prs || []).find((x) => x.match_id === matchId) || null
    setPairing(p)
    const s = p
      ? [...(sess || [])].filter((x) => x.pairing_id === p.id)
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).pop() || null
      : null
    setSession(s)
    if (s) {
      const { data: confs } = await fetchSessionConfirmations(s.id)
      setMyConfirmed((confs || []).some((c) => c.user_id === currentUserId))
    } else setMyConfirmed(false)
    setLoaded(true)
  }, [matchId, currentUserId])

  useEffect(() => { load() }, [load])

  const act = (fn, after) => async (...args) => {
    setBusy(true); setErr(null)
    const { error, data } = (await fn(...args)) || {}
    setBusy(false)
    if (error) { setErr(practiceErrorMessage(error)); return }
    after?.(data)
    await load()
  }

  const setupCheck = validateSessionSetup(setup)
  const meetingCheck = validateMeetingSetup({
    method: setup.meetingMethod, url: setup.meetingUrl, location: setup.meetingLocation,
  })
  const propose = act(
    () => {
      if (modesSupported && !setupCheck.ok) {
        return Promise.resolve({ error: new Error(setupCheck.error) })
      }
      if (!meetingCheck.ok) return Promise.resolve({ error: new Error(meetingCheck.error) })
      const startsAt = wallTimeToUtc(date, time, DEFAULT_TIMEZONE)
      if (new Date(startsAt) <= new Date()) return Promise.resolve({ error: new Error('start_in_past') })
      return proposePracticeSession({
        pairingId: pairing.id, scheduledStart: startsAt,
        durationMinutes: modesSupported && setup.mode ? SESSION_MODES[setup.mode].approxMinutes : 60,
        timezone: DEFAULT_TIMEZONE,
        ...(modesSupported
          ? { sessionMode: setup.mode, interviewCategory: setup.category, skillFocus: setup.skillFocus }
          : {}),
        meetingMethod: setup.meetingMethod,
        meetingUrl: setup.meetingUrl,
        meetingLocation: setup.meetingLocation,
      })
    },
    () => { setScheduler(false); setDate(''); setTime(''); setSetup({ mode: null, category: null, skillFocus: null, meetingMethod: null, meetingUrl: '', meetingLocation: '' }) }
  )
  const confirmTime = act(() => confirmPracticeSession(session.id))
  const suggestAnother = act(() => declinePracticeSession(session.id), () => setScheduler(true))
  const withdrawTime = act(() => withdrawPracticeSession(session.id))
  const submitConfirmation = act(
    (form) => submitPracticeConfirmation({ sessionId: session.id, ...form }),
    (data) => {
      if (data?.status === 'verified') {
        fetchMyExchangeTokens().then(({ data: toks }) => setTokenCount((toks || []).length))
        setTokenModal(true)
      }
    }
  )

  if (!loaded || !pairing || !['accepted'].includes(pairing.status)) return null
  const st = deriveDisplayState({ pairing, session, myUserId: currentUserId, myConfirmed })

  const Shell = ({ label, children }) => (
    <div style={{
      margin: '0 16px 16px', background: C.white, borderRadius: 16,
      padding: '12px 16px 14px', border: `1px solid ${C.goldLight}`,
      boxShadow: '0 2px 8px rgba(201,163,59,0.08)',
    }}>
      <p style={{ margin: '0 0 8px', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: C.gold, fontFamily: FONT }}>
        Next step · {label}
      </p>
      {children}
      {err && <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: '#B4232A', fontFamily: FONT }}>{err}</p>}
      {onOpenDetails && (
        <button type="button" onClick={onOpenDetails} style={{ ...quietLink, marginTop: 9 }}>
          Session details
        </button>
      )}
    </div>
  )

  const blocked = (modesSupported && !setupCheck.ok) || !meetingCheck.ok
  const miniScheduler = (
    <div style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 12 }}>
        <SessionSetupFields value={setup} onChange={setSetup} supported={modesSupported} compact />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input type="date" style={{ ...inputStyle, flex: 1.3 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" style={{ ...inputStyle, flex: 1 }} value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      {modesSupported && setupCheck.ok && (
        <div style={{ marginBottom: 8 }}>
          <SessionSummary setup={setup} whenLabel={null} />
        </div>
      )}
      <button type="button" disabled={busy || !date || !time || blocked} onClick={propose}
        style={{ ...primaryBtn, opacity: busy || !date || !time || blocked ? 0.6 : 1 }}>
        {busy ? 'Sending…' : `Suggest this time to ${name}`}
      </button>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: C.ink3, textAlign: 'center', fontFamily: FONT }}>
        {modesSupported && setup.mode ? SESSION_MODES[setup.mode].durationLabel : '60 min'}
        {' · Toronto time · '}{name} confirms before it's scheduled
      </p>
    </div>
  )

  // the agreement, shown identically to whoever is looking
  const agreementLine = (sess) => {
    const d = describeSession(sess)
    if (!d.structured) return null
    return (
      <p style={{ margin: '4px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.5 }}>
        <strong style={{ color: C.ink }}>{d.title}</strong><br />{d.detail}
      </p>
    )
  }

  return (
    <>
      {st === 'scheduling' && (
        <Shell label="Choose a time">
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>
            Agree on a time with {name}
          </p>
          {scheduler ? miniScheduler : (
            <button type="button" onClick={() => setScheduler(true)} style={{ ...primaryBtn, marginTop: 10 }}>
              Schedule your session
            </button>
          )}
        </Shell>
      )}

      {st === 'proposal_sent' && session && (
        <Shell label="Waiting on them">
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>
            You suggested {formatSessionTime(session.scheduled_start, session.duration_minutes, session.timezone)}
          </p>
          {agreementLine(session)}
          <div style={{ marginTop: 8 }}>
            <MeetingDetails session={session} showJoin={false} compact />
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
            {name} can confirm it or suggest another.
          </p>
          <button type="button" disabled={busy} onClick={withdrawTime} style={quietLink}>
            Withdraw and suggest another
          </button>
        </Shell>
      )}

      {st === 'proposal_received' && session && (
        <Shell label="Confirm the time">
          <p style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>
            {name} suggested {formatSessionTime(session.scheduled_start, session.duration_minutes, session.timezone)}
          </p>
          {agreementLine(session)}
          <div style={{ marginTop: 8 }}>
            <MeetingDetails session={session} showJoin={false} compact />
          </div>
          {scheduler ? miniScheduler : (
            <>
              {/* an invitation whose structured details are missing or
                  invalid cannot be accepted */}
              {(session.session_mode && !describeSession(session).structured)
                || describeMeeting(session).invalid ? (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#B4232A', fontFamily: FONT, lineHeight: 1.5 }}>
                  {describeMeeting(session).invalid
                    ? `Ask ${name} to add a meeting link.`
                    : `This invitation is missing its mock interview details. Ask ${name} to suggest it again.`}
                </p>
              ) : reviewing ? (
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: FONT }}>
                    Review mock interview invitation
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: C.ink2, fontFamily: FONT, lineHeight: 1.6 }}>
                    With {name}<br />
                    {describeSession(session).structured
                      ? <>{describeSession(session).title}<br />{describeSession(session).detail}<br /></>
                      : null}
                    {formatSessionTime(session.scheduled_start, session.duration_minutes, session.timezone)}
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <MeetingDetails session={session} showJoin={false} compact />
                  </div>
                  <button type="button" disabled={busy} onClick={confirmTime} style={{ ...primaryBtn, marginTop: 10 }}>
                    {busy ? 'Accepting…' : 'Accept invitation'}
                  </button>
                  <p style={{ margin: '7px 0 0', fontSize: 11, color: C.ink3, textAlign: 'center', fontFamily: FONT, lineHeight: 1.45 }}>
                    The meeting link will remain available in this chat and your session details.
                  </p>
                  <button type="button" onClick={() => setReviewing(false)} style={quietLink}>
                    Back
                  </button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => setReviewing(true)} style={primaryBtn}>
                  View details and accept
                </button>
              )}
              <button type="button" disabled={busy} onClick={suggestAnother} style={quietLink}>
                Suggest another
              </button>
            </>
          )}
        </Shell>
      )}

      {st === 'scheduled' && session && (
        <Shell label="You're scheduled">
          <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>
            {formatSessionTime(session.scheduled_start, session.duration_minutes, session.timezone)}
          </p>
          {agreementLine(session)}
          <div style={{ marginTop: 8 }}>
            <MeetingDetails session={session} />
          </div>
          <div style={{ height: 10 }} />
          <a href={calendarUrl(session, name)} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'block', textAlign: 'center', textDecoration: 'none',
              border: `1px solid ${C.goldLight}`, background: C.goldBg, color: C.goldDark,
              borderRadius: 12, padding: '11px 0', fontSize: 13, fontWeight: 700, fontFamily: FONT,
            }}>
            Add to calendar
          </a>
        </Shell>
      )}

      {st === 'ready_to_confirm' && session && (
        <div style={{ margin: '0 16px 16px' }}>
          <SessionConfirmCard
            partnerName={name}
            myUserId={currentUserId}
            partnerUserId={pairing.counterpart_user_id}
            busy={busy}
            session={session}
            onSubmit={submitConfirmation}
          />
        </div>
      )}

      {st === 'waiting_for_partner' && (
        <Shell label="Almost there">
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: C.ink, fontFamily: FONT }}>
            You've confirmed. Waiting for {name}.
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: C.ink2, fontFamily: FONT }}>
            Your Token appears the moment {name} confirms too.
          </p>
        </Shell>
      )}

      {st === 'verified' && (
        <Shell label="Token earned">
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: C.goldDark, fontFamily: FONT }}>
            ✦ Session verified with {name}
          </p>
          <button type="button" onClick={() => setScheduler(true)} style={{ ...primaryBtn, marginTop: 10 }}>
            Practise again
          </button>
          {scheduler && miniScheduler}
        </Shell>
      )}

      {st === 'disputed' && (
        <Shell label="Under review">
          <p style={{ margin: 0, fontSize: 13, color: C.ink2, lineHeight: 1.5, fontFamily: FONT }}>
            Your confirmations didn't match, so this session is paused for a quick
            manual review. The Mutu team will follow up.
          </p>
        </Shell>
      )}

      <TokenUnlockModal
        open={tokenModal}
        partnerName={name}
        verifiedCount={tokenCount ?? undefined}
        onPractiseAgain={() => { setTokenModal(false); setScheduler(true) }}
        onSendThanks={() => setTokenModal(false)}
        onClose={() => setTokenModal(false)}
      />
    </>
  )
}
