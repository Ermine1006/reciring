import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { INDUSTRIES, HELP_TYPES } from '../data/requestOptions'
import { PROGRAMS, CAREER_STAGES, NETWORKING_INTENTS } from '../data/onboardingOptions'
import AnonymousAvatar from './AnonymousAvatar'
import Chip from './Chip'
import PRESET_AVATARS from '../data/presetAvatars'
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
  danger:    '#DC2626',
  success:   '#16A34A',
}

/** Resolve a `preset:key` avatar_url → the seed for AnonymousAvatar. */
export function resolveAvatarSeed(avatarUrl) {
  if (!avatarUrl?.startsWith('preset:')) return null
  const key = avatarUrl.slice(7)
  return PRESET_AVATARS.find(a => a.key === key)?.seed ?? null
}

// ── Small shared styles for field labels ───────────────────────
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

// ── Section wrapper ────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section
      className="rounded-2xl p-5 mb-4"
      style={{ background: C.white, border: `1px solid ${C.border}` }}
    >
      <h2 className="text-xs uppercase tracking-wider mb-5" style={{ color: C.textMuted }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

// ── Field row (label + helper + body) ──────────────────────────
function Field({ label, helper, required, children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 18 }}>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      {helper && <p style={helperStyle}>{helper}</p>}
      {children}
    </div>
  )
}

// ── Toggle helper for multi-select chip arrays ────────────────
function makeToggle(setter, max = Infinity) {
  return (val) => setter(prev =>
    prev.includes(val) ? prev.filter(v => v !== val) : prev.length < max ? [...prev, val] : prev
  )
}

// ────────────────────────────────────────────────────────────────
// SettingsPage — used as the "My Profile" sub-tab content inside
// ProfilePage. Holds only the editor (basic profile / professional
// matching / personality prompts + Save changes). Account-level
// concerns (email prefs, logout, delete) live in SettingsTab.
// ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, profile, updateProfile } = useAuth()

  // Avatar
  const [selectedKey, setSelectedKey] = useState(
    profile?.avatar_url?.startsWith('preset:') ? profile.avatar_url.slice(7) : null,
  )
  const selectedAvatar = PRESET_AVATARS.find(a => a.key === selectedKey)

  // Basic
  const [name, setName]               = useState(profile?.name || '')
  const [program, setProgram]         = useState(profile?.program || '')
  const [headline, setHeadline]       = useState(profile?.headline || '')
  const [careerStage, setCareerStage] = useState(profile?.career_stage || '')

  // Professional
  const [industryInterests, setIndustryInterests] = useState(profile?.industry_interests || [])
  const [canHelpWith, setCanHelpWith]             = useState(profile?.can_help_with || [])
  const [skillsToLearn, setSkillsToLearn]         = useState(profile?.skills_to_learn || [])
  const [networkingIntent, setNetworkingIntent]   = useState(profile?.networking_intent || [])

  // Personality
  const [promptAskMe, setPromptAskMe]     = useState(profile?.prompt_ask_me || '')
  const [promptWeekend, setPromptWeekend] = useState(profile?.prompt_weekend || '')
  const [visibility, setVisibility]       = useState(profile?.visibility || VISIBILITY_PRIVATE)

  // Save state — account-level state (email subscription, delete,
  // support modal) moved to SettingsTab.
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  const toggleNetworkingIntent = (id) => setNetworkingIntent(prev =>
    prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
  )

  const handleSave = async () => {
    setSaving(true); setStatus(null)
    const { error } = await updateProfile({
      name:               name.trim() || 'Anonymous',
      avatar_url:         selectedKey ? `preset:${selectedKey}` : null,
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
    })
    setSaving(false)
    setStatus(error
      ? { type: 'err', msg: error.message || 'Failed to save.' }
      : { type: 'ok', msg: 'Profile updated.' })
  }

  return (
    // Plain block — the scroll container lives in the parent (ProfilePage).
    // Nesting another flex-1 phone-scroll here would break scrolling: the
    // flex parent would size this child by its flex factor, hiding the
    // overflow.
    <div style={{ background: '#F9F7F4' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pt-5 pb-10"
      >
        {/* Header is provided by parent ProfilePage */}

        {/* ── 1. Basic Profile ────────────────────────────────── */}
        <Section title="Basic profile">
          {/* Avatar preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
            <div style={{
              borderRadius: '50%',
              border: `3px solid ${C.goldLight}`,
              boxShadow: '0 4px 20px rgba(200,169,106,0.25)',
              marginBottom: 8,
            }}>
              <AnonymousAvatar
                seed={selectedAvatar?.seed || profile?.id || 'default'}
                size={84}
              />
            </div>
            <p style={{ fontSize: 12, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {selectedAvatar?.label || 'Default'}
            </p>
          </div>

          <Field label="Choose avatar">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 10,
            }}>
              {PRESET_AVATARS.map((av) => {
                const isActive = av.key === selectedKey
                return (
                  <button
                    key={av.key}
                    type="button"
                    onClick={() => setSelectedKey(av.key)}
                    title={av.label}
                    style={{
                      padding: 0, background: 'none', cursor: 'pointer',
                      border: isActive ? `2.5px solid ${C.gold}` : '2.5px solid transparent',
                      borderRadius: '50%',
                      boxShadow: isActive ? `0 0 0 2px ${C.goldLight}, 0 4px 12px rgba(200,169,106,0.3)` : 'none',
                      transform: isActive ? 'scale(1.08)' : 'scale(1)',
                      transition: 'all 0.15s ease',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <AnonymousAvatar seed={av.seed} size={52} />
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Display name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 30))}
              placeholder="Anonymous"
              style={inputStyle}
            />
          </Field>

          <Field label="Email">
            <input
              value={user?.email || ''}
              readOnly
              style={{ ...inputStyle, color: C.textMuted, cursor: 'not-allowed', background: '#F5F5F5' }}
            />
          </Field>

          <Field label="Program">
            <div className="flex flex-wrap gap-2">
              {PROGRAMS.map(p => (
                <Chip key={p} label={p} active={program === p} onClick={() => setProgram(p)} />
              ))}
            </div>
          </Field>

          <Field label="Current role" helper="What you're doing right now — student, role at Co.">
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value.slice(0, 80))}
              placeholder="e.g. MBA '26, ex-PM at Shopify"
              style={inputStyle}
            />
          </Field>

          <Field label="Career stage" last>
            <div className="flex flex-wrap gap-2">
              {CAREER_STAGES.map(s => (
                <Chip key={s} label={s} active={careerStage === s} onClick={() => setCareerStage(s)} />
              ))}
            </div>
          </Field>
        </Section>

        {/* ── 1b. Profile visibility ─────────────────────────── */}
        <Section title="Profile visibility">
          <Field
            label="How others see your posts in Discover"
            helper="You can change this anytime. Matching and chat are unaffected."
            last
          >
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
          </Field>
        </Section>

        {/* ── 2. Professional Matching ────────────────────────── */}
        <Section title="Professional matching">
          <Field label="Industry focus" helper="Pick up to 3 — surfaces the right requests for you.">
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map(ind => (
                <Chip
                  key={ind}
                  label={ind}
                  active={industryInterests.includes(ind)}
                  onClick={makeToggle(setIndustryInterests, 3)}
                />
              ))}
            </div>
          </Field>

          <Field label="Skills I offer" helper="Up to 5 — what peers can come to you for.">
            <div className="flex flex-wrap gap-2">
              {HELP_TYPES.map(ht => (
                <Chip
                  key={`offer-${ht}`}
                  label={ht}
                  active={canHelpWith.includes(ht)}
                  onClick={makeToggle(setCanHelpWith, 5)}
                />
              ))}
            </div>
          </Field>

          <Field label="Skills I want to learn" helper="Up to 5 — what you'd love a peer to teach you.">
            <div className="flex flex-wrap gap-2">
              {HELP_TYPES.map(ht => (
                <Chip
                  key={`learn-${ht}`}
                  label={ht}
                  active={skillsToLearn.includes(ht)}
                  onClick={makeToggle(setSkillsToLearn, 5)}
                />
              ))}
            </div>
          </Field>

          <Field label="I'm here to find" helper="Multi-select. Drives the AI match scorer." last>
            <div className="flex flex-wrap gap-2">
              {NETWORKING_INTENTS.map(opt => (
                <Chip
                  key={opt.id}
                  label={opt.label}
                  active={networkingIntent.includes(opt.id)}
                  onClick={() => toggleNetworkingIntent(opt.id)}
                />
              ))}
            </div>
          </Field>
        </Section>

        {/* ── 3. Personality prompts ──────────────────────────── */}
        <Section title="Personality prompts">
          <Field label="Ask me about…" helper="A topic, a skill, an industry — anything you'd love to be asked about.">
            <input
              value={promptAskMe}
              onChange={(e) => setPromptAskMe(e.target.value.slice(0, 160))}
              placeholder="e.g. growth at a Series A, breaking into VC, founder fundraising"
              style={inputStyle}
            />
          </Field>

          <Field label="Weekend you're most likely to find me…" helper="A glimpse of who you are outside work." last>
            <input
              value={promptWeekend}
              onChange={(e) => setPromptWeekend(e.target.value.slice(0, 160))}
              placeholder="e.g. hiking the Bruce Trail with a podcast in my ears"
              style={inputStyle}
            />
          </Field>
        </Section>

        {/* ── Save changes ────────────────────────────────────── */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
              color: '#fff',
              border: 'none',
              opacity: saving ? 0.6 : 1,
              boxShadow: '0 6px 20px rgba(200,169,106,0.35)',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>

          <AnimatePresence>
            {status && (
              <motion.div
                key={status.msg}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: status.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
                  border: `1px solid ${status.type === 'ok' ? '#BBF7D0' : '#FECACA'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 16 }}>
                  {status.type === 'ok' ? '✓' : '⚠'}
                </span>
                <p style={{
                  fontSize: 13, fontWeight: 500,
                  color: status.type === 'ok' ? C.success : C.danger,
                  fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
                }}>
                  {status.msg}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
