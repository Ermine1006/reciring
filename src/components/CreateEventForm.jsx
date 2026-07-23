import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { createEvent } from '../lib/events'
import { EVENT_CATEGORIES } from '../data/eventCategories'
import Chip from './Chip'

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
}

const labelStyle = {
  display: 'block', fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', fontWeight: 600, color: C.textSub,
  marginBottom: 8, fontFamily: 'Inter, system-ui, sans-serif',
}
const helperStyle = {
  marginTop: -4, marginBottom: 8,
  fontSize: 11, color: C.textMuted,
  fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.4,
}
const inputStyle = {
  width: '100%', background: '#FAFAFA',
  border: `1.5px solid ${C.border}`, color: C.text, outline: 'none',
  padding: '12px 16px', borderRadius: 12, fontSize: 14,
  fontFamily: 'Inter, system-ui, sans-serif',
}

// Default date input value: tomorrow at 6pm local. Helps users land in
// the right ballpark and avoids the awkward "past date" UX on first open.
function defaultDateValue() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function defaultTimeValue() { return '18:00' }

// Draft persistence (beta fb7): iOS reclaims the webview whenever the app
// sits in the background — a tester tabbed away mid-form to look something
// up and came back to an empty page. Mirror the fields into localStorage as
// they change, restore on mount, expire after a day, clear on submit.
// try/catch so private browsing degrades to "no drafts" instead of crashing.
const DRAFT_KEY = 'mutu:eventDraft'
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
function readDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d?.savedAt || Date.now() - d.savedAt > DRAFT_TTL_MS) return null
    return d
  } catch { return null }
}
function writeDraft(d) { try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {} }
function clearDraft()  { try { window.localStorage.removeItem(DRAFT_KEY) } catch {} }

// App.jsx uses this on boot to decide whether to reopen the create-event
// form after an iOS webview reload. Tighter window than the draft's own TTL:
// only auto-reopen when the user was interrupted moments ago. An older draft
// still exists and still repopulates the fields, but only when the user opens
// the form themselves — we don't hijack a fresh app launch hours later.
const AUTO_RESUME_MS = 15 * 60 * 1000
export function hasFreshEventDraft() {
  const d = readDraft()
  return Boolean(d && Date.now() - d.savedAt < AUTO_RESUME_MS)
}

export default function CreateEventForm({ onCreated, onClose }) {
  const { user, profile } = useAuth()

  const [draft] = useState(readDraft)
  const [title, setTitle]               = useState(draft?.title ?? '')
  const [description, setDescription]   = useState(draft?.description ?? '')
  const [date, setDate]                 = useState(draft?.date ?? defaultDateValue())
  const [time, setTime]                 = useState(draft?.time ?? defaultTimeValue())
  const [location, setLocation]         = useState(draft?.location ?? '')
  const [category, setCategory]         = useState(draft?.category ?? 'Social')
  const [maxAttendees, setMaxAttendees] = useState(draft?.maxAttendees ?? 10)
  const [minAttendees, setMinAttendees] = useState(draft?.minAttendees ?? 0)
  const [hostType, setHostType]         = useState(draft?.hostType ?? 'individual')
  const [imageUrl, setImageUrl]         = useState(draft?.imageUrl ?? '')
  const [attendeeVisibility, setAttendeeVisibility] = useState(draft?.attendeeVisibility ?? 'public')

  const snapshot = () => ({
    savedAt: Date.now(),
    title, description, date, time, location, category,
    maxAttendees, minAttendees, hostType, imageUrl, attendeeVisibility,
  })

  // Save on every change. No "did they type something" guard: being on the
  // create form IS the intent to create, and requiring a specific text field
  // meant a form filled out only via date/time/attendee pickers never saved
  // (a real gap behind the repeated "my draft is gone" reports). The draft
  // clears on cancel and on submit, so an abandoned empty form is harmless.
  useEffect(() => {
    writeDraft(snapshot())
  }, [title, description, date, time, location, category, maxAttendees, minAttendees, hostType, imageUrl, attendeeVisibility])

  // Belt-and-suspenders save the instant the app is backgrounded. iOS can
  // freeze/reclaim the webview the moment you switch apps — before the
  // change-driven effect above has flushed the last keystroke. visibilitychange
  // and pagehide both fire while the page is still alive, so the draft is
  // guaranteed current at the exact moment loss would otherwise happen.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') writeDraft(snapshot()) }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }) // no deps: re-bind each render so the closure always sees current fields

  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const canSubmit = title.trim() && date && time && category && maxAttendees > 0 && !saving

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    if (!user)       { setError('You must be signed in to create an event.'); return }

    setSaving(true); setError(null)

    // Build a local-time ISO timestamp by combining date + time inputs.
    // The browser interprets `${date}T${time}` as local time; toISOString
    // converts to UTC for storage. DB stores timestamptz so this round-trips
    // correctly for any user timezone.
    const combined = new Date(`${date}T${time}`)
    if (isNaN(combined.getTime())) {
      setSaving(false); setError('Invalid date or time.'); return
    }
    if (combined.getTime() < Date.now() - 60_000) {
      setSaving(false); setError('Event time must be in the future.'); return
    }

    const hostDisplayName =
      hostType === 'business'
        ? (location.trim() || profile?.name || 'Sponsor')
        : (profile?.name || user.email?.split('@')[0] || 'Host')

    // Clamp min to [0, max] so the DB CHECK (min<=max) never errors.
    const clampedMax = Number(maxAttendees) || 10
    const clampedMin = Math.max(0, Math.min(Number(minAttendees) || 0, clampedMax))

    const { data, error: err } = await createEvent({
      title:             title.trim(),
      description:       description.trim(),
      start_at:          combined.toISOString(),
      location:          location.trim(),
      category,
      max_attendees:     clampedMax,
      min_attendees:     clampedMin,
      host_display_name: hostDisplayName,
      host_type:         hostType,
      image_url:         imageUrl.trim() || null,
      is_sponsored:      hostType === 'business',
      attendee_visibility: attendeeVisibility,
    })

    setSaving(false)
    if (err) {
      setError(err.message || 'Failed to create event.')
      return
    }
    clearDraft()
    onCreated?.(data)
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pt-5 pb-10"
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <p style={{
              fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
              fontWeight: 600, color: C.gold, margin: 0,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Community
            </p>
            <h1 className="font-display" style={{
              fontSize: 22, fontWeight: 600, color: C.text,
              margin: '4px 0 0', letterSpacing: '-0.02em',
            }}>
              Create event
            </h1>
          </div>
          <button
            type="button"
            // Explicit cancel discards the draft; only a background reload
            // (which never runs this) should resurrect the form.
            onClick={() => { clearDraft(); onClose?.() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, color: C.goldDark,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <section
            className="rounded-2xl p-5 mb-4"
            style={{ background: C.white, border: `1px solid ${C.border}` }}
          >
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Title <span style={{ color: C.danger }}>*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                placeholder="e.g. Sunday Morning Yoga"
                autoFocus
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Category <span style={{ color: C.danger }}>*</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {EVENT_CATEGORIES.map(opt => (
                  <Chip
                    key={opt.id}
                    label={`${opt.emoji} ${opt.label}`}
                    active={category === opt.id}
                    onClick={() => setCategory(opt.id)}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Date <span style={{ color: C.danger }}>*</span></label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Time <span style={{ color: C.danger }}>*</span></label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Location</label>
              <p style={helperStyle}>Address, venue name, or "TBD".</p>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value.slice(0, 120))}
                placeholder="e.g. Trinity Bellwoods Park"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Max attendees <span style={{ color: C.danger }}>*</span></label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={maxAttendees}
                  // Store the raw value while typing. Clamping inside onChange
                  // turns '' into 1, which makes the field impossible to clear:
                  // deleting snaps back to "1" and typing 5 produces "15"
                  // (beta feedback fb6). Clamp on blur instead; submit already
                  // re-clamps, and canSubmit blocks an empty field.
                  onChange={(e) => setMaxAttendees(e.target.value)}
                  onBlur={() => {
                    if (maxAttendees !== '') setMaxAttendees(Math.max(1, Math.min(500, Number(maxAttendees) || 1)))
                  }}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Min attendees</label>
                <input
                  type="number"
                  min={0}
                  max={maxAttendees}
                  value={minAttendees}
                  onChange={(e) => setMinAttendees(e.target.value)}
                  onBlur={() => setMinAttendees(Math.max(0, Math.min(Number(maxAttendees) || 0, Number(minAttendees) || 0)))}
                  style={inputStyle}
                />
              </div>
            </div>
            <p style={{ ...helperStyle, marginTop: -10, marginBottom: 18 }}>
              We'll ping you 24h before if turnout is below your minimum. Leave at 0 to skip the check.
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Description</label>
              <p style={helperStyle}>What's the vibe? What should attendees bring or expect?</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 600))}
                placeholder="e.g. Casual pickup volleyball. All skill levels welcome."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 96 }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Host type</label>
              <p style={helperStyle}>Choose business for sponsor / venue-hosted events.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { id: 'individual', label: 'Individual' },
                  { id: 'club',       label: 'Club' },
                  { id: 'business',   label: 'Business / Sponsor' },
                ].map(opt => (
                  <Chip
                    key={opt.id}
                    label={opt.label}
                    active={hostType === opt.id}
                    onClick={() => setHostType(opt.id)}
                  />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Attendee list</label>
              <p style={helperStyle}>Who can see the participant list. Emails stay host-only either way.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { id: 'public',  badge: '🌐', label: 'Public',  desc: 'Attendees and browsers can see each other — recommended for networking events.' },
                  { id: 'private', badge: '🔒', label: 'Private', desc: 'Only the host sees names; everyone else sees the attendee count.' },
                ].map(opt => {
                  const active = attendeeVisibility === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAttendeeVisibility(opt.id)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: active ? `1.5px solid ${C.gold}` : '1.5px solid rgba(0,0,0,0.12)',
                        background: active ? 'rgba(200,169,106,0.10)' : '#fff',
                        cursor: 'pointer',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>
                        <span>{opt.badge}</span>
                        <span>{opt.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 3, lineHeight: 1.4 }}>
                        {opt.desc}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: 0 }}>
              <label style={labelStyle}>Image URL</label>
              <p style={helperStyle}>Optional — paste a link to a hero image.</p>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                style={inputStyle}
              />
            </div>
          </section>

          {error && (
            <div
              style={{
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 12, padding: '10px 14px', marginBottom: 12,
              }}
            >
              <p style={{
                fontSize: 13, fontWeight: 500, color: C.danger,
                fontFamily: 'Inter, system-ui, sans-serif', margin: 0,
              }}>
                {error}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full active:scale-[0.98]"
            style={{
              width: '100%', padding: '14px 0',
              borderRadius: 14,
              background: canSubmit
                ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                : '#F3F4F6',
              color: canSubmit ? '#fff' : C.textMuted,
              border: 'none',
              boxShadow: canSubmit ? '0 6px 20px rgba(200,169,106,0.35)' : 'none',
              fontSize: 14, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: canSubmit ? 'pointer' : 'default',
              transition: 'all 0.18s',
            }}
          >
            {saving ? 'Creating…' : 'Create event'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
