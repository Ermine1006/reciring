import { useState } from 'react'
import { motion } from 'framer-motion'
import { CATEGORIES } from '../data/mockRequests'

const C = {
  gold:       '#C8A96A',
  goldDark:   '#A88245',
  goldLight:  '#E6D3A3',
  goldBg:     '#FBF6EC',
  warm:       '#8B6F47',
  warmDark:   '#3D3020',
  warmBg:     '#FAF6F0',
  warmLight:  '#D4B896',
  warmBorder: '#E8DDD0',
  text:       '#111111',
  textSub:    '#6B7280',
  textMuted:  '#9CA3AF',
  white:      '#FFFFFF',
  border:     '#E5E7EB',
}

function SectionCard({ accentColor, accentBorder, accentBg, label, labelColor, labelBorder, labelText, children }) {
  return (
    <div
      className="rounded-[18px] overflow-hidden"
      style={{
        background: C.white,
        border: `1.5px solid ${accentBorder}`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}
    >
      {/* Accent stripe */}
      <div style={{ height: 3, background: accentColor }} />
      <div className="px-5 py-4">
        {/* Section label */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[8px] tracking-[0.22em] font-bold uppercase px-2.5 py-1 rounded-full"
            style={{
              background: accentBg,
              border: `1px solid ${labelBorder}`,
              color: labelColor,
            }}
          >
            {label}
          </span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${labelBorder}, transparent)` }} />
        </div>
        {children}
      </div>
    </div>
  )
}

export default function SubmitRequest({ onSubmitted }) {
  const [needs,    setNeeds]    = useState('')
  const [offers,   setOffers]   = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!needs.trim() || !offers.trim()) return
    onSubmitted?.({ needs: needs.trim(), offers: offers.trim(), category })
    setNeeds('')
    setOffers('')
    setCategory(CATEGORIES[0])
  }

  const canSubmit = needs.trim().length > 0 && offers.trim().length > 0

  const focusGold  = (e) => { e.target.style.borderColor = C.gold;  e.target.style.boxShadow = '0 0 0 3px rgba(200,169,106,0.12)' }
  const focusWarm  = (e) => { e.target.style.borderColor = C.warm;  e.target.style.boxShadow = '0 0 0 3px rgba(139,111,71,0.12)' }
  const blurReset  = (e) => { e.target.style.borderColor = C.border; e.target.style.boxShadow = 'none' }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-5 py-7"
    >
      {/* Section header */}
      <div className="mb-6">
        <p className="text-[10px] tracking-[0.28em] font-semibold uppercase mb-1" style={{ color: C.gold }}>
          ReciRing
        </p>
        <h2 className="font-display text-[24px] font-semibold" style={{ color: C.text }}>
          Post a request
        </h2>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: C.textSub }}>
          Matches happen when someone has what you need{' '}
          <span style={{ fontStyle: 'italic' }}>and</span>{' '}
          needs what you offer.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Category chips */}
        <div>
          <p className="text-[11px] tracking-[0.16em] uppercase font-semibold mb-2.5" style={{ color: C.textSub }}>
            Category
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const active = category === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className="px-4 py-2 rounded-full text-[12px] font-medium tracking-wide transition-all duration-200 active:scale-95"
                  style={{
                    background: active ? C.goldBg   : C.white,
                    border:     active ? `1.5px solid ${C.gold}`   : `1.5px solid ${C.border}`,
                    color:      active ? C.goldDark  : C.textSub,
                    boxShadow:  active ? '0 2px 8px rgba(200,169,106,0.2)' : 'none',
                  }}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── NEEDS ─────────────────────────────────────── */}
        <SectionCard
          accentColor={`linear-gradient(90deg, ${C.gold}, ${C.goldLight})`}
          accentBorder={C.goldLight}
          accentBg={C.goldBg}
          label="Needs"
          labelColor={C.goldDark}
          labelBorder={C.goldLight}
        >
          <label htmlFor="needs-text" className="block text-[13px] font-semibold mb-2" style={{ color: C.text }}>
            What do you need?
          </label>
          <textarea
            id="needs-text"
            value={needs}
            onChange={(e) => setNeeds(e.target.value)}
            placeholder="Does anyone have a connection at Bain? I'd love an intro for consulting recruiting."
            rows={3}
            className="w-full rounded-[12px] px-4 py-3 text-sm resize-none transition-all duration-200"
            style={{ background: '#FAFAFA', border: `1.5px solid ${C.border}`, color: C.text, lineHeight: 1.6 }}
            onFocus={focusGold}
            onBlur={blurReset}
            required
          />
          {needs.length > 0 && (
            <p className="text-[10px] mt-1 text-right" style={{ color: C.textMuted }}>{needs.length} chars</p>
          )}
        </SectionCard>

        {/* ── OFFERS ────────────────────────────────────── */}
        <SectionCard
          accentColor={`linear-gradient(90deg, ${C.warm}, ${C.warmLight})`}
          accentBorder={C.warmBorder}
          accentBg={C.warmBg}
          label="Offers"
          labelColor={C.warmDark}
          labelBorder={C.warmBorder}
        >
          <label htmlFor="offers-text" className="block text-[13px] font-semibold mb-2" style={{ color: C.text }}>
            What can you offer?
          </label>
          <textarea
            id="offers-text"
            value={offers}
            onChange={(e) => setOffers(e.target.value)}
            placeholder="I can introduce people to VCs in Toronto or help with fintech fundraising strategy."
            rows={3}
            className="w-full rounded-[12px] px-4 py-3 text-sm resize-none transition-all duration-200"
            style={{ background: '#FAFAFA', border: `1.5px solid ${C.border}`, color: C.text, lineHeight: 1.6 }}
            onFocus={focusWarm}
            onBlur={blurReset}
            required
          />
          {offers.length > 0 && (
            <p className="text-[10px] mt-1 text-right" style={{ color: C.textMuted }}>{offers.length} chars</p>
          )}
        </SectionCard>

        {/* Matching logic callout */}
        <div
          className="rounded-[14px] px-4 py-3 flex items-start gap-3"
          style={{ background: '#F9F7F4', border: '1px solid #F0ECE4' }}
        >
          <span className="text-base mt-0.5">🔁</span>
          <p className="text-[12px] leading-relaxed" style={{ color: C.textSub }}>
            <span style={{ fontWeight: 600, color: C.text }}>How matching works: </span>
            Someone will swipe right on your ring only if they have what you need{' '}
            <span style={{ fontWeight: 600 }}>and</span>{' '}
            need what you offer.
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-4 rounded-[16px] text-sm font-semibold tracking-[0.12em] uppercase transition-all duration-200 active:scale-[0.98]"
          style={{
            background: canSubmit ? `linear-gradient(135deg, ${C.gold} 0%, ${C.goldDark} 100%)` : '#F3F4F6',
            color:      canSubmit ? '#fff' : C.textMuted,
            boxShadow:  canSubmit ? '0 8px 24px rgba(200,169,106,0.35)' : 'none',
          }}
        >
          Post anonymously
        </button>

        <p className="text-center text-[11px]" style={{ color: C.textMuted }}>
          Your identity is never revealed to other members.
        </p>
      </form>
    </motion.div>
  )
}
