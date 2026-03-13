import { useState } from 'react'
import { motion } from 'framer-motion'
import AnonymousAvatar from './AnonymousAvatar'
import Certificate from './Certificate'
import { MOCK_ME, MOCK_LEADERBOARD, getBadge, getNextBadge } from '../data/reputationData'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#4B5563',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  bg:        '#F9F7F4',
}

const BADGE_COLORS = {
  'New Member':        { bg: '#F3F4F6', text: '#6B7280',  border: '#E5E7EB' },
  'Helper':            { bg: '#EBF5FB', text: '#2E7DAB',  border: '#BFD9EE' },
  'Connector':         { bg: C.goldBg,  text: C.goldDark, border: C.goldLight },
  'Community Builder': { bg: '#ECFDF5', text: '#059669',  border: '#A7F3D0' },
  'Super Connector':   { bg: '#FEF3C7', text: '#92400E',  border: '#FDE68A' },
}

const RANK_STYLES = {
  1: { bg: '#FEF3C7', color: '#92400E', label: '🥇' },
  2: { bg: '#F3F4F6', color: '#4B5563', label: '🥈' },
  3: { bg: '#FEF0E8', color: '#9A3412', label: '🥉' },
}

function BadgeChip({ label }) {
  const s = BADGE_COLORS[label] || BADGE_COLORS['New Member']
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', padding: '3px 10px', borderRadius: 99,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

export default function LeaderboardView() {
  const [showCert, setShowCert] = useState(false)

  const myBadge   = getBadge(MOCK_ME.points)
  const nextBadge = getNextBadge(MOCK_ME.points)
  const prevMin   = myBadge.min
  const nextMin   = nextBadge ? nextBadge.min : prevMin + 250
  const progress  = nextBadge
    ? Math.round(((MOCK_ME.points - prevMin) / (nextMin - prevMin)) * 100)
    : 100
  const canUnlockCert = MOCK_ME.points >= 100

  return (
    <div className="phone-scroll" style={{ background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '24px 20px 40px' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, letterSpacing: '0.28em', fontWeight: 600, textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 4 }}>
            ReciRing
          </p>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: C.text, fontFamily: 'Fraunces, Georgia, serif', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Top Connectors
          </h2>
          <p style={{ fontSize: 13, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
            Earn points by helping your peers.
          </p>
        </div>

        {/* ── My stats card ── */}
        <div style={{
          background: C.white, borderRadius: 18,
          border: `1.5px solid ${C.goldLight}`,
          boxShadow: `0 4px 20px rgba(200,169,106,0.12)`,
          overflow: 'hidden', marginBottom: 16,
        }}>
          <div style={{ height: 3, background: `linear-gradient(90deg, ${C.goldLight}, ${C.gold}, ${C.goldLight})` }} />
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <AnonymousAvatar seed="me" size={44} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 4 }}>
                  Your Score
                </p>
                <BadgeChip label={myBadge.label} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 32, fontWeight: 700, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {MOCK_ME.points}
                </p>
                <p style={{ fontSize: 11, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', marginTop: 2 }}>points</p>
              </div>
            </div>

            {/* Progress bar */}
            {nextBadge && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {MOCK_ME.points - prevMin} / {nextMin - prevMin} pts to <strong style={{ color: C.goldDark }}>{nextBadge.label}</strong>
                  </span>
                  <span style={{ fontSize: 11, color: C.gold, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>{progress}%</span>
                </div>
                <div style={{ height: 6, background: '#F3F0EB', borderRadius: 99, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{ height: '100%', background: `linear-gradient(90deg, ${C.goldLight}, ${C.gold})`, borderRadius: 99 }}
                  />
                </div>
              </div>
            )}
            {!nextBadge && (
              <p style={{ fontSize: 12, color: C.gold, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center' }}>
                ✦ Maximum rank achieved ✦
              </p>
            )}
          </div>
        </div>

        {/* ── Certificate unlock card ── */}
        {canUnlockCert && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: `linear-gradient(135deg, #FFFBF0, #FBF6EC)`,
              borderRadius: 18,
              border: `1.5px solid ${C.goldLight}`,
              padding: '16px 20px',
              marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 14,
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(200,169,106,0.35)',
              fontSize: 22,
            }}>
              🏅
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 2 }}>
                Certificate Unlocked
              </p>
              <p style={{ fontSize: 11, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.4 }}>
                Share your Community Connector badge on LinkedIn
              </p>
            </div>
            <button
              onClick={() => setShowCert(true)}
              style={{
                padding: '8px 16px', borderRadius: 99, flexShrink: 0,
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                color: '#fff', fontSize: 12, fontWeight: 600,
                fontFamily: 'Inter, system-ui, sans-serif',
                border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(200,169,106,0.3)',
              }}
            >
              View
            </button>
          </motion.div>
        )}

        {/* ── Points history ── */}
        <div style={{
          background: C.white, borderRadius: 18,
          border: `1px solid rgba(0,0,0,0.06)`,
          overflow: 'hidden', marginBottom: 16,
        }}>
          <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
              Recent Activity
            </p>
          </div>
          {MOCK_ME.history.slice(0, 5).map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              padding: '11px 20px',
              borderBottom: i < 4 ? '1px solid rgba(0,0,0,0.04)' : 'none',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginRight: 12,
                background: C.goldBg, border: `1px solid ${C.goldLight}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>
                🤝
              </div>
              <p style={{ flex: 1, fontSize: 13, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {item.label}
              </p>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  +{item.points}
                </p>
                <p style={{ fontSize: 10, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>{item.date}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Leaderboard ── */}
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 12 }}>
          Leaderboard
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MOCK_LEADERBOARD.map((entry, i) => {
            const rankStyle = RANK_STYLES[entry.rank]
            return (
              <motion.div
                key={entry.rank}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: entry.isMe
                    ? `linear-gradient(135deg, #FFFBF0, #FBF6EC)`
                    : C.white,
                  borderRadius: 16,
                  border: entry.isMe
                    ? `1.5px solid ${C.goldLight}`
                    : '1px solid rgba(0,0,0,0.06)',
                  padding: '12px 16px',
                  boxShadow: entry.isMe
                    ? '0 4px 16px rgba(200,169,106,0.12)'
                    : '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                {/* Rank */}
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: rankStyle ? rankStyle.bg : '#F9FAFB',
                  fontSize: rankStyle ? 18 : 13,
                  fontWeight: 700,
                  color: rankStyle ? rankStyle.color : C.textMuted,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  {rankStyle ? rankStyle.label : `#${entry.rank}`}
                </div>

                {/* Avatar */}
                <AnonymousAvatar seed={entry.seed} size={36} />

                {/* Name + badge */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 14, fontWeight: entry.isMe ? 700 : 500,
                    color: entry.isMe ? C.text : C.textSub,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {entry.name}{entry.isMe ? ' (you)' : ''}
                  </p>
                  <BadgeChip label={entry.badge} />
                </div>

                {/* Points */}
                <p style={{
                  fontSize: 16, fontWeight: 700, flexShrink: 0,
                  color: entry.isMe ? C.gold : C.text,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  letterSpacing: '-0.01em',
                }}>
                  {entry.points}
                  <span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted, marginLeft: 2 }}>pts</span>
                </p>
              </motion.div>
            )
          })}
        </div>

        {/* How to earn points */}
        <div style={{
          marginTop: 20, borderRadius: 16,
          background: C.white, border: '1px solid rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
              How to earn points
            </p>
          </div>
          {[
            { label: 'Referral',       pts: '+12', icon: '🎯' },
            { label: 'Introduction',   pts: '+10', icon: '🤝' },
            { label: 'Coffee chat',    pts: '+5',  icon: '☕' },
            { label: 'Resume review',  pts: '+4',  icon: '📄' },
          ].map((item, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 20px',
              borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <p style={{ flex: 1, fontSize: 13, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {item.label}
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {item.pts}
              </p>
            </div>
          ))}
        </div>

      </div>

      {/* Certificate modal */}
      {showCert && <Certificate points={MOCK_ME.points} onClose={() => setShowCert(false)} />}
    </div>
  )
}
