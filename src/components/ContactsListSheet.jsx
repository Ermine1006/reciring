import { createPortal } from 'react-dom'

const C = {
  bg: '#F9F7F4', card: '#FFFFFF', ink: '#25231E', sub: '#6E675B', muted: '#9C9284',
  gold: '#B08D57', border: '#ECE6DB',
}
const GRADS = [['#B49A78','#8C7050'],['#8FA6A0','#5F7D75'],['#B58C8C','#8A5E5E'],['#9AA488','#6F7E5A'],['#A896B0','#7C6A88']]
function initials(n){ const p=String(n||'').trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0]||'')+(p[1]?.[0]||'')).toUpperCase()||'·' }
function gradFor(s){ s=String(s||''); let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return GRADS[h%GRADS.length] }

/**
 * Full list of everyone the user has met (distinct people). Tapping one opens
 * that person's history. Solves the compact Recently-Met row hiding people.
 */
export default function ContactsListSheet({ open, contacts = [], onOpenContact, onClose }) {
  if (!open) return null
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: C.bg, borderRadius: '24px 24px 0 0', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>
        <div style={{ padding: '0 22px 12px', flexShrink: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }}>People you've met</h2>
          <span style={{ fontSize: 13, color: C.muted, fontFamily: 'Inter, system-ui, sans-serif' }}>{contacts.length}</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contacts.map(c => {
            const name = c.display_name || c.person_name || 'Someone'
            const [a, b] = gradFor(name)
            const sub = [c.program, c.event_title ? `met at ${c.event_title}` : null].filter(Boolean).join(' · ')
            return (
              <button key={c.id} type="button" onClick={() => onOpenContact?.(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '11px 14px' }}>
                {c.avatar_url
                  ? <img src={c.avatar_url} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <span style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 14, background: `linear-gradient(135deg, ${a}, ${b})` }}>{initials(name)}</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{name}</p>
                  {sub && <p style={{ margin: '2px 0 0', fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter, system-ui, sans-serif' }}>{sub}</p>}
                </div>
                <span style={{ color: C.muted }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
