import { motion } from 'framer-motion'
import { useState } from 'react'
import PeerAvatar from './PeerAvatar'

// Matches — messages list in the shared Home visual language: warm-white
// ground, charcoal text, restrained gold, compact rows. Active vs Past
// (both people tapped "We met"). Behaviour/data unchanged.

const C = {
  ground:   '#FFFFFF',
  card:     '#FAFAF7',
  cardLine: '#EFEBE2',
  ink:      '#18160F',
  ink2:     '#6E6A61',
  ink3:     '#9A958B',
  line:     '#E9E5DD',
  line2:    '#F1EEE7',
  gold:     '#A6822A',
  goldRing: '#C9A33B',
  sage:     '#2F7A55',
  sageBg:   '#EEF5F0',
}

function timeAgo(isoString) {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function MatchesList({ matches = [], completedMatchIds = new Set(), onOpenChat, revealedMatchIds = new Set(), peerProfiles = {} }) {
  const active = matches.filter(m => !completedMatchIds.has(m.id))
  const past   = matches.filter(m =>  completedMatchIds.has(m.id))
  const [view, setView] = useState('active')
  const list = view === 'active' ? active : past

  const peerName = (m) =>
    m.peerName || (revealedMatchIds.has(m.id) && peerProfiles[m.id]?.first_name) || 'Anonymous peer'

  const renderRow = (m, i) => {
    const isNew = !m.lastMessage
    return (
      <motion.li
        key={m.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i * 0.04, 0.3) }}
        onClick={() => onOpenChat?.(m.id)}
        className="active:scale-[0.997]"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 4px', borderBottom: `1px solid ${C.line2}`,
          cursor: 'pointer', listStyle: 'none',
        }}
      >
        <PeerAvatar name={peerName(m)} seed={m.id} size={44} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peerName(m)}</span>
            {isNew && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.sage, background: C.sageBg, borderRadius: 5, padding: '2px 6px' }}>New</span>}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.lastMessage || (m.request?.needs ? `Needs: ${m.request.needs}` : 'Say hello to start the conversation.')}
          </p>
        </div>

        <span style={{ flexShrink: 0, fontSize: 11, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {m.lastMessageTime || timeAgo(m.createdAt)}
        </span>
      </motion.li>
    )
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: C.ground }}>
      <div style={{ padding: '12px 16px 26px', maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: C.ink, margin: '2px 0 12px', letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Messages
        </h1>

        {/* Active / Past */}
        <div role="tablist" style={{ display: 'flex', background: '#F0ECE3', borderRadius: 11, padding: 3, gap: 3, marginBottom: 6 }}>
          {[{ id: 'active', label: `Active${active.length ? ` · ${active.length}` : ''}` }, { id: 'past', label: 'Past' }].map(t => {
            const on = view === t.id
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => setView(t.id)}
                style={{ flex: 1, border: 'none', background: on ? C.ground : 'transparent', borderRadius: 8, padding: '7px 0', fontSize: 12.5, fontWeight: 600, color: on ? C.ink : C.ink2, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.06)' : 'none' }}>
                {t.label}
              </button>
            )
          })}
        </div>

        {list.length === 0 ? (
          <div style={{ padding: '40px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 14.5, fontWeight: 650, color: C.ink, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {view === 'active' ? 'No conversations yet' : 'No past exchanges yet'}
            </p>
            <p style={{ fontSize: 13, color: C.ink3, margin: '5px 0 0', lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {view === 'active'
                ? 'Connect with someone on Discover or in an event to start a conversation.'
                : 'Exchanges move here once you and the other person both mark “We met”.'}
            </p>
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0 }}>
            {list.map(renderRow)}
          </ul>
        )}
      </div>
    </div>
  )
}
