import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { fetchEncounters, buildAssistantContext, askMutu, fetchAskHistory, saveAskMessage, clearAskHistory } from '../lib/eventMemory'
import { fetchConnections } from '../lib/relationships'
import { fetchMyEvents, fetchUpcomingEvents } from '../lib/events'
import { fetchEventPrepCandidates } from '../lib/eventMatch'
import { useAuth } from '../context/AuthContext'

// Render Mutu's answers as plain text: turn **bold** into real bold and strip
// any stray markdown asterisks so they never show as literal characters.
function renderText(text) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p.replace(/\*/g, '')}</span>,
  )
}

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#14110C', sub: '#6B6152', muted: '#9C9789', white: '#FFFFFF', border: '#E5E7EB',
}

// Quick free-text prompts under the three primary actions.
const SUGGESTIONS = [
  'Who did I meet looking for co-founders?',
  'What introductions did I promise?',
]

// Crafted questions behind the primary action cards.
const Q_SUMMARY = 'Give me a quick summary of my network right now: any follow-ups due, who I met recently, and the single best next step I should take.'
const Q_ATTEND  = 'Based on my profile and interests, which upcoming event should I attend, and why?'
const qPrep = (title) => `I'm attending "${title}". Help me prepare — who should I connect with there, why each, and how should I open the conversation?`

// The three primary actions Ask Mutu opens to. `kind` drives the click handler.
const ACTIONS = [
  { kind: 'summary', icon: '📊', short: 'Summary',  title: 'Your networking summary', sub: 'Follow-ups due, who you met recently, next step' },
  { kind: 'attend',  icon: '🧭', short: 'Attend',   title: 'What event should I attend?', sub: 'Best upcoming events for your goals' },
  { kind: 'prep',    icon: '🤝', short: 'Prepare',  title: 'Prepare for an event', sub: 'Who to connect with there — and how to open' },
]

// Granola-style shortcut pill sitting in the row just above the composer.
const rowChip = { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '8px 13px', borderRadius: 999, background: '#FFFFFF', border: '1px solid #E8D9A7', color: '#A6822A', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'nowrap' }

/**
 * Ask Mutu — a lightweight networking assistant. Answers only from the user's
 * own encounters/events (fetched here, RLS-scoped, sent as grounding context).
 * A sheet, not a full chat app.
 */
export default function AskMutuSheet({ open, userId, events = [], onClose }) {
  const { profile } = useAuth()
  const [ctx, setCtx] = useState(null)
  const [msgs, setMsgs] = useState([])       // { role: 'user'|'mutu', text }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState('home')   // 'home' | 'pickEvent' (for "Prepare for an event")
  const [prepEvents, setPrepEvents] = useState([]) // future joined/hosted events we can prep for
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setInput('')
    setView('home')
    ;(async () => {
      const [{ data: enc }, { data: hist }, { data: conns }, { data: myEvents }, { data: discover }] = await Promise.all([
        fetchEncounters(userId),
        fetchAskHistory(userId),
        fetchConnections(userId),
        fetchMyEvents(userId),
        fetchUpcomingEvents(),
      ])
      // Merge: the user's own joined/hosted events (joined:true) plus discoverable
      // upcoming events they have NOT joined (joined:false), so Ask Mutu can both
      // recall what they're registered for AND recommend new events to attend.
      const byId = new Map()
      for (const e of [...(events || []), ...(myEvents || [])]) if (e?.id) byId.set(e.id, { ...e, joined: true })
      for (const e of (discover || [])) if (e?.id && !byId.has(e.id)) byId.set(e.id, { ...e, joined: false })
      const allEvents = [...byId.values()]

      // Compute the privacy-safe "who to meet" list for the user's JOINED
      // upcoming events (where we can read attendees and match on their own
      // intentions, falling back to profile priority). Public attendees come
      // back named; private ones as "A peer". Capped to keep the payload light.
      const now = Date.now()
      const joinedUpcoming = allEvents
        .filter(e => e.joined && e.start_at && new Date(e.start_at).getTime() >= now - 12 * 3600 * 1000)
        .slice(0, 5)
      const lists = await Promise.all(
        joinedUpcoming.map(e => fetchEventPrepCandidates(e.id, userId, profile).catch(() => ({ candidates: [], signal: 'none' })))
      )
      const eventMatches = {}
      joinedUpcoming.forEach((e, i) => {
        const r = lists[i] || {}
        eventMatches[e.id] = { data: r.candidates || [], needsMyIntentions: r.signal === 'none' }
      })

      setPrepEvents(joinedUpcoming)
      setCtx(buildAssistantContext({ encounters: enc, events: allEvents, connections: conns, me: profile, eventMatches }))
      setMsgs((hist || []).map(m => ({ role: m.role, text: m.text })))
    })()
  }, [open, userId, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  if (!open) return null

  const send = async (q) => {
    const question = (q ?? input).trim()
    if (!question || busy) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text: question }])
    saveAskMessage(userId, 'user', question)
    setBusy(true)
    const { answer, error } = await askMutu(question, ctx || {})
    setBusy(false)
    const reply = error ? (error.message || 'Sorry, try again.') : answer
    setMsgs(m => [...m, { role: 'mutu', text: reply }])
    if (!error) saveAskMessage(userId, 'mutu', reply)
  }

  // Primary action cards. "prep" opens an event picker; the others send a
  // crafted question straight through.
  const onAction = (kind) => {
    if (busy) return
    if (kind === 'summary') return send(Q_SUMMARY)
    if (kind === 'attend')  return send(Q_ATTEND)
    if (kind === 'prep')    return setView('pickEvent')
  }

  const onPickEvent = (ev) => {
    setView('home')
    send(qPrep(ev.title))
  }

  const empty = msgs.length === 0

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, height: '86vh', background: '#F9F7F4', borderRadius: '24px 24px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ flexShrink: 0, padding: '10px 20px 12px', borderBottom: `1px solid ${C.border}`, background: C.white }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 10px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>✨</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }}>Ask Mutu</p>
              <p style={{ margin: 0, fontSize: 11.5, color: C.muted, fontFamily: 'Inter, system-ui, sans-serif' }}>About your own network · private to you</p>
            </div>
            {msgs.length > 0 && (
              <button type="button" onClick={async () => { await clearAskHistory(userId); setMsgs([]) }}
                style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', padding: '4px 6px' }}>
                Clear
              </button>
            )}
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Conversation */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {view === 'pickEvent' ? (
            <div>
              <button type="button" onClick={() => setView('home')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '2px 0 12px', fontFamily: 'Inter, system-ui, sans-serif' }}>
                ‹ Back
              </button>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: '0 0 4px', fontFamily: 'Fraunces, Georgia, serif' }}>Which event are you preparing for?</p>
              <p style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5, margin: '0 0 14px', fontFamily: 'Inter, system-ui, sans-serif' }}>
                I'll suggest who to connect with there and how to open the conversation.
              </p>
              {prepEvents.length === 0 ? (
                <div style={{ padding: '14px', borderRadius: 12, background: C.white, border: `1px solid ${C.border}`, color: C.sub, fontSize: 13, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  You haven't joined any upcoming events yet. Join one from the Events tab, then come back to prep for it.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {prepEvents.map(ev => (
                    <button key={ev.id} type="button" onClick={() => onPickEvent(ev)}
                      style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, background: C.white, border: `1px solid ${C.goldLight}`, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.ink }}>{ev.title}</span>
                      {ev.start_at && (
                        <span style={{ display: 'block', fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                          {new Date(ev.start_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {typeof ev.attendee_count === 'number' ? ` · ${ev.attendee_count} attending` : ''}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : empty ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, textAlign: 'center', maxWidth: 320, fontFamily: 'Inter, system-ui, sans-serif' }}>
                I know your network — the people you've met, who you've connected with, and your events. Pick a shortcut below, or ask me anything.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '84%', padding: '11px 14px', borderRadius: 16, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    background: m.role === 'user' ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : C.white,
                    color: m.role === 'user' ? '#fff' : C.ink,
                    border: m.role === 'user' ? 'none' : `1px solid ${C.border}`,
                    borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                    borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
                  }}>
                    {renderText(m.text)}
                  </div>
                </div>
              ))}
              {busy && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '11px 14px', borderRadius: 16, background: C.white, border: `1px solid ${C.border}`, color: C.muted, fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Granola-style shortcut row — always sits just above the input, so the
            actions never disappear and you can trigger any of them mid-chat
            without clearing your history. */}
        {view !== 'pickEvent' && (
          <div className="phone-scroll" style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '8px 14px 2px', overflowX: 'auto', background: '#F9F7F4' }}>
            {ACTIONS.map(a => (
              <button key={a.kind} type="button" onClick={() => onAction(a.kind)} style={rowChip}>
                <span style={{ fontSize: 14 }}>{a.icon}</span>{a.short}
              </button>
            ))}
            {SUGGESTIONS.map(s => (
              <button key={s} type="button" onClick={() => send(s)} style={rowChip}>{s}</button>
            ))}
          </div>
        )}

        {/* Composer */}
        <div style={{ flexShrink: 0, padding: '10px 16px calc(14px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C.border}`, background: C.white, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            rows={1}
            placeholder="Ask about your network…"
            style={{ flex: 1, resize: 'none', maxHeight: 100, padding: '11px 13px', borderRadius: 14, border: `1.5px solid ${C.border}`, background: '#F9F7F4', fontSize: 14.5, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none' }}
          />
          <button type="button" onClick={() => send()} disabled={!input.trim() || busy}
            style={{ width: 44, height: 44, borderRadius: 13, border: 'none', flexShrink: 0, background: !input.trim() || busy ? '#E5E1D8' : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, color: '#fff', display: 'grid', placeItems: 'center', cursor: !input.trim() || busy ? 'default' : 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
