import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
}

const inputStyle = {
  padding: '12px 16px', borderRadius: 14,
  border: '1.5px solid #E5E7EB',
  fontSize: 15, fontFamily: 'Inter, system-ui, sans-serif', color: '#111',
  outline: 'none', background: '#F9F9F9', width: '100%',
  boxSizing: 'border-box',
}

export default function CoffeeChatModal({ onConfirm, onClose, initialValues }) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const defaultDate = tomorrow.toISOString().split('T')[0]

  // Pre-fill from previous meeting when rescheduling
  const initDate = initialValues?.datetime ? new Date(initialValues.datetime).toISOString().split('T')[0] : defaultDate
  const initTime = initialValues?.datetime ? new Date(initialValues.datetime).toTimeString().slice(0, 5) : '14:00'
  const initLocation = initialValues?.location || 'Madison Pub'

  const [date, setDate]         = useState(initDate)
  const [time, setTime]         = useState(initTime)
  const [location, setLocation] = useState(initLocation)
  const [selectedQuick, setSelectedQuick] = useState(null)

  const handleConfirm = () => {
    if (!date || !time) return
    const datetime = new Date(`${date}T${time}:00`).toISOString()
    onConfirm({ datetime, location: location.trim() || 'Madison Pub' })
  }

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        style={{
          width: '100%', background: C.white,
          borderRadius: '28px 28px 0 0',
          padding: '8px 24px 36px',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.14)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 18px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E5E7EB' }} />
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{ fontSize: 36, lineHeight: 1 }}>☕</span>
          <h3 style={{
            fontSize: 20, fontWeight: 700, color: C.text,
            fontFamily: 'Inter, system-ui, sans-serif', marginTop: 10, marginBottom: 6,
          }}>
            Suggest a Coffee Chat
          </h3>
          <p style={{ fontSize: 13, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.5 }}>
            Pick a quick option or customize below
          </p>
        </div>

        {/* Quick-select buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Tomorrow afternoon', days: 1, hour: '14:00' },
            { label: 'This week',          days: 3, hour: '15:00' },
            { label: '30 min quick chat',  days: 1, hour: '12:00' },
          ].map((q) => {
            const isSelected = selectedQuick === q.label
            return (
              <motion.button
                key={q.label}
                type="button"
                whileTap={{ scale: 0.95 }}
                animate={isSelected ? { scale: [1, 1.04, 1] } : {}}
                transition={{ duration: 0.2 }}
                onClick={() => {
                  setSelectedQuick(q.label)
                  const d = new Date()
                  d.setDate(d.getDate() + q.days)
                  setDate(d.toISOString().split('T')[0])
                  setTime(q.hour)
                  setLocation('Madison Pub')
                }}
                style={{
                  flex: 1, padding: '10px 6px', borderRadius: 12,
                  background: isSelected
                    ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                    : C.goldBg,
                  border: `1.5px solid ${isSelected ? C.gold : C.goldLight}`,
                  color: isSelected ? '#fff' : C.goldDark,
                  fontSize: 11, fontWeight: 600,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  cursor: 'pointer', lineHeight: 1.3, textAlign: 'center',
                  boxShadow: isSelected ? '0 4px 12px rgba(200,169,106,0.3)' : 'none',
                  transition: 'background 0.2s, color 0.2s, box-shadow 0.2s',
                }}
              >
                {q.label}
              </motion.button>
            )
          })}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'Date', type: 'date', value: date, onChange: e => setDate(e.target.value), min: new Date().toISOString().split('T')[0] },
            { label: 'Time', type: 'time', value: time, onChange: e => setTime(e.target.value) },
          ].map(({ label, ...props }) => (
            <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: C.textMuted,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                {label}
              </span>
              <input style={inputStyle} {...props} />
            </label>
          ))}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.textMuted,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Location
            </span>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Madison Pub"
              style={inputStyle}
            />
          </label>
        </div>

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          style={{
            width: '100%', marginTop: 28, padding: '15px 0', borderRadius: 16,
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
            color: '#fff', fontSize: 15, fontWeight: 600,
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: '0.04em', border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(200,169,106,0.35)',
          }}
        >
          Send Suggestion
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 10, padding: '10px 0',
            background: 'transparent', border: 'none',
            color: C.textMuted, fontSize: 13,
            fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </motion.div>
    </div>
  )
}
