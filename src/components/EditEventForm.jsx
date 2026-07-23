import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { fetchEventById, updateEvent } from '../lib/events'
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

// Convert an ISO timestamp to the local date + time strings the
// date/time inputs need.
function splitIsoToLocal(iso) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: '', time: '' }
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return { date, time }
}

/**
 * EditEventForm — mirrors CreateEventForm but pre-fills from an
 * existing event and calls updateEvent on save. Host-only access is
 * enforced by RLS; we also redirect non-hosts to Back as a UX guard.
 */
export default function EditEventForm({ eventId, onSaved, onClose }) {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [event, setEvent]     = useState(null)

  // Form fields
  const [title, setTitle]               = useState('')
  const [description, setDescription]   = useState('')
  const [date, setDate]                 = useState('')
  const [time, setTime]                 = useState('')
  const [location, setLocation]         = useState('')
  const [category, setCategory]         = useState('Social')
  const [maxAttendees, setMaxAttendees] = useState(10)
  const [minAttendees, setMinAttendees] = useState(0)
  const [hostType, setHostType]         = useState('individual')
  const [imageUrl, setImageUrl]         = useState('')
  const [attendeeVisibility, setAttendeeVisibility] = useState('public')

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  // Initial load — pre-fill from DB.
  useEffect(() => {
    let cancelled = false
    if (!eventId) return
    setLoading(true)
    fetchEventById(eventId).then(({ data: ev, error: err }) => {
      if (cancelled) return
      if (err || !ev) {
        setError(err?.message || 'Event not found')
        setLoading(false)
        return
      }
      setEvent(ev)
      setTitle(ev.title || '')
      setDescription(ev.description || '')
      const { date: d, time: t } = splitIsoToLocal(ev.start_at)
      setDate(d); setTime(t)
      setLocation(ev.location || '')
      setCategory(ev.category || 'Social')
      setMaxAttendees(ev.max_attendees || 10)
      setMinAttendees(ev.min_attendees || 0)
      setHostType(ev.host_type || 'individual')
      setImageUrl(ev.image_url || '')
      setAttendeeVisibility(ev.attendee_visibility || 'public')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [eventId])

  const canSubmit = title.trim() && date && time && category && maxAttendees > 0 && !saving

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!canSubmit || !event) return
    if (event.host_user_id !== user?.id) {
      setError('Only the host can edit this event.')
      return
    }

    setSaving(true); setError(null)

    const combined = new Date(`${date}T${time}`)
    if (isNaN(combined.getTime())) {
      setSaving(false); setError('Invalid date or time.'); return
    }

    const clampedMax = Number(maxAttendees) || 10
    const clampedMin = Math.max(0, Math.min(Number(minAttendees) || 0, clampedMax))

    const { data, error: err } = await updateEvent(event.id, {
      title:         title.trim(),
      description:   description.trim(),
      start_at:      combined.toISOString(),
      location:      location.trim(),
      category,
      max_attendees: clampedMax,
      min_attendees: clampedMin,
      host_type:     hostType,
      image_url:     imageUrl.trim() || null,
      attendee_visibility: attendeeVisibility,
    })

    setSaving(false)
    if (err) {
      setError(err.message || 'Failed to update event.')
      return
    }
    onSaved?.(data)
  }

  if (loading) {
    return (
      <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Loading…
        </p>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4', padding: 24 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.goldDark, cursor: 'pointer', fontSize: 14, marginBottom: 12 }}>
          ← Back
        </button>
        <p style={{ color: C.textMuted, textAlign: 'center', marginTop: 40 }}>{error || 'Event not found.'}</p>
      </div>
    )
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
              Edit event
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'none', border: 'none', cursor: saving ? 'default' : 'pointer',
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
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value.slice(0, 120))}
                placeholder="e.g. Trinity Bellwoods Park"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Max attendees <span style={{ color: C.danger }}>*</span></label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={maxAttendees}
                  // Raw while typing, clamp on blur — clamping in onChange
                  // makes the field impossible to clear (fb6); see
                  // CreateEventForm for the full story.
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
            <p style={{ ...helperStyle, marginBottom: 18 }}>
              Current: {event.attendee_count || 0} joined. Lowering max won't kick anyone out. We'll ping you 24h before if turnout is below min (0 = skip the check).
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Description</label>
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
              <p style={{ fontSize: 12, color: C.textMuted, margin: '2px 0 8px', lineHeight: 1.45 }}>
                Who can see the participant list. Emails stay host-only either way.
              </p>
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
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
