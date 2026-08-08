import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Sparkle, SlidersHorizontal, Lock, Settings, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import SettingsPage, { resolveAvatarSeed } from './SettingsPage'
import SettingsTab from './SettingsTab'
import AnonymousAvatar from './AnonymousAvatar'

// Profile — landing in the shared Home visual language: a header with the
// completion ring, a need/offer summary, then rows into the existing editors.
// The detailed editor (SettingsPage) and account settings (SettingsTab) are
// preserved unchanged — only how they're reached has changed.

const C = {
  ground:   '#FFFFFF',
  card:     '#FAFAF7',
  cardLine: '#EFEBE2',
  ink:      '#18160F',
  ink2:     '#6E6A61',
  ink3:     '#9A958B',
  line2:    '#F1EEE7',
  gold:     '#A6822A',
  goldInk:  '#7A5E17',
  goldSoft: '#F8F3E5',
  goldLine: '#E8D9A7',
  goldRing: '#C9A33B',
  track:    '#ECE6D8',
  avatarBg: '#D9C084',
  avatarInk:'#463516',
  slate:    '#4B5A8A',
  sage:     '#2F7A55',
  danger:   '#B4453A',
  dangerBg: '#FBEEEC',
  dangerLn: '#F0D6D2',
}

function initials(name) {
  const p = String(name || '').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'M'
}

export default function ProfilePage({
  subTab, onSubTabChange, allMatches,
  onOpenAdminEmailTest, onOpenEventReview, onOpenEvent,
}) {
  const { profile, signOut } = useAuth()
  const me = profile || {}
  // 'landing' | 'edit' | 'settings'
  const [view, setView] = useState('landing')
  // Which section the edit screen opens on (and its title).
  const [edit, setEditState] = useState({ section: 'basic', title: 'Edit profile & interests' })
  const openEdit = (section, title) => { setEditState({ section, title }); setView('edit') }

  const completeness = useMemo(() => {
    const f = [me.name, me.headline || me.program, me.industry_interests?.length,
              me.can_help_with?.length, me.skills_to_learn?.length, resolveAvatarSeed(me.avatar_url)]
    return Math.round((f.filter(Boolean).length / f.length) * 100)
  }, [me])

  const canHelp = (me.can_help_with || []).slice(0, 4).join(', ')
  const wants   = (me.skills_to_learn || []).slice(0, 4).join(', ')
  const seed = resolveAvatarSeed(me.avatar_url)

  // ── Pushed sub-screens keep the existing editors intact ──
  // Same SettingsPage / same saved data — only the opening section differs,
  // so no duplicate forms. (Recognition ledger is not shown before the
  // requested section.)
  if (view === 'edit') {
    return (
      <SubScreen title={edit.title} onBack={() => setView('landing')}>
        <SettingsPage section={edit.section} />
      </SubScreen>
    )
  }
  if (view === 'settings') {
    return (
      <SubScreen title="Account settings" onBack={() => setView('landing')}>
        <div className="px-5 pt-3 pb-10">
          <SettingsTab onOpenAdminEmailTest={onOpenAdminEmailTest} onOpenEventReview={onOpenEventReview} />
        </div>
      </SubScreen>
    )
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: C.ground }}>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}
        style={{ padding: '14px 16px 28px', maxWidth: 560, margin: '0 auto' }}>

        <h1 style={{ fontSize: 19, fontWeight: 700, color: C.ink, margin: '0 0 14px', letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }}>Profile</h1>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {seed
            ? <AnonymousAvatar seed={seed} size={60} />
            : <div style={{ width: 60, height: 60, borderRadius: '50%', background: C.avatarBg, color: C.avatarInk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>{initials(me.name)}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name || 'Your name'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>{[me.headline, me.program].filter(Boolean).join(' · ') || 'Add your role'}</p>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <Ring pct={completeness} />
            <div style={{ fontSize: 10, color: C.ink3, marginTop: 2, fontFamily: 'Inter, system-ui, sans-serif' }}>Complete</div>
          </div>
        </div>

        {/* Need / offer summary */}
        <div style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 16, padding: '13px 14px', marginTop: 14 }}>
          <SummaryRow color={C.slate} label="Can help with" value={canHelp} empty="Add what you can offer" />
          <div style={{ height: 1, background: C.line2, margin: '10px 0' }} />
          <SummaryRow color={C.sage} label="Wants to learn" value={wants} empty="Add what you want to learn" />
        </div>

        {/* Rows */}
        <div style={{ marginTop: 14, border: `1px solid ${C.cardLine}`, borderRadius: 16, overflow: 'hidden' }}>
          <Row icon={<Sparkle size={16} strokeWidth={1.8} />} label="Edit profile & interests" onClick={() => openEdit('basic', 'Edit profile & interests')} />
          <Row icon={<SlidersHorizontal size={16} strokeWidth={1.8} />} label="Skills & matching" onClick={() => openEdit('skills', 'Skills & matching')} />
          <Row icon={<Lock size={16} strokeWidth={1.8} />} label="Privacy" onClick={() => openEdit('privacy', 'Privacy')} />
          <Row icon={<Settings size={16} strokeWidth={1.8} />} label="Account settings" onClick={() => setView('settings')} />
          <Row icon={<LogOut size={16} strokeWidth={1.8} />} label="Sign out" danger onClick={() => signOut?.()} last />
        </div>
      </motion.div>
    </div>
  )
}

function SubScreen({ title, onBack, children }) {
  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: '#F9F7F4' }}>
      <div style={{ flexShrink: 0, background: '#F9F7F4', padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={onBack} aria-label="Back" style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: C.ink, display: 'flex' }}>
          <ChevronLeft size={22} strokeWidth={2.1} />
        </button>
        <b style={{ fontSize: 15, fontWeight: 650, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{title}</b>
      </div>
      <div className="flex-1 phone-scroll min-h-0">
        <motion.div key={title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
          {children}
        </motion.div>
      </div>
    </div>
  )
}

function SummaryRow({ color, label, value, empty }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ flexShrink: 0, width: 74, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color, marginTop: 1, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</span>
      <p style={{ margin: 0, fontSize: 13, color: value ? C.ink : C.ink3, lineHeight: 1.4, fontFamily: 'Inter, system-ui, sans-serif' }}>{value || empty}</p>
    </div>
  )
}

function Row({ icon, label, onClick, danger, last }) {
  return (
    <button type="button" onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: C.ground, border: 'none', borderBottom: last ? 'none' : `1px solid ${C.line2}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                     background: danger ? C.dangerBg : C.goldSoft, border: `1px solid ${danger ? C.dangerLn : C.goldLine}`, color: danger ? C.danger : C.goldInk }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: danger ? C.danger : C.ink }}>{label}</span>
      {!danger && <ChevronRight size={16} strokeWidth={2} color={C.ink3} />}
    </button>
  )
}

function Ring({ pct }) {
  const r = 15, circ = 2 * Math.PI * r
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return (
    <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke={C.track} strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={C.goldRing} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 20 20)" />
      <text x="20" y="20" dominantBaseline="central" textAnchor="middle" fontSize="10" fontWeight="700" fill={C.goldInk} fontFamily="Inter, system-ui, sans-serif">{pct}%</text>
    </svg>
  )
}
