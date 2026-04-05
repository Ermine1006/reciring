import { useState } from 'react'
import { motion } from 'framer-motion'
import { HELP_TYPES, INDUSTRIES } from '../data/requestOptions'

/* ── Design tokens ──────────────────────────────────────────────── */
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

/* ── Structured option lists ────────────────────────────────────── */
const TIME_OPTIONS  = ['15 min', '30 min', '1 hr', '2+ hr']
const URGENCY_OPTIONS = [
  { value: null,     label: 'No rush' },
  { value: 'soon',   label: 'This week' },
  { value: 'urgent', label: 'Urgent' },
]

/* ── Limits ─────────────────────────────────────────────────────── */
const TITLE_MAX   = 60
const DETAILS_MAX = 200
const OFFERS_MAX  = 200

/* ── Urgency config for preview ─────────────────────────────────── */
const URGENCY_STYLE = {
  urgent: { color: '#991B1B', bg: '#991B1B' },
  soon:   { color: '#92400E', bg: '#92400E' },
}

/* ── Smart placeholders based on selections ─────────────────────── */
function getTitlePlaceholder(helpType, industry) {
  const h   = helpType[0] || ''
  const ind = industry[0] || ''

  // Help Type × Industry combos (most specific first)
  if (h === 'Referral'       && ind === 'Consulting')         return 'e.g. Bain referral or coffee chat'
  if (h === 'Referral'       && ind === 'Investment Banking') return 'e.g. Goldman Sachs referral for SA recruiting'
  if (h === 'Referral'       && ind === 'Tech')               return 'e.g. Google PM referral via Rotman alum'
  if (h === 'Referral'       && ind === 'Private Equity')     return 'e.g. PE fund intro for summer recruiting'
  if (h === 'Referral'       && ind === 'VC')                 return 'e.g. VC intro for fundraising'
  if (h === 'Referral'       && ind)                          return `e.g. ${ind} referral or warm intro`
  if (h === 'Coffee Chat'    && ind === 'Consulting')         return 'e.g. 15-min chat about MBB recruiting'
  if (h === 'Coffee Chat'    && ind)                          return `e.g. Coffee chat with someone in ${ind}`
  if (h === 'Advice'         && ind === 'VC')                 return 'e.g. Fundraising advice from VC-backed founder'
  if (h === 'Advice'         && ind === 'Tech')               return 'e.g. Breaking into tech PM from MBA'
  if (h === 'Advice'         && ind)                          return `e.g. Career advice for ${ind}`
  if (h === 'Resume Review'  && ind)                          return `e.g. Resume review for ${ind} recruiting`
  if (h === 'Mock Interview' && ind)                          return `e.g. Mock interview prep for ${ind}`

  // Help Type only
  if (h === 'Referral')       return 'e.g. Referral to a specific firm or team'
  if (h === 'Coffee Chat')    return 'e.g. 15-min chat about career transition'
  if (h === 'Resume Review')  return 'e.g. Resume review before recruiting season'
  if (h === 'Mock Interview') return 'e.g. Mock case or behavioral interview'
  if (h === 'Intro')          return 'e.g. Intro to Rotman sustainability club'
  if (h === 'Study Group')    return 'e.g. Study partner for finance midterm'
  if (h === 'Advice')         return 'e.g. Advice on transitioning into PM'

  return 'e.g. Bain referral or coffee chat'
}

function getDetailsPlaceholder(helpType) {
  const h = helpType[0] || ''
  if (h === 'Referral')       return 'Which firm or team? What role are you targeting?'
  if (h === 'Coffee Chat')    return 'What would you like to learn or discuss?'
  if (h === 'Resume Review')  return 'What stage is your resume at? Any specific concerns?'
  if (h === 'Mock Interview') return 'What type of interview? Casing, behavioral, or technical?'
  if (h === 'Intro')          return 'Who are you looking to meet, and why?'
  if (h === 'Study Group')    return 'Which course or topic? What\'s your schedule like?'
  if (h === 'Advice')         return 'What specific question do you need answered?'
  return 'Add context so the right person recognizes they can help.'
}

/* ── Quick-fill offer chips ─────────────────────────────────────── */
const OFFER_PRESETS = [
  { label: '☕ Coffee chat',       text: 'Happy to chat over coffee and share my experience.' },
  { label: '📄 Resume feedback',   text: 'Can review your resume and provide detailed feedback.' },
  { label: '🔁 Referral exchange', text: 'Open to exchanging referrals where relevant.' },
  { label: '📚 Study support',     text: 'Happy to help with coursework or study sessions.' },
  { label: '💡 Industry insights', text: 'Can share insights from my professional background.' },
]

/* ── Micro-feedback (derived, no state) ─────────────────────────── */
function getMicroFeedback(title, details, offers, helpType) {
  if (helpType.length === 0)                         return null
  if (!title.trim())                                 return null
  if (title.trim() && !offers.trim() && !details.trim())
    return { text: 'Good title — add an offer to make it matchable', icon: '✓' }
  if (title.trim() && offers.trim() && details.trim())
    return { text: 'Looks great — ready to post', icon: '✓' }
  if (title.trim() && offers.trim())
    return { text: 'Looking good — details are optional but help', icon: '✓' }
  return null
}

/* ── Chip selector (reusable) ───────────────────────────────────── */
function ChipGroup({ options, selected, onToggle, multi = false }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const value = typeof opt === 'string' ? opt : opt.value
        const label = typeof opt === 'string' ? opt : opt.label
        const active = multi
          ? (selected || []).includes(value)
          : selected === value
        return (
          <button
            key={label}
            type="button"
            onClick={() => onToggle(value)}
            className="px-3.5 py-[7px] rounded-full text-[12px] font-medium tracking-wide transition-all duration-200 active:scale-95"
            style={{
              background: active ? C.goldBg   : C.white,
              border:     active ? `1.5px solid ${C.gold}`   : `1.5px solid ${C.border}`,
              color:      active ? C.goldDark  : C.textSub,
              boxShadow:  active ? '0 2px 8px rgba(200,169,106,0.2)' : 'none',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Character-counted input ────────────────────────────────────── */
function CountedInput({ id, value, onChange, placeholder, maxLength, rows = 1, onFocus, onBlur }) {
  const over = value.length > maxLength
  const Tag = rows > 1 ? 'textarea' : 'input'
  return (
    <div>
      <Tag
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        {...(rows > 1 ? { rows } : {})}
        className={`w-full rounded-[12px] px-4 py-3 text-sm ${rows > 1 ? 'resize-none' : ''} transition-all duration-200`}
        style={{ background: '#FAFAFA', border: `1.5px solid ${over ? '#EF4444' : C.border}`, color: C.text, lineHeight: 1.6 }}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <div className="flex justify-end mt-1">
        <span className="text-[10px]" style={{ color: over ? '#EF4444' : C.textMuted }}>
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  )
}

/* ── Section wrapper ────────────────────────────────────────────── */
function SectionCard({ accentColor, accentBorder, label, labelColor, labelBg, labelBorder, children }) {
  return (
    <div
      className="rounded-[18px] overflow-hidden"
      style={{ background: C.white, border: `1.5px solid ${accentBorder}`, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
    >
      <div style={{ height: 3, background: accentColor }} />
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[8px] tracking-[0.22em] font-bold uppercase px-2.5 py-1 rounded-full"
            style={{ background: labelBg, border: `1px solid ${labelBorder}`, color: labelColor }}
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

/* ── Main component ─────────────────────────────────────────────── */
export default function SubmitRequest({ onSubmitted }) {
  const [title,    setTitle]    = useState('')
  const [details,  setDetails]  = useState('')
  const [offers,   setOffers]   = useState('')
  const [helpType, setHelpType] = useState([])
  const [industry, setIndustry] = useState([])
  const [time,     setTime]     = useState('15 min')
  const [urgency,  setUrgency]  = useState(null)

  /* ── Derived state ── */
  const tags = [...helpType, ...industry]
  const needsText = [title, details].filter(Boolean).join(' — ')
  const canSubmit = title.trim().length > 0 && offers.trim().length > 0 && helpType.length > 0

  /* ── Multi-select toggle ── */
  const toggleMulti = (_list, setList, max = 3) => (val) => {
    setList((prev) =>
      prev.includes(val)
        ? prev.filter((v) => v !== val)
        : prev.length < max ? [...prev, val] : prev
    )
  }

  /* ── Submit ── */
  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmitted?.({
      needs: needsText,
      offers: offers.trim(),
      category: helpType[0] || 'Other',
      tags,
      time,
      urgency,
    })
    setTitle(''); setDetails(''); setOffers('')
    setHelpType([]); setIndustry([])
    setTime('15 min'); setUrgency(null)
  }

  /* ── Focus helpers ── */
  const focusGold = (e) => { e.target.style.borderColor = C.gold;  e.target.style.boxShadow = '0 0 0 3px rgba(200,169,106,0.12)' }
  const focusWarm = (e) => { e.target.style.borderColor = C.warm;  e.target.style.boxShadow = '0 0 0 3px rgba(139,111,71,0.12)' }
  const blurReset = (e) => { e.target.style.borderColor = C.border; e.target.style.boxShadow = 'none' }

  /* ── Preview urgency chip ── */
  const urgStyle = urgency ? URGENCY_STYLE[urgency] : null
  const urgLabel = URGENCY_OPTIONS.find((o) => o.value === urgency)?.label

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-5 py-7"
    >
      {/* ── Page header ── */}
      <div className="mb-6">
        <p className="text-[10px] tracking-[0.28em] font-semibold uppercase mb-1" style={{ color: C.gold }}>
          ReciRing
        </p>
        <h2 className="font-display text-[24px] font-semibold" style={{ color: C.text }}>
          Post a request
        </h2>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: C.textSub }}>
          Structured requests get 3× more matches.
        </p>
        <p className="text-[11px] mt-2 flex items-center gap-1.5" style={{ color: C.textMuted }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
          </svg>
          Takes about 30 seconds
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Help type (multi, required) ─────────────── */}
        <div>
          <p className="text-[11px] tracking-[0.16em] uppercase font-semibold mb-2.5" style={{ color: C.textSub }}>
            Help type <span style={{ color: '#EF4444' }}>*</span>
            <span className="normal-case tracking-normal font-normal ml-1" style={{ color: C.textMuted }}>select up to 3</span>
          </p>
          <ChipGroup
            options={HELP_TYPES}
            selected={helpType}
            onToggle={toggleMulti(helpType, setHelpType, 3)}
            multi
          />
        </div>

        {/* ── Industry (multi, optional) ──────────────── */}
        <div>
          <p className="text-[11px] tracking-[0.16em] uppercase font-semibold mb-2.5" style={{ color: C.textSub }}>
            Industry
            <span className="normal-case tracking-normal font-normal ml-1" style={{ color: C.textMuted }}>optional, up to 2</span>
          </p>
          <ChipGroup
            options={INDUSTRIES}
            selected={industry}
            onToggle={toggleMulti(industry, setIndustry, 2)}
            multi
          />
        </div>

        {/* ── Time + Urgency (side-by-side) ───────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] tracking-[0.16em] uppercase font-semibold mb-2.5" style={{ color: C.textSub }}>Time</p>
            <ChipGroup options={TIME_OPTIONS} selected={time} onToggle={setTime} />
          </div>
          <div>
            <p className="text-[11px] tracking-[0.16em] uppercase font-semibold mb-2.5" style={{ color: C.textSub }}>Urgency</p>
            <ChipGroup options={URGENCY_OPTIONS} selected={urgency} onToggle={(v) => setUrgency(v)} />
          </div>
        </div>

        {/* ── NEEDS: title + details ─────────────────── */}
        <SectionCard
          accentColor={`linear-gradient(90deg, ${C.gold}, ${C.goldLight})`}
          accentBorder={C.goldLight}
          labelBg={C.goldBg}
          label="Your ask"
          labelColor={C.goldDark}
          labelBorder={C.goldLight}
        >
          <label htmlFor="title" className="block text-[13px] font-semibold mb-2" style={{ color: C.text }}>
            Title <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <CountedInput
            id="title"
            value={title}
            onChange={setTitle}
            placeholder={getTitlePlaceholder(helpType, industry)}
            maxLength={TITLE_MAX}
            onFocus={focusGold}
            onBlur={blurReset}
          />
          <p className="-mt-0.5 mb-1" style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>
            Be specific — e.g. "VC intro for fundraising" or "Resume review for consulting"
          </p>

          <label htmlFor="details" className="block text-[13px] font-semibold mb-2 mt-2" style={{ color: C.text }}>
            Details <span className="font-normal" style={{ color: C.textMuted }}>optional</span>
          </label>
          <CountedInput
            id="details"
            value={details}
            onChange={setDetails}
            placeholder={getDetailsPlaceholder(helpType)}
            maxLength={DETAILS_MAX}
            rows={2}
            onFocus={focusGold}
            onBlur={blurReset}
          />
        </SectionCard>

        {/* ── OFFERS ────────────────────────────────────── */}
        <SectionCard
          accentColor={`linear-gradient(90deg, ${C.warm}, ${C.warmLight})`}
          accentBorder={C.warmBorder}
          labelBg={C.warmBg}
          label="Your offer"
          labelColor={C.warmDark}
          labelBorder={C.warmBorder}
        >
          <label htmlFor="offers" className="block text-[13px] font-semibold mb-2" style={{ color: C.text }}>
            What can you offer in return? <span style={{ color: '#EF4444' }}>*</span>
          </label>

          {/* Quick-fill chips */}
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {OFFER_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setOffers((prev) => {
                  if (!prev.trim()) return p.text
                  const base = prev.trimEnd()
                  const sep = base.endsWith('.') || base.endsWith('!') || base.endsWith('?') ? ' ' : '. '
                  return `${base}${sep}${p.text}`.slice(0, OFFERS_MAX)
                })}
                className="px-2.5 py-1 rounded-full transition-all duration-150 active:scale-95"
                style={{
                  fontSize: 10, fontWeight: 500,
                  background: C.warmBg, border: `1px solid ${C.warmBorder}`, color: C.warmDark,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <CountedInput
            id="offers"
            value={offers}
            onChange={setOffers}
            placeholder="Happy to buy you a drink and chat about consulting recruiting."
            maxLength={OFFERS_MAX}
            rows={2}
            onFocus={focusWarm}
            onBlur={blurReset}
          />
        </SectionCard>

        {/* ── Micro-feedback ─────────────────────────────── */}
        {(() => {
          const fb = getMicroFeedback(title, details, offers, helpType)
          return fb ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-1"
            >
              <span style={{ fontSize: 12, color: '#16A34A' }}>{fb.icon}</span>
              <p style={{ fontSize: 12, color: '#16A34A', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500 }}>
                {fb.text}
              </p>
            </motion.div>
          ) : null
        })()}

        {/* ── Live preview (always visible) ──────────────── */}
        <div style={{ marginTop: 4 }}>
          <p className="mb-2" style={{ fontSize: 12, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
            This is how others will see your request
          </p>
          <div
            className="rounded-[20px] overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF8F2 100%)',
              border: `1px solid ${C.goldLight}`,
              boxShadow: '0 8px 28px rgba(0,0,0,0.06), 0 2px 8px rgba(200,169,106,0.1)',
            }}
          >
            {/* Accent stripe */}
            <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${C.goldLight}, ${C.gold}, ${C.warmBorder}, transparent)` }} />

            <div style={{ padding: '16px 20px 14px' }}>
              {/* Meta chips */}
              <div className="flex items-center flex-wrap" style={{ gap: 5, marginBottom: 14 }}>
                <span style={{
                  background: helpType[0] ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})` : '#E5E7EB',
                  color: helpType[0] ? '#fff' : '#9CA3AF',
                  borderRadius: 99, padding: '3px 10px', fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  {helpType[0] || 'Help type'}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#1A1A1A', color: '#fff',
                  borderRadius: 99, padding: '3px 9px', fontSize: 9, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  <svg width="9" height="9" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M12 6v6l4 2" />
                  </svg>
                  {time}
                </span>
                {urgStyle && (
                  <span style={{
                    background: urgStyle.bg, color: '#fff',
                    borderRadius: 99, padding: '3px 9px', fontSize: 9, fontWeight: 700,
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}>
                    {urgLabel}
                  </span>
                )}
              </div>

              {/* Need title — with placeholder fallback */}
              <p style={{
                fontSize: 15, fontWeight: 600, lineHeight: 1.45,
                color: title.trim() ? C.text : '#D1D5DB',
                fontFamily: 'Inter, system-ui, sans-serif',
                marginBottom: details.trim() ? 4 : 10,
                fontStyle: title.trim() ? 'normal' : 'italic',
              }}>
                {title.trim() || 'Your title will appear here'}
              </p>

              {/* Need details */}
              {details.trim() && (
                <p style={{
                  fontSize: 13, lineHeight: 1.5, color: C.textSub,
                  fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 10,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {details}
                </p>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap" style={{ gap: 4, marginBottom: 10 }}>
                  {tags.map((t) => (
                    <span key={t} style={{
                      fontSize: 9, fontWeight: 500, color: C.textSub,
                      background: '#F5F3F0', border: '1px solid #EDE9E3',
                      borderRadius: 99, padding: '2px 8px', fontFamily: 'Inter, system-ui, sans-serif',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Divider + offer */}
              <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(200,169,106,0.2), transparent)', marginBottom: 10 }} />
              <p style={{
                fontSize: 12, lineHeight: 1.5,
                color: offers.trim() ? '#666' : '#D1D5DB',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontStyle: offers.trim() ? 'normal' : 'italic',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: offers.trim() ? C.warmDark : '#D1D5DB', marginRight: 6 }}>
                  Offering:
                </span>
                {offers.trim() || 'What you offer in return'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Submit ─────────────────────────────────────── */}
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
