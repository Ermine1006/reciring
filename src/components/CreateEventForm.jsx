import { useState } from 'react'
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

export default function CreateEventForm({ onCreated, onClose }) {
  const { user, profile } = useAuth()

  const [title, setTitle]               = useState('')
  const [description, setDescription]   = useState('')
  const [date, setDate]                 = useState(defaultDateValue())
  const [time, setTime]                 = useState(defaultTimeValue())
  const [location, setLocation]         = useState('')
  const [category, setCategory]         = useState('Social')
  const [maxAttendees, setMaxAttendees] = useState(10)
  const [hostType, setHostType]         = useState('individual')
  const [imageUrl, setImageUrl]         = useState('')

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

    const { data, error: err } = await createEvent({
      title:             title.trim(),
      description:       description.trim(),
      start_at:          combined.toISOString(),
      location:          location.trim(),
      category,
      max_attendees:     Number(maxAttendees) || 10,
      host_display_name: hostDisplayName,
      host_type:         hostType,
      image_url:         imageUrl.trim() || null,
      is_sponsored:      hostType === 'business',
    })

    setSaving(false)
    if (err) {
      setError(err.message || 'Failed to create event.')
      return
    }
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
            onClick={onClose}
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

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Max attendees <span style={{ color: C.danger }}>*</span></label>
              <p style={helperStyle}>Cap between 1 and 500.</p>
              <input
                type="number"
                min={1}
                max={500}
                value={maxAttendees}
                onChange={(e) => setMaxAttendees(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                style={inputStyle}
              />
            </div>

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
