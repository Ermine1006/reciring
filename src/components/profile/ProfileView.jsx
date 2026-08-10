import { C } from './theme'
import { labelForTopic, labelForInterest, labelForActivity } from '../../data/profileTaxonomy'

// ── Profile display (redesign) ─────────────────────────────────────────────
// Scannable, not a résumé. Renders only the sections that have content, so
// empty/partial profiles look clean and never show placeholder claims.
//
// profile shape (ids are canonical; labels resolved here):
//   { name, initials, verified, professionalHeadline, program, location, gradYear,
//     expertiseOffered[], helpWanted[], personalInterests[], activities[],
//     promptAskMe }
// cta:   optional { label, onClick }  (e.g. "See why you match")
export default function ProfileView({ profile = {}, cta, onBack, onMenu }) {
  const p = profile
  const expertise = resolve(p.expertiseOffered, labelForTopic)
  const exploring = resolve(p.helpWanted, labelForTopic)
  const interests = resolve(p.personalInterests, labelForInterest)
  const activities = resolve(p.activities, labelForActivity)
  const metaBits = [p.program, p.location].filter(Boolean)

  return (
    <div style={{ background: C.card, minHeight: '100%', fontFamily: C.sans }}>
      {/* Screen header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px' }}>
        <button type="button" onClick={onBack} aria-label="Back" style={iconBtn}>←</button>
        <span style={{ fontWeight: 700, color: C.ink }}>Profile</span>
        <button type="button" onClick={onMenu} aria-label="More" style={iconBtn}>•••</button>
      </div>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(180deg,#EDF1EC,#F7F4EE)', textAlign: 'center', padding: '20px 18px 22px' }}>
        <div style={avatar}>
          {p.initials || (p.name || '?').slice(0, 2).toUpperCase()}
          {p.verified !== false && <span style={badge}>✓</span>}
        </div>
        <div style={{ fontFamily: C.serif, fontSize: 27, fontWeight: 600, color: C.title, margin: '14px 0 6px' }}>{p.name || 'Your name'}</div>
        {p.professionalHeadline && <div style={{ color: C.sub, fontSize: 15, lineHeight: 1.4, maxWidth: 320, margin: '0 auto' }}>{p.professionalHeadline}</div>}
        {metaBits.length > 0 && (
          <div style={{ color: C.muted, fontSize: 13.5, marginTop: 8, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {p.program && <span>◈ {p.program}</span>}
            {p.location && <span>⌁ {p.location}</span>}
          </div>
        )}
        {cta && (
          <button type="button" onClick={cta.onClick}
            style={{ marginTop: 16, background: C.green, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 14, padding: '14px 26px', cursor: 'pointer', fontFamily: C.sans }}>
            {cta.label}
          </button>
        )}
      </div>

      <Section theme="gold"  glyph="↗" title="You can ask me about"   subtitle="Experience I can share"                tags={expertise} />
      <Section theme="green" glyph="◎" title="I'm currently exploring" subtitle="Where I'd value another perspective"    tags={exploring} />
      <Section theme="rose"  glyph="✦" title="Beyond work"             subtitle="Things we might genuinely connect over"  tags={interests} />

      {p.promptAskMe && (
        <div style={{ margin: '6px 18px 0', background: '#FCF7EA', borderLeft: `3px solid ${C.goldMid}`, borderRadius: 10, padding: '14px 16px' }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: C.gold, textTransform: 'uppercase', margin: '0 0 6px' }}>“ Ask me about</p>
          <p style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.5, margin: 0 }}>{p.promptAskMe}</p>
        </div>
      )}

      {activities.length > 0 && (
        <div style={{ padding: '16px 18px 24px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, margin: '0 0 10px' }}>Up for</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: C.sub, fontSize: 14, fontWeight: 600 }}>
            {activities.map(a => <span key={a}>{activityGlyph(a)} {a}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ theme, glyph, title, subtitle, tags }) {
  if (!tags || tags.length === 0) return null
  const t = C.themes[theme]
  return (
    <div style={{ padding: '18px 18px', borderTop: `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: t.tile, color: t.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{glyph}</span>
        <div><p style={{ fontSize: 16, fontWeight: 700, color: C.ink, margin: 0 }}>{title}</p>
          <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0' }}>{subtitle}</p></div>
      </div>
      <div>
        {tags.map(tag => (
          <span key={tag} style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, margin: '0 6px 6px 0',
            background: t.chipBg, border: `1px solid ${t.chipBd}`, color: t.chipInk }}>{tag}</span>
        ))}
      </div>
    </div>
  )
}

function resolve(ids, labelFn) {
  return (Array.isArray(ids) ? ids : []).map(id => id.startsWith('custom:') ? id.slice(7) : labelFn(id))
}
function activityGlyph(label) {
  const l = label.toLowerCase()
  if (l.includes('coffee')) return '☕'
  if (l.includes('event')) return '◉'
  if (l.includes('build')) return '⚒'
  if (l.includes('sport')) return '🏅'
  if (l.includes('restaurant')) return '🍜'
  if (l.includes('class')) return '📚'
  if (l.includes('study')) return '✎'
  if (l.includes('explore')) return '🧭'
  return '•'
}
const iconBtn = { background: 'none', border: 'none', fontSize: 18, color: C.ink, cursor: 'pointer', padding: 4 }
const avatar = { width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(145deg,#C9A24B,#A9812C)', color: '#fff', fontFamily: C.serif, fontSize: 32, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', position: 'relative', border: '4px solid #fff', boxShadow: '0 4px 14px rgba(0,0,0,.12)' }
const badge = { position: 'absolute', right: 2, bottom: 2, width: 26, height: 26, borderRadius: '50%', background: '#2E6B4F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, border: '2px solid #fff' }
