import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

// Recognition · Slice 3 — the private "Your impact" ledger.
// Renders ONLY on the current user's own Profile tab (Mutu has no public
// profile view of others, so "own profile only" is inherent). Never shows
// points, scores, stars, ranks, or levels.

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#1A1712', text: '#111111', textSub: '#6B6152', textMuted: '#9CA3AF',
  border: '#EFE1C8',
}

const eyebrow = {
  fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
  fontWeight: 600, color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif',
  display: 'flex', alignItems: 'center', gap: 6,
}
const card = {
  background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF8F2 100%)',
  border: `1px solid ${C.border}`, borderRadius: 16,
}

async function loadImpact(uid) {
  // 1. My matches → peer per match.
  const { data: myMatches } = await supabase
    .from('matches')
    .select('id, requester_user_id, helper_user_id')
    .or(`requester_user_id.eq.${uid},helper_user_id.eq.${uid}`)
  const peerByMatch = {}
  const matchIds = []
  ;(myMatches || []).forEach(m => {
    matchIds.push(m.id)
    peerByMatch[m.id] = m.requester_user_id === uid ? m.helper_user_id : m.requester_user_id
  })

  // 2. "We met" confirmations → a match is a completed exchange when both
  //    participants confirmed (2 rows).
  let completed = new Set()
  if (matchIds.length) {
    const { data: confs } = await supabase
      .from('exchange_confirmations')
      .select('match_id')
      .in('match_id', matchIds)
    const count = {}
    ;(confs || []).forEach(c => { count[c.match_id] = (count[c.match_id] || 0) + 1 })
    completed = new Set(Object.keys(count).filter(id => count[id] >= 2))
  }
  const peers = new Set([...completed].map(id => peerByMatch[id]).filter(Boolean))

  // 3. Chips others gave ME (view exposes chips only — never free_text).
  const { data: recv } = await supabase
    .from('recognition_received')
    .select('chips')
  const chipCounts = {}
  ;(recv || []).forEach(r => (r.chips || []).forEach(ch => { chipCounts[ch] = (chipCounts[ch] || 0) + 1 }))
  const topChips = Object.entries(chipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([chip, n]) => ({ chip, n }))

  return {
    peopleHelped:  peers.size,
    introductions: chipCounts['Warm introduction'] || 0,
    exchanges:     completed.size,
    topChips,
    totalRecognitions: (recv || []).length,
  }
}

export default function ImpactLedger() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!isSupabaseConfigured || !user?.id) { setLoading(false); return }
    loadImpact(user.id)
      .then(d => { if (alive) { setData(d); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [user?.id])

  if (!user?.id || loading) return null

  const empty = !data || (data.totalRecognitions === 0 && data.exchanges === 0)
  const maxChip = data?.topChips?.[0]?.n || 1

  return (
    <div style={{ padding: '18px 20px 4px' }}>
      <p style={{ ...eyebrow, marginBottom: 14 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" />
        </svg>
        Only you can see this
      </p>

      {empty ? (
        <div style={{ ...card, padding: '22px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: 13.5, color: C.textSub, lineHeight: 1.6, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Complete your first exchange and this is where the community's recognition will live.
          </p>
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 }}>
            <Tile n={data.peopleHelped}  label="people helped" />
            <Tile n={data.introductions} label="introductions" />
            <Tile n={data.exchanges}     label="exchanges completed" />
          </div>

          <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55, margin: '12px 2px 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
            The more people you help, the earlier Mutu routes new opportunities — alumni, referrals, intros — to you.
          </p>

          {/* What people say stood out */}
          {data.topChips.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ ...eyebrow, color: C.textSub, marginBottom: 8 }}>What people say stood out</p>
              <div style={{ ...card, padding: '6px 14px' }}>
                {data.topChips.map(({ chip, n }, i) => (
                  <div key={chip} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                    borderBottom: i < data.topChips.length - 1 ? '1px solid #F0E9DB' : 'none',
                  }}>
                    <span style={{ fontSize: 13.5, color: '#463d2e', flex: 'none', minWidth: 128, fontFamily: 'Inter, system-ui, sans-serif' }}>{chip}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 99, background: '#F0E9DB', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(12, (n / maxChip) * 100)}%`, background: `linear-gradient(90deg, ${C.goldLight}, ${C.gold})`, borderRadius: 99 }} />
                    </div>
                    <span style={{ fontFamily: 'Fraunces, Georgia, serif', color: C.goldDark, fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>×{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Tile({ n, label }) {
  return (
    <div style={{ ...card, padding: '13px 10px', textAlign: 'center' }}>
      <b style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 24, fontWeight: 600, color: '#8B6F47', display: 'block', fontVariantNumeric: 'tabular-nums' }}>{n}</b>
      <span style={{ fontSize: 10.5, color: '#8a8071', lineHeight: 1.3, display: 'block', marginTop: 3, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</span>
    </div>
  )
}
