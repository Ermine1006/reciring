import { useState } from 'react'
import { createPortal } from 'react-dom'
import PeerAvatar from './PeerAvatar'
import { matchaCta } from '../lib/matchaCta'

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#1A1712', textSub: '#6B6152', textMuted: '#9CA3AF', white: '#FFFFFF',
  border: '#E5E7EB', green: '#2E6B4F', greenBg: '#EDF3EE', greenBorder: '#CBDBCF',
  danger: '#DC2626',
}

function anonName(program) {
  return program ? `Anonymous ${program} student` : 'Anonymous attendee'
}

/**
 * Owner-facing sheet listing who's interested in ONE of my posts. Requesters
 * are anonymous (program + industry) until I accept. Accept reveals identity
 * and opens a private chat; Decline closes it; "Not now" defers (keeps pending).
 */
export default function MarketplaceInterestSheet({ open, post, interests = [], busyId = null, onAccept, onDecline, onOpenChat, onClose }) {
  // "Later" defers a request for this session without changing its status —
  // it stays pending and reappears next time the owner opens the sheet.
  const [laterIds, setLaterIds] = useState(() => new Set())
  if (!open || !post) return null

  const pending  = interests.filter(i => i.status === 'pending' && !laterIds.has(i.id))
  const accepted = interests.filter(i => i.status === 'accepted')
  const later    = (id) => setLaterIds(prev => new Set(prev).add(id))

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: '#F9F7F4',
          borderRadius: '24px 24px 0 0',
          padding: '10px 20px calc(20px + env(safe-area-inset-bottom))',
          maxHeight: '88vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>

        <h2 style={{ margin: '0 0 2px', fontSize: 19, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }}>
          Who's interested
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {post.title} · names stay hidden until you accept.
        </p>

        {pending.length === 0 && accepted.length === 0 && (
          <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 14, padding: '28px 0' }}>
            No interest yet. It'll show up here.
          </p>
        )}

        {/* Pending — actionable */}
        {pending.map(it => (
          <div key={it.id} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
              <PeerAvatar name={anonName(it.requester_program)} seed={it.id} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {anonName(it.requester_program)}
                </p>
                {(it.requester_program || it.requester_industry?.[0]) && (
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {[it.requester_program, it.requester_industry?.[0]].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={busyId === it.id} onClick={() => onAccept?.(it)}
                style={{ ...acceptBtn, opacity: busyId === it.id ? 0.6 : 1 }}>
                {busyId === it.id ? 'Connecting…' : 'Accept & Connect'}
              </button>
              <button type="button" disabled={busyId === it.id} onClick={() => onDecline?.(it)} style={declineBtn}>
                Decline
              </button>
            </div>
            <button type="button" disabled={busyId === it.id} onClick={() => later(it.id)}
              style={{ width: '100%', marginTop: 8, padding: '8px', borderRadius: 10, background: 'transparent', border: 'none', color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
              Later
            </button>
          </div>
        ))}

        {/* Accepted — jump into the chat */}
        {accepted.map(it => (
          <div key={it.id} style={{ ...rowStyle, background: C.greenBg, borderColor: C.greenBorder }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <PeerAvatar name="Anonymous peer" seed={it.id} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Connected ✓
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Identity revealed — chat is open.
                </p>
              </div>
              {it.match_id && (
                <button type="button" onClick={() => onOpenChat?.(it.match_id)} style={openChatBtn}>
                  Open chat
                </button>
              )}
            </div>
          </div>
        ))}

        <button type="button" onClick={onClose}
          style={{ width: '100%', marginTop: 10, padding: '13px', borderRadius: 14, background: 'transparent', border: 'none', color: C.textSub, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Close
        </button>
      </div>
    </div>,
    document.body
  )
}

const rowStyle = {
  background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
  padding: 14, marginBottom: 10,
}
const acceptBtn = {
  flex: 1, padding: '10px', borderRadius: 11, border: 'none',
  fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
  ...matchaCta,
}
const declineBtn = {
  padding: '10px 16px', borderRadius: 11, background: C.white,
  border: `1.5px solid ${C.border}`, color: C.textSub,
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
}
const openChatBtn = {
  padding: '9px 14px', borderRadius: 11, border: 'none',
  background: C.green, color: C.white, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
}
