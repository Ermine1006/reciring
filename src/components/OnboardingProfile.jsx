import { useState } from 'react'
import { motion } from 'framer-motion'
import { INDUSTRIES, HELP_TYPES } from '../data/requestOptions'
import { useAuth } from '../context/AuthContext'
import ReciRingLogo from './ReciRingLogo'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
}

const PROGRAMS = ['MBA', 'MFin', 'MBAN', 'MMgt', 'MMA', 'PhD', 'Other']

function Chip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-all duration-150 active:scale-95"
      style={{
        padding: '6px 14px', borderRadius: 99,
        fontSize: 12, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
        cursor: 'pointer',
        background: active ? C.goldBg : C.white,
        color: active ? C.goldDark : C.textSub,
        border: `1.5px solid ${active ? C.gold : C.border}`,
        boxShadow: active ? '0 2px 8px rgba(200,169,106,0.2)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

export default function OnboardingProfile() {
  const { createProfile, user } = useAuth()

  const [firstName, setFirstName]             = useState('')
  const [program, setProgram]                 = useState('')
  const [industryInterests, setIndustryInterests] = useState([])
  const [canHelpWith, setCanHelpWith]         = useState([])
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState(null)

  const toggleList = (list, setList, max) => (val) => {
    setList(prev =>
      prev.includes(val)
        ? prev.filter(v => v !== val)
        : prev.length < max ? [...prev, val] : prev
    )
  }

  const canSubmit = firstName.trim() && program && industryInterests.length > 0 && canHelpWith.length > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)

    const { error: err } = await createProfile({
      firstName: firstName.trim(),
      program,
      industryInterests,
      canHelpWith,
    })

    setSaving(false)
    if (err) setError(typeof err === 'string' ? err : err.message)
  }

  return (
    <div
      className="w-full min-h-[100dvh] flex items-start sm:items-center justify-center px-4 py-8"
      style={{ background: '#EEE9E0' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%', maxWidth: 400,
          background: C.white,
          borderRadius: 28,
          padding: '40px 28px 36px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.10), 0 4px 16px rgba(200,169,106,0.12)',
        }}
      >
        <div className="flex justify-center mb-6">
          <ReciRingLogo size={34} />
        </div>

        <h1
          className="text-center font-display mb-1"
          style={{ fontSize: 22, fontWeight: 600, color: C.text }}
        >
          Set up your profile
        </h1>
        <p className="text-center mb-6" style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
          This powers your matches. Only your first name is ever shown to peers.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* First name */}
          <div>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>
              First name <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value.slice(0, 30))}
              placeholder="How peers will know you"
              className="w-full rounded-xl px-4 py-3 text-sm"
              style={{ background: '#FAFAFA', border: `1.5px solid ${C.border}`, color: C.text }}
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>
              School email
            </label>
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: '#F5F5F5', border: `1.5px solid ${C.border}`, color: C.textMuted }}
            >
              {user?.email}
            </div>
          </div>

          {/* Program */}
          <div>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-semibold mb-2" style={{ color: C.textSub }}>
              Program <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PROGRAMS.map(p => (
                <Chip key={p} label={p} active={program === p} onClick={() => setProgram(p)} />
              ))}
            </div>
          </div>

          {/* Industry interests */}
          <div>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-semibold mb-1" style={{ color: C.textSub }}>
              Industry interests <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <p className="mb-2" style={{ fontSize: 11, color: C.textMuted }}>
              Select up to 3 — helps us match relevant requests to you
            </p>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map(ind => (
                <Chip
                  key={ind}
                  label={ind}
                  active={industryInterests.includes(ind)}
                  onClick={toggleList(industryInterests, setIndustryInterests, 3)}
                />
              ))}
            </div>
          </div>

          {/* Can help with */}
          <div>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-semibold mb-1" style={{ color: C.textSub }}>
              I can help with <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <p className="mb-2" style={{ fontSize: 11, color: C.textMuted }}>
              Select up to 5 — shown as your strengths in match scoring
            </p>
            <div className="flex flex-wrap gap-2">
              {HELP_TYPES.map(ht => (
                <Chip
                  key={ht}
                  label={ht}
                  active={canHelpWith.includes(ht)}
                  onClick={toggleList(canHelpWith, setCanHelpWith, 5)}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-center" style={{ fontSize: 12, color: '#EF4444' }}>{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || saving}
            className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
            style={{
              background: canSubmit
                ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                : '#F3F4F6',
              color: canSubmit ? '#fff' : C.textMuted,
              boxShadow: canSubmit ? '0 6px 20px rgba(200,169,106,0.35)' : 'none',
              border: 'none',
              cursor: canSubmit ? 'pointer' : 'default',
            }}
          >
            {saving ? 'Saving...' : 'Start discovering'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
