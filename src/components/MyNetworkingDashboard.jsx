import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import EventCover from './EventCover'
import EventCaptureSheet from './EventCaptureSheet'
import AskMutuSheet from './AskMutuSheet'
import ContactHistorySheet from './ContactHistorySheet'
import ContactsListSheet from './ContactsListSheet'
import { fetchEncounters, fetchFollowups, completeFollowup, personKey } from '../lib/eventMemory'
import { fetchConnections } from '../lib/relationships'

const C = {
  bg: '#F6F3EC', card: '#FFFFFF', ink: '#25231E', sub: '#6E675B',
  gold: '#B08D57', goldDeep: '#977540', goldSoft: '#F4EEE3', goldLine: '#E7D9C2',
  sage: '#7F9376', sageBg: '#EAF0E4', border: '#ECE6DB', danger: '#C4553D',
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const GRADS = [['#B49A78','#8C7050'],['#8FA6A0','#5F7D75'],['#B58C8C','#8A5E5E'],['#9AA488','#6F7E5A'],['#A896B0','#7C6A88']]

function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·'
}
function gradFor(seed) {
  const s = String(seed || ''); let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return GRADS[h % GRADS.length]
}
// Semantic status colours (shared with the spec's taxonomy).
function connColor(status) {
  return status === 'chatted' ? '#2C7A6B'      // teal
       : status === 'revealed' ? '#7C5CBF'     // violet
       : '#4B5A8A'                              // slate — matched
}
function fmtDue(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const overdue = d.getTime() < Date.now() - 86400000
  return { label: `Due ${MONTHS[d.getMonth()]} ${d.getDate()}`, overdue }
}

function Avatar({ name, url, size = 40 }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  const [a, b] = gradFor(name)
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700, fontSize: size * 0.34, background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {initials(name)}
    </span>
  )
}
const Icon = {
  clock: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  pin: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" strokeLinejoin="round"/><circle cx="12" cy="10" r="2.4"/></svg>,
  chev: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>,
  spark: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.5 6L20 9.5 13.5 11 12 17l-1.5-6L4 9.5 10.5 8z"/></svg>,
}

/**
 * My Networking home — matches the hi-fi reference: greeting, upcoming event,
 * follow-ups with due pills, recently-met avatars, one primary action
 * (Log a conversation), and Ask Mutu. Data unchanged (event_encounters).
 */
export default function MyNetworkingDashboard({ userId, events = [], joinedIds = new Set(), onOpenEvent, onPrepare, onGoDiscover, onOpenEventRecap, onOpenMatch }) {
  const { profile } = useAuth()
  const [encounters, setEncounters] = useState([])
  const [followups, setFollowups]   = useState([])
  const [connections, setConnections] = useState([])
  const [loading, setLoading]       = useState(true)
  const [capture, setCapture]       = useState(null)
  const [askOpen, setAskOpen]       = useState(false)
  const [contact, setContact]       = useState(null)   // person whose history is open
  const [listOpen, setListOpen]     = useState(false)  // full contacts list

  // Distinct people (dedupe encounters by person) for Recently Met + the count.
  const contacts = useMemo(() => {
    const seen = new Map()
    for (const e of encounters) { const k = personKey(e); if (!seen.has(k)) seen.set(k, e) }
    return Array.from(seen.values())
  }, [encounters])

  // My upcoming events = ones I joined OR host (hosting doesn't auto-join).
  const registered = useMemo(() => {
    const now = Date.now()
    return events.filter(e => (joinedIds.has(e.id) || e.host_user_id === userId) && e.start_at && new Date(e.start_at).getTime() > now && e.status !== 'cancelled')
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  }, [events, joinedIds, userId])
  const nextEvent = registered[0] || null
  const titleById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e.title])), [events])

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const [{ data: enc }, { data: fu }, { data: conn }] = await Promise.all([
      fetchEncounters(userId), fetchFollowups(userId), fetchConnections(userId),
    ])
    setEncounters(enc); setFollowups(fu); setConnections(conn || []); setLoading(false)
  }, [userId])
  useEffect(() => { setLoading(true); load() }, [load])

  const markDone = async (id) => { setFollowups(p => p.filter(f => f.id !== id)); await completeFollowup(id); load() }
  const firstName = String(profile?.name || '').trim().split(/\s+/)[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  if (loading) return <p style={{ textAlign: 'center', color: C.sub, fontSize: 14, padding: '40px 0' }}>Loading…</p>

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      {/* Greeting */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 22 }}>
        <Avatar name={profile?.name} url={profile?.avatar_url} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: C.ink, fontFamily: 'Fraunces, Georgia, serif', letterSpacing: '-0.01em' }}>
            {greeting}, {firstName}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Keep the people you meet moving forward.
          </p>
        </div>
      </div>

      {/* Upcoming event */}
      <Label>Upcoming event</Label>
      {nextEvent ? (
        <button type="button" onClick={() => (onPrepare || onOpenEvent)?.(nextEvent.id)}
          style={{ ...card, display: 'flex', gap: 14, padding: 12, textAlign: 'left', cursor: 'pointer', width: '100%', marginBottom: 24, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', width: 104, flexShrink: 0, borderRadius: 12, overflow: 'hidden' }}>
            <EventCover event={nextEvent} aspectRatio="1 / 1" />
            <div style={{ position: 'absolute', bottom: 6, left: 6, background: '#fff', borderRadius: 9, padding: '3px 8px 4px', textAlign: 'center', boxShadow: '0 3px 8px rgba(30,22,10,0.2)' }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', color: C.gold, textTransform: 'uppercase' }}>{MONTHS[new Date(nextEvent.start_at).getMonth()]}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1, fontFamily: 'Fraunces, Georgia, serif' }}>{new Date(nextEvent.start_at).getDate()}</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.2 }}>{nextEvent.title}</p>
            <p style={{ margin: 0, fontSize: 12.5, color: C.sub, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: C.gold }}>{Icon.clock}</span>{new Date(nextEvent.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
            {nextEvent.location && <p style={{ margin: 0, fontSize: 12.5, color: C.sub, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: C.gold }}>{Icon.pin}</span>{nextEvent.location}</p>}
            <span style={{ marginTop: 2, fontSize: 12.5, fontWeight: 700, color: C.goldDeep, display: 'inline-flex', alignItems: 'center', gap: 2 }}>Prepare {Icon.chev}</span>
          </div>
        </button>
      ) : (
        <button type="button" onClick={() => onGoDiscover?.()} style={{ ...slim, marginBottom: 24 }}>
          <span style={{ color: C.sub }}>No upcoming events yet.</span>
          <span style={{ color: C.goldDeep, fontWeight: 700 }}>Discover →</span>
        </button>
      )}

      {/* Open next actions */}
      <LabelRow left="Open next actions" />
      {followups.length === 0 ? (
        <div style={{ ...slim, marginBottom: 24, cursor: 'default' }}>
          <span style={{ color: C.sub }}>No open next actions. Add one from a person's card after you meet them.</span>
        </div>
      ) : (
        <div style={{ ...card, padding: '4px 14px', marginBottom: 24 }}>
          {followups.slice(0, 3).map((f, i) => {
            const due = fmtDue(f.due_at)
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
                <Avatar name={f.display_name} url={f.avatar_url} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{f.display_name}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 12.5, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter, system-ui, sans-serif' }}>{f.next_action}</p>
                </div>
                {due && <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99, whiteSpace: 'nowrap', color: due.overdue ? C.danger : C.goldDeep, background: due.overdue ? '#F7E7E2' : C.goldSoft, fontFamily: 'Inter, system-ui, sans-serif' }}>{due.label}</span>}
                <button type="button" onClick={() => markDone(f.id)} aria-label="Mark done" style={doneBtn}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Recently met */}
      <LabelRow left="Recently met" right={contacts.length > 4 ? 'View all' : null} onRight={() => setListOpen(true)} />
      <div style={{ ...card, padding: '14px', marginBottom: 12 }}>
        {contacts.length === 0 ? (
          <span style={{ fontSize: 13, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>People you meet will show up here.</span>
        ) : (
          <div className="phone-scroll" style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 2 }}>
            {contacts.map(e => (
              <button key={personKey(e)} type="button" onClick={() => setContact(e)} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'center', width: 56 }}>
                <Avatar name={e.display_name} url={e.avatar_url} size={48} />
                <p style={{ margin: '5px 0 0', fontSize: 11, color: C.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter, system-ui, sans-serif' }}>{String(e.display_name || '').split(' ')[0]}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Connections — people you KNOW (matched / revealed / chatted) but have
          not met in person yet. Kept strictly separate from Recently met. */}
      {connections.length > 0 && (
        <>
          <LabelRow left="Connections" right={connections.length > 4 ? `${connections.length}` : null} />
          <div style={{ ...card, padding: '4px 14px', marginBottom: 22 }}>
            {connections.slice(0, 5).map((c, i) => (
              <button key={c.peerId} type="button"
                onClick={() => c.matchId && onOpenMatch?.(c.matchId)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', width: '100%', background: 'none', border: 'none', borderTop: i ? `1px solid ${C.border}` : 'none', cursor: c.matchId ? 'pointer' : 'default', textAlign: 'left' }}>
                <Avatar name={c.name || 'Private connection'} url={/^https?:/.test(c.avatarUrl || '') ? c.avatarUrl : null} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Private connection'}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 12, color: connColor(c.status), fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>{c.context}</p>
                </div>
                {c.matchId && <span style={{ color: C.goldDeep, flexShrink: 0 }}>{Icon.chev}</span>}
              </button>
            ))}
          </div>
        </>
      )}

      <button type="button" onClick={() => setCapture({ mode: 'ai', initial: null })} style={{ ...logBtn, width: '100%', justifyContent: 'center', marginBottom: 22 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Log a conversation
      </button>

      {/* Ask Mutu */}
      <button type="button" onClick={() => setAskOpen(true)} style={askCard}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: '#fff', display: 'grid', placeItems: 'center', color: C.gold, flexShrink: 0, boxShadow: '0 2px 6px rgba(151,117,64,0.2)' }}>{Icon.spark}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>Ask Mutu</p>
          <p style={{ margin: '1px 0 0', fontSize: 12.5, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>Who should I follow up with this week?</p>
        </div>
        <span style={{ color: C.goldDeep }}>{Icon.chev}</span>
      </button>

      <EventCaptureSheet open={Boolean(capture)} mode={capture?.mode || 'manual'} initial={capture?.initial || null}
        events={registered} defaultEventId={nextEvent?.id || null} userId={userId} onSaved={load} onClose={() => setCapture(null)} />
      <AskMutuSheet open={askOpen} userId={userId} events={registered} onClose={() => setAskOpen(false)} />

      <ContactHistorySheet
        open={Boolean(contact)}
        person={contact}
        userId={userId}
        onOpenEventRecap={(id) => { setContact(null); onOpenEventRecap?.(id) }}
        onOpenMatch={onOpenMatch}
        onChanged={load}
        onClose={() => setContact(null)}
      />

      <ContactsListSheet
        open={listOpen}
        contacts={contacts}
        onOpenContact={(c) => { setListOpen(false); setContact(c) }}
        onClose={() => setListOpen(false)}
      />
    </motion.div>
  )
}

function Label({ children }) {
  return <p style={labelStyle}>{children}</p>
}
function LabelRow({ left, right, onRight }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <p style={labelStyle}>{left}</p>
      {right && <button type="button" onClick={onRight} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 600, color: C.goldDeep, fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer' }}>{right}</button>}
    </div>
  )
}

const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 1px 2px rgba(30,22,10,0.04), 0 10px 24px -14px rgba(30,22,10,0.2)' }
const slim = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer' }
const labelStyle = { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', margin: '0 0 10px' }
const doneBtn = { flexShrink: 0, width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${C.border}`, background: '#fff', color: C.sage, display: 'grid', placeItems: 'center', cursor: 'pointer' }
const logBtn = { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 15px', borderRadius: 99, border: 'none', background: `linear-gradient(180deg, ${C.gold}, ${C.goldDeep})`, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', boxShadow: '0 5px 14px -5px rgba(151,117,64,0.6)' }
const askCard = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 15px', borderRadius: 16, background: C.goldSoft, border: `1px solid ${C.goldLine}`, cursor: 'pointer', textAlign: 'left' }
