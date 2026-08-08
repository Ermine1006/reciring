import { useEffect, useState } from 'react'
import { Pencil, MessageSquareText, XCircle } from 'lucide-react'
import AnonymousAvatar from './AnonymousAvatar'
import { resolveAvatarSeed } from './SettingsPage'
import { fetchMarketplaceInterestStats, fetchMarketplaceFeed } from '../lib/marketplace'

// Host-only Manage — the organizer dashboard, kept OFF the participant Board.
// Registrations/capacity · attendee list (contact clearly labelled) · Event
// Posts · interests · connections · Edit / Message / Cancel. Never exposes
// private notes, private messages, or other people's follow-ups.

const C = {
  ground:'#FFFFFF', ivory:'#FBF8F3', ink:'#1A1712', ink2:'#5F584D', ink3:'#9A958B',
  line:'#ECE7DE', line2:'#F3EFE8', gold:'#A6822A', goldInk:'#7A5E17',
  host:'#3B6EA5', hostBg:'#EDF3FA', hostLine:'#CFE0F2', danger:'#B4453A', dangerBg:'#FBEEEC', dangerLine:'#F0D6D2',
}

function initials(name) {
  const p = String(name || '').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·'
}

export default function EventManagePage({ event, attendees = [], userId, onEdit, onCancel, onMessage }) {
  const [stats, setStats] = useState({ interest_count: 0, accepted_count: 0 })
  const [postCount, setPostCount] = useState(0)

  useEffect(() => {
    if (!event?.id) return
    let alive = true
    ;(async () => {
      const [{ data: s }, { data: feed }] = await Promise.all([
        fetchMarketplaceInterestStats(event.id).then(r => ({ data: (r.data || [])[0] || r.data })).catch(() => ({ data: null })),
        fetchMarketplaceFeed(event.id, userId),
      ])
      if (!alive) return
      if (s) setStats({ interest_count: s.interest_count || 0, accepted_count: s.accepted_count || 0 })
      // "Event posts completed" = distinct attendees who shared a post.
      setPostCount(new Set((feed || []).map(p => p.user_id)).size)
    })()
    return () => { alive = false }
  }, [event?.id, userId])

  const going    = event?.attendee_count || 0
  const capacity = event?.max_attendees != null ? Math.max(0, event.max_attendees - going) : null

  return (
    <div style={{ paddingBottom: 8 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: C.ink, margin: '0 0 12px', letterSpacing: '-0.01em', fontFamily: 'Inter, system-ui, sans-serif' }}>Manage event</h2>

      {/* Stats */}
      <div style={statCard}>
        <Stat n={going} label="Going" />
        <Divider />
        <Stat n={capacity == null ? '∞' : capacity} label="Spots left" />
        <Divider />
        <Stat n={postCount} label="Event posts" />
      </div>
      <div style={statCard}>
        <Stat n={stats.interest_count} label="Interests" />
        <Divider />
        <Stat n={stats.accepted_count} label="Connected" />
        <Divider />
        <Stat n={going} label="Registered" />
      </div>

      {/* Attendees */}
      <p style={sectionLabel}>Attendees</p>
      <div style={{ background: C.hostBg, border: `1px solid ${C.hostLine}`, borderRadius: 10, padding: '8px 11px', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 11.5, color: C.host, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>
          As the host you can see attendees' email. You can't see their private notes or messages.
        </p>
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {attendees.length === 0 ? (
          <p style={{ margin: 0, padding: '16px', fontSize: 13, color: C.ink3, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>No one has registered yet.</p>
        ) : attendees.map((a, i) => {
          const name = a.name || a.first_name || 'Attendee'
          const seed = resolveAvatarSeed(a.avatar_url)
          return (
            <div key={a.user_id || i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderTop: i === 0 ? 'none' : `1px solid ${C.line2}` }}>
              {seed ? <AnonymousAvatar seed={seed} size={34} /> : <span style={initialAv}>{initials(name)}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{name}</p>
                <p style={{ margin: '1px 0 0', fontSize: 11.5, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[a.program, a.email].filter(Boolean).join(' · ') || 'Registered'}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div style={{ marginTop: 16, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {onEdit && <ActionRow icon={<Pencil size={16} strokeWidth={1.8} />} label="Edit event" onClick={onEdit} />}
        {onMessage && <ActionRow icon={<MessageSquareText size={16} strokeWidth={1.8} />} label="Message attendees" onClick={onMessage} />}
        {onCancel && <ActionRow icon={<XCircle size={16} strokeWidth={1.8} />} label="Cancel event" onClick={onCancel} danger last />}
      </div>
    </div>
  )
}

function Stat({ n, label }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{n}</p>
      <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.ink3, fontFamily: 'Inter, system-ui, sans-serif' }}>{label}</p>
    </div>
  )
}
const Divider = () => <div style={{ width: 1, alignSelf: 'stretch', background: C.line2 }} />

function ActionRow({ icon, label, onClick, danger, last }) {
  return (
    <button type="button" onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', background: C.ground, border: 'none', borderBottom: last ? 'none' : `1px solid ${C.line2}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <span style={{ width: 29, height: 29, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: danger ? C.dangerBg : C.ivory, border: `1px solid ${danger ? C.dangerLine : C.line}`, color: danger ? C.danger : C.ink2 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: danger ? C.danger : C.ink }}>{label}</span>
    </button>
  )
}

const statCard = { display: 'flex', background: C.ivory, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 6px', marginBottom: 10 }
const sectionLabel = { fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', margin: '18px 1px 8px' }
const initialAv = { width: 34, height: 34, borderRadius: '50%', background: '#E7DBC4', color: '#5C4A28', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }
