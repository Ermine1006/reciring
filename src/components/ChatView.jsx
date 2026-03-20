import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnonymousAvatar from './AnonymousAvatar'
import CoffeeChatModal from './CoffeeChatModal'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  chatBg:    '#F5F2EE',
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtMeeting(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function MeetingCard({ msg, onAccept, onDecline }) {
  const { meeting } = msg
  const isMe = msg.senderId === 'me'
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', padding: '4px 16px' }}>
      <div style={{
        background: C.white,
        border: `1.5px solid ${C.goldLight}`,
        borderRadius: 18, padding: '14px 16px',
        maxWidth: 270,
        boxShadow: '0 2px 12px rgba(200,169,106,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>☕</span>
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: C.goldDark,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            Coffee Chat {isMe ? 'Suggested' : 'Proposed'}
          </p>
        </div>
        <p style={{
          fontSize: 14, fontWeight: 600, color: C.text,
          fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 4,
        }}>
          {fmtMeeting(meeting.datetime)}
        </p>
        <p style={{
          fontSize: 13, color: C.textSub,
          fontFamily: 'Inter, system-ui, sans-serif',
          marginBottom: meeting.status === 'pending' && !isMe ? 14 : 0,
        }}>
          📍 {meeting.location}
        </p>

        {meeting.status === 'pending' && !isMe && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onAccept} style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              color: '#fff', fontSize: 12, fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              border: 'none', cursor: 'pointer',
            }}>
              Accept ✓
            </button>
            <button onClick={onDecline} style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              background: '#F3F4F6', color: C.textSub,
              fontSize: 12, fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              border: '1px solid #E5E7EB', cursor: 'pointer',
            }}>
              Decline
            </button>
          </div>
        )}
        {meeting.status === 'accepted' && (
          <p style={{ fontSize: 12, color: '#16A34A', fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>
            ✓ Confirmed!
          </p>
        )}
        {meeting.status === 'declined' && (
          <p style={{ fontSize: 12, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Declined
          </p>
        )}
      </div>
    </div>
  )
}

export default function ChatView({ match, messages, onSend, onProposeMeeting, onMeetingResponse, onBack }) {
  const [input, setInput]               = useState('')
  const [showCoffee, setShowCoffee]     = useState(false)
  const bottomRef                        = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const t = input.trim()
    if (!t) return
    onSend(t)
    setInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.chatBg, position: 'relative' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px 10px',
        background: C.white,
        borderBottom: `1px solid rgba(200,169,106,0.18)`,
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: C.goldBg, border: `1px solid ${C.goldLight}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <svg width="16" height="16" fill="none" stroke={C.gold} viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <AnonymousAvatar seed={match?.id || 'chat'} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Anonymous Peer
          </p>
          <p style={{ fontSize: 11, color: '#16A34A', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
            Active match
          </p>
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 0' }}>

        {/* Exchange context card */}
        {match?.request && (
          <div style={{
            margin: '0 16px 16px',
            background: C.white, borderRadius: 16,
            padding: '12px 16px',
            border: `1px solid ${C.goldLight}`,
            boxShadow: '0 2px 8px rgba(200,169,106,0.08)',
          }}>
            <p style={{
              fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: 600, color: C.gold,
              fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 8,
            }}>
              The Exchange
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 3, borderRadius: 99, background: C.gold, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
                <strong style={{ color: C.goldDark }}>Needs: </strong>
                {match.request.needs?.slice(0, 90)}{match.request.needs?.length > 90 ? '…' : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 3, borderRadius: 99, background: '#8B7355', flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
                <strong style={{ color: '#5C4A2A' }}>Offers: </strong>
                {match.request.offers?.slice(0, 90)}{match.request.offers?.length > 90 ? '…' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg) => {
          if (msg.type === 'meeting_proposal') {
            return (
              <MeetingCard
                key={msg.id}
                msg={msg}
                onAccept={() => onMeetingResponse(msg.id, 'accepted')}
                onDecline={() => onMeetingResponse(msg.id, 'declined')}
              />
            )
          }
          const isMe = msg.senderId === 'me'
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                padding: '3px 16px',
              }}
            >
              <div style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isMe
                  ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                  : C.white,
                color: isMe ? '#fff' : C.text,
                fontSize: 14, lineHeight: 1.5,
                fontFamily: 'Inter, system-ui, sans-serif',
                boxShadow: isMe
                  ? '0 4px 12px rgba(200,169,106,0.3)'
                  : '0 2px 8px rgba(0,0,0,0.06)',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
              <p style={{
                fontSize: 10, color: C.textMuted,
                fontFamily: 'Inter, system-ui, sans-serif',
                marginTop: 3, paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0,
              }}>
                {fmtTime(msg.timestamp)}
              </p>
            </motion.div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Coffee chat quick-action ── */}
      <div style={{
        padding: '8px 16px 4px',
        background: C.white,
        borderTop: '1px solid rgba(0,0,0,0.05)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setShowCoffee(true)}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 12,
            background: C.goldBg, border: `1.5px solid ${C.goldLight}`,
            color: C.goldDark, fontSize: 13, fontWeight: 600,
            fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
          }}
        >
          Suggest Coffee Chat ☕
        </button>
      </div>

      {/* ── Input bar ── */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-end',
        padding: '8px 16px 14px',
        background: C.white, flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Message…"
          rows={1}
          style={{
            flex: 1, resize: 'none',
            border: '1.5px solid #E5E7EB', borderRadius: 20,
            padding: '10px 16px', fontSize: 14,
            fontFamily: 'Inter, system-ui, sans-serif',
            outline: 'none', lineHeight: 1.4,
            maxHeight: 100, overflowY: 'auto',
            background: '#F9F9F9',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: input.trim()
              ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
              : '#E5E7EB',
            border: 'none',
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: input.trim() ? '0 4px 12px rgba(200,169,106,0.3)' : 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={input.trim() ? 'white' : '#9CA3AF'}>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      {/* Coffee scheduling modal */}
      <AnimatePresence>
        {showCoffee && (
          <CoffeeChatModal
            onConfirm={(data) => { onProposeMeeting(data); setShowCoffee(false) }}
            onClose={() => setShowCoffee(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
