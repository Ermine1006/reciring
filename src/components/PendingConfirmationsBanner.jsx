import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  listPendingConfirmations, acceptConfirmation, declineConfirmation,
} from '../lib/eventEncounters'

const C = {
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldLight: '#E6D3A3',
  goldBg:    '#FBF6EC',
  text:      '#111111',
  textSub:   '#4B5563',
  textMuted: '#9CA3AF',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
  ok:        '#059669',
}

/**
 * PendingConfirmationsBanner — inline card that surfaces incoming
 * "I met you at [event] — please confirm" requests.
 *
 * Renders on the event detail page ONLY when there's a pending
 * request for THIS event targeting the current user. Accepting
 * creates a mirror encounter (empty topics/note by default) so the
 * target's Recap includes the requester too. Declining just flips
 * the request status; the requester's encounter stays as
 * self_recorded — Mutu never lies about who confirmed.
 *
 * Neither the requester's private_note nor their topics are shown
 * here — the confirmation flow deliberately doesn't leak anything
 * the requester wrote for themselves.
 */
export default function PendingConfirmationsBanner({ eventId, onAcceptedOrDeclined }) {
  const [requests, setRequests] = useState([])
  const [profiles, setProfiles] = useState({})
  const [busy, setBusy]         = useState(null)

  async function refresh() {
    const { data } = await listPendingConfirmations()
    const forThisEvent = (data || []).filter(r => r.event_id === eventId)
    setRequests(forThisEvent)

    if (forThisEvent.length > 0) {
      const ids = forThisEvent.map(r => r.requester_user_id)
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, program')
        .in('id', ids)
      setProfiles(Object.fromEntries((profs || []).map(p => [p.id, p])))
    }
  }

  useEffect(() => { refresh() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (requests.length === 0) return null

  async function handleAccept(req) {
    setBusy(req.id)
    const { error } = await acceptConfirmation(req.id)
    setBusy(null)
    if (error) { alert('Could not accept: ' + (error.message || 'unknown')); return }
    await refresh()
    onAcceptedOrDeclined?.()
  }
  async function handleDecline(req) {
    setBusy(req.id)
    const { error } = await declineConfirmation(req.id)
    setBusy(null)
    if (error) { alert('Could not decline: ' + (error.message || 'unknown')); return }
    await refresh()
    onAcceptedOrDeclined?.()
  }

  return (
    <div
      className="rounded-2xl mb-3"
      style={{
        background: C.goldBg,
        border: `1px solid ${C.goldLight}`,
        padding: '12px 14px',
      }}
    >
      <p style={{
        fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
        fontWeight: 700, color: C.goldDark, margin: 0,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        Confirm your encounters
      </p>
      <p style={{
        fontSize: 12, color: C.text, lineHeight: 1.5,
        fontFamily: 'Inter, system-ui, sans-serif',
        margin: '4px 0 10px',
      }}>
        {requests.length === 1
          ? '1 person says they met you at this event.'
          : `${requests.length} people say they met you at this event.`}
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {requests.map(req => {
          const p = profiles[req.requester_user_id] || {}
          return (
            <li key={req.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 10,
              background: C.white, border: `1px solid ${C.border}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  {p.name || 'A Mutu member'}
                </p>
                {p.program && (
                  <p style={{ fontSize: 11, color: C.textMuted, margin: '1px 0 0', fontFamily: 'Inter, system-ui, sans-serif' }}>
                    {p.program}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDecline(req)}
                disabled={busy === req.id}
                style={{
                  padding: '5px 10px', borderRadius: 8,
                  background: 'transparent', color: C.textSub,
                  border: `1px solid ${C.border}`,
                  fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => handleAccept(req)}
                disabled={busy === req.id}
                style={{
                  padding: '5px 12px', borderRadius: 8,
                  background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                  color: '#fff', border: 'none',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                  cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                  opacity: busy === req.id ? 0.6 : 1,
                }}
              >
                Confirm
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
