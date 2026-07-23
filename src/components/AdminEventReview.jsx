import { useState, useEffect } from 'react'
import { fetchPendingEvents, setEventModeration } from '../lib/events'
import { categoryEmoji } from '../data/eventCategories'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#1A1712', textSub: '#6B6152', white: '#FFFFFF', danger: '#DC2626', ok: '#15803D',
}

function when(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/**
 * Admin-only review queue for the first event of each new host (see
 * migration-event-moderation.sql). Approve publishes it; reject hides it.
 * RLS enforces that only the admin email can read pending events or update
 * moderation_status, so this page is empty/inert for anyone else even if the
 * client-side gate in App.jsx were bypassed.
 */
export default function AdminEventReview({ onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await fetchPendingEvents()
    setError(err ? (err.message || 'Could not load the queue') : null)
    setEvents(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const moderate = async (id, status) => {
    setBusyId(id); setError(null)
    const { error: err } = await setEventModeration(id, status)
    setBusyId(null)
    if (err) { setError(err.message || 'Update failed'); return }
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
      <div style={{ padding: '18px 20px 40px', maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif', margin: 0 }}>
            Event review
          </h1>
          <button
            type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', color: C.goldDark, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>

        <p style={{ fontSize: 13, color: C.textSub, margin: '0 0 18px', lineHeight: 1.5 }}>
          First-time hosts land here before their event goes public. Approve to publish, reject to hide.
        </p>

        {error && <p style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {loading ? (
          <p style={{ color: C.textSub, fontSize: 14 }}>Loading…</p>
        ) : events.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px', color: C.textSub,
            background: C.white, borderRadius: 16, border: '1px solid #EFEAE0',
          }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
            <p style={{ margin: 0, fontSize: 14 }}>Nothing waiting for review.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {events.map(ev => (
              <div key={ev.id} style={{
                background: C.white, borderRadius: 16, border: '1px solid #EFEAE0',
                padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 30, lineHeight: 1 }}>{categoryEmoji(ev.category)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, margin: '0 0 2px' }}>{ev.title}</h2>
                    <p style={{ fontSize: 12, color: C.goldDark, fontWeight: 600, margin: 0 }}>
                      {ev.category} · by {ev.host_display_name || 'Host'}
                    </p>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, marginBottom: 12 }}>
                  <div>🗓 {when(ev.start_at)}</div>
                  {ev.location && <div>📍 {ev.location}</div>}
                  <div>👥 up to {ev.max_attendees}</div>
                  {ev.description && (
                    <div style={{ marginTop: 8, color: C.ink, whiteSpace: 'pre-wrap' }}>{ev.description}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button" disabled={busyId === ev.id}
                    onClick={() => moderate(ev.id, 'approved')}
                    style={{
                      flex: 1, padding: '11px', borderRadius: 12, border: 'none',
                      background: C.ok, color: C.white, fontSize: 14, fontWeight: 700,
                      cursor: busyId === ev.id ? 'default' : 'pointer', opacity: busyId === ev.id ? 0.6 : 1,
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button" disabled={busyId === ev.id}
                    onClick={() => { if (window.confirm(`Reject "${ev.title}"? The host's event stays hidden.`)) moderate(ev.id, 'rejected') }}
                    style={{
                      flex: 1, padding: '11px', borderRadius: 12,
                      background: C.white, border: `1.5px solid ${C.danger}`, color: C.danger,
                      fontSize: 14, fontWeight: 700, cursor: busyId === ev.id ? 'default' : 'pointer',
                      opacity: busyId === ev.id ? 0.6 : 1,
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
