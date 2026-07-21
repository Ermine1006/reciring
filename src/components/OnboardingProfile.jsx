import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { INDUSTRIES, HELP_TYPES } from '../data/requestOptions'
import { PROGRAMS, CAREER_STAGES, NETWORKING_INTENTS } from '../data/onboardingOptions'
import { useAuth } from '../context/AuthContext'
import ReciRingLogo from './ReciRingLogo'
import Chip from './Chip'
import { VISIBILITY_OPTIONS, VISIBILITY_PRIVATE } from '../lib/visibility'

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

// ── Atoms ──────────────────────────────────────────────────────

function StepDots({ step, total }) {
  return (
    <div className="flex justify-center gap-2 mb-4">
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1
        const done = idx < step
        const active = idx === step
        return (
          <span
            key={idx}
            style={{
              width: active ? 22 : 7, height: 7, borderRadius: 99,
              background: done || active ? C.gold : C.border,
              transition: 'all 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        )
      })}
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', fontWeight: 600, color: C.textSub,
  marginBottom: 8, fontFamily: 'Inter, system-ui, sans-serif',
}

const helperStyle = {
  marginTop: -2, marginBottom: 8,
  fontSize: 11, color: C.textMuted,
  fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.4,
}

const inputStyle = {
  width: '100%', background: '#FAFAFA',
  border: `1.5px solid ${C.border}`, color: C.text, outline: 'none',
  padding: '12px 16px', borderRadius: 12, fontSize: 14,
  fontFamily: 'Inter, system-ui, sans-serif',
}

const stepCopy = {
  1: { title: 'Tell us about you',         subtitle: 'The basics — used to introduce you to relevant peers.' },
  2: { title: 'What you bring & want',     subtitle: 'Powers the AI matching. The more honest, the better the fit.' },
  3: { title: 'A little personality',      subtitle: 'Optional prompts that show up on your card.' },
}

// ── Main wizard ────────────────────────────────────────────────

export default function OnboardingProfile() {
  const { updateProfile, user } = useAuth()

  const [step, setStep]           = useState(1)
  const [direction, setDirection] = useState(1)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState(null)

  // Step 1
  const [displayName, setDisplayName] = useState('')
  const [program, setProgram]         = useState('')
  const [headline, setHeadline] = useState('')
  const [careerStage, setCareerStage] = useState('')

  // Step 2
  const [industryInterests, setIndustryInterests] = useState([])
  const [canHelpWith, setCanHelpWith]             = useState([])
  const [skillsToLearn, setSkillsToLearn]         = useState([])
  const [networkingIntent, setNetworkingIntent]   = useState([])
  const [visibility, setVisibility]               = useState(VISIBILITY_PRIVATE)

  // Step 3
  const [promptAskMe, setPromptAskMe]     = useState('')
  const [promptWeekend, setPromptWeekend] = useState('')

  const toggleList = (setList, max = Infinity) => (val) => {
    setList(prev =>
      prev.includes(val)
        ? prev.filter(v => v !== val)
        : prev.length < max ? [...prev, val] : prev
    )
  }

  // Per-step validation
  const canAdvance =
    step === 1 ? Boolean(displayName.trim() && program) :
    step === 2 ? networkingIntent.length > 0 :
    true

  const validationMessage =
    step === 1 ? 'Display name and program are required.' :
    step === 2 ? 'Pick at least one networking intent to continue.' :
    null

  const handleNext = () => {
    setError(null)
    if (!canAdvance) { setError(validationMessage); return }
    setDirection(1)
    setStep(s => s + 1)
  }

  const handleBack = () => {
    setError(null)
    setDirection(-1)
    setStep(s => Math.max(1, s - 1))
  }

  const handleSubmit = async () => {
    if (saving) return
    setSaving(true)
    setError(null)

    const { error: err } = await updateProfile({
      name:               displayName.trim(),
      program,
      headline:           headline.trim(),
      career_stage:       careerStage,
      industry_interests: industryInterests,
      can_help_with:      canHelpWith,
      skills_to_learn:    skillsToLearn,
      networking_intent:  networkingIntent,
      prompt_ask_me:      promptAskMe.trim(),
      prompt_weekend:     promptWeekend.trim(),
      visibility,
      onboarding_done:    true,
    })

    setSaving(false)
    if (err) {
      setError(typeof err === 'string' ? err : err.message)
    }
    // Welcome email is triggered on first profile creation in AuthContext.
    // No need to re-trigger here on onboarding completion.
  }

  const handleSkipAll = async () => {
    if (!canAdvance) {
      setError('Display name, program, and networking intent are still required to skip.')
      return
    }
    await handleSubmit()
  }

  // Slide animation — direction-aware
  const variants = {
    enter:  (dir) => ({ x: dir > 0 ? 28 : -28, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (dir) => ({ x: dir > 0 ? -28 : 28, opacity: 0 }),
  }

  return (
    <div
      className="safe-screen w-full min-h-[100dvh] flex items-start sm:items-center justify-center px-4 py-8"
      style={{ background: '#EEE9E0' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%', maxWidth: 400,
          background: C.white,
          borderRadius: 28,
          padding: '36px 28px 32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.10), 0 4px 16px rgba(200,169,106,0.12)',
          maxHeight: '92dvh', overflowY: 'auto',
        }}
      >
        <div className="flex justify-center mb-5">
          <ReciRingLogo size={32} />
        </div>

        <StepDots step={step} total={3} />

        <h1
          className="text-center font-display"
          style={{ fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 4 }}
        >
          {stepCopy[step].title}
        </h1>
        <p className="text-center mb-6" style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5 }}>
          {stepCopy[step].subtitle}
        </p>

        {/* Step body */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            {step === 1 && (
              <>
                <div>
                  <label style={labelStyle}>
                    Display name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, 30))}
                    placeholder="Pick a nickname — shown on leaderboard"
                    autoFocus
                    style={inputStyle}
                  />
                  <p style={{ ...helperStyle, marginTop: 6 }}>
                    Does not need to be your real name.
                  </p>
                </div>

                <div>
                  <label style={labelStyle}>School email</label>
                  <div style={{
                    ...inputStyle,
                    background: '#F5F5F5', color: C.textMuted,
                  }}>
                    {user?.email}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>
                    Program <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PROGRAMS.map(p => (
                      <Chip key={p} label={p} active={program === p} onClick={() => setProgram(p)} />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Current role</label>
                  <p style={helperStyle}>What you're doing right now — student, role at Co.</p>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value.slice(0, 80))}
                    placeholder="e.g. MBA '26, ex-PM at Shopify"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Career stage</label>
                  <div className="flex flex-wrap gap-2">
                    {CAREER_STAGES.map(s => (
                      <Chip key={s} label={s} active={careerStage === s} onClick={() => setCareerStage(s)} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label style={labelStyle}>Industry focus</label>
                  <p style={helperStyle}>Pick up to 3 — surfaces the right requests for you.</p>
                  <div className="flex flex-wrap gap-2">
                    {INDUSTRIES.map(ind => (
                      <Chip
                        key={ind}
                        label={ind}
                        active={industryInterests.includes(ind)}
                        onClick={toggleList(setIndustryInterests, 3)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Skills I offer</label>
                  <p style={helperStyle}>Up to 5 — what peers can come to you for.</p>
                  <div className="flex flex-wrap gap-2">
                    {HELP_TYPES.map(ht => (
                      <Chip
                        key={ht}
                        label={ht}
                        active={canHelpWith.includes(ht)}
                        onClick={toggleList(setCanHelpWith, 5)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Skills I want to learn</label>
                  <p style={helperStyle}>Up to 5 — what you'd love a peer to teach you.</p>
                  <div className="flex flex-wrap gap-2">
                    {HELP_TYPES.map(ht => (
                      <Chip
                        key={`learn-${ht}`}
                        label={ht}
                        active={skillsToLearn.includes(ht)}
                        onClick={toggleList(setSkillsToLearn, 5)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>
                    I'm here to find <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <p style={helperStyle}>Multi-select. Drives the AI match scorer.</p>
                  <div className="flex flex-wrap gap-2">
                    {NETWORKING_INTENTS.map(opt => (
                      <Chip
                        key={opt.id}
                        label={opt.label}
                        active={networkingIntent.includes(opt.id)}
                        onClick={() => setNetworkingIntent(prev =>
                          prev.includes(opt.id) ? prev.filter(v => v !== opt.id) : [...prev, opt.id]
                        )}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Profile visibility</label>
                  <p style={helperStyle}>
                    How peers see your posts in Discover. You can change this later in Settings.
                  </p>
                  <div className="flex flex-col gap-2">
                    {VISIBILITY_OPTIONS.map(opt => {
                      const active = visibility === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setVisibility(opt.id)}
                          className="text-left rounded-xl border px-4 py-3 transition"
                          style={{
                            borderColor: active ? '#C8A96A' : 'rgba(0,0,0,0.12)',
                            background:  active ? 'rgba(200,169,106,0.10)' : '#fff',
                          }}
                        >
                          <div className="flex items-center gap-2 font-medium" style={{ color: '#1a1a1a' }}>
                            <span>{opt.badge}</span>
                            <span>{opt.label}</span>
                          </div>
                          <div className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.55)' }}>
                            {opt.description}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <label style={labelStyle}>Ask me about…</label>
                  <p style={helperStyle}>A topic, a skill, an industry — anything you'd love to be asked about.</p>
                  <input
                    type="text"
                    value={promptAskMe}
                    onChange={(e) => setPromptAskMe(e.target.value.slice(0, 160))}
                    placeholder="e.g. growth at a Series A, breaking into VC, founder fundraising"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Weekend you're most likely to find me…</label>
                  <p style={helperStyle}>A glimpse of who you are outside work.</p>
                  <input
                    type="text"
                    value={promptWeekend}
                    onChange={(e) => setPromptWeekend(e.target.value.slice(0, 160))}
                    placeholder="e.g. hiking the Bruce Trail with a podcast in my ears"
                    style={inputStyle}
                  />
                </div>

                <p style={{
                  fontSize: 11, color: C.textMuted, textAlign: 'center',
                  fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5,
                  marginTop: 8,
                }}>
                  These prompts are optional — skip and refine later in your profile.
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="text-center mt-4" style={{ fontSize: 12, color: '#EF4444' }}>
            {error}
          </p>
        )}

        {/* Navigation */}
        <div className="flex gap-2 mt-6">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={saving}
              className="rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
              style={{
                flex: '0 0 96px',
                padding: '13px 0',
                background: C.white,
                color: C.textSub,
                border: `1.5px solid ${C.border}`,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={step < 3 ? handleNext : handleSubmit}
            disabled={saving || (step < 3 && !canAdvance)}
            className="flex-1 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]"
            style={{
              padding: '13px 0',
              background: (saving || (step < 3 && !canAdvance))
                ? '#F3F4F6'
                : `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              color: (saving || (step < 3 && !canAdvance)) ? C.textMuted : '#fff',
              boxShadow: (saving || (step < 3 && !canAdvance))
                ? 'none'
                : '0 6px 20px rgba(200,169,106,0.35)',
              border: 'none',
              cursor: (saving || (step < 3 && !canAdvance)) ? 'default' : 'pointer',
            }}
          >
            {step < 3 ? 'Continue' : (saving ? 'Saving…' : 'Start discovering')}
          </button>
        </div>

        {/* Skip — only on step 3, and only if required fields are satisfied */}
        {step === 3 && (
          <button
            type="button"
            onClick={handleSkipAll}
            disabled={saving}
            className="w-full mt-3 py-2 text-[12px] tracking-wide transition-opacity hover:opacity-60"
            style={{ color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Skip prompts — finish later
          </button>
        )}
      </motion.div>
    </div>
  )
}
