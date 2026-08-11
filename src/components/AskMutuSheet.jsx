import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { fetchEncounters, buildAssistantContext, askMutu, fetchAskHistory, saveAskMessage, clearAskHistory } from '../lib/eventMemory'
import { fetchConnections } from '../lib/relationships'
import { fetchMyEvents } from '../lib/events'
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

const SUGGESTIONS = [
  'Who did I meet looking for co-founders?',
  'What introductions did I promise?',
  'Who should I follow up with first?',
  'Summarize my networking this week.',
]

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
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setInput('')
    ;(async () => {
      const [{ data: enc }, { data: hist }, { data: conns }, { data: myEvents }] = await Promise.all([
        fetchEncounters(userId),
        fetchAskHistory(userId),
        fetchConnections(userId),
        fetchMyEvents(userId),
      ])
      // Always include the user's own joined/hosted events (merged with any
      // passed in), so Ask Mutu knows what they're registered for regardless of
      // which screen opened the sheet.
      const byId = new Map()
      for (const e of [...(events || []), ...(myEvents || [])]) if (e?.id) byId.set(e.id, e)
      setCtx(buildAssistantContext({ encounters: enc, events: [...byId.values()], connections: conns, me: profile }))
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
          {empty ? (
            <div>
              <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.5, margin: '4px 0 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
                I can recall who you met, what you promised, and help you follow up. Try:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} type="button" onClick={() => send(s)}
                    style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, background: C.white, border: `1px solid ${C.goldLight}`, color: C.goldDark, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {s}
                  </button>
                ))}
              </div>
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
