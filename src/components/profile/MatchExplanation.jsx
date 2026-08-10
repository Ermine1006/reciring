import { useState } from 'react'
import { C } from './theme'

// ── Match explanation (redesign) ───────────────────────────────────────────
// Two evidence-based sections — Professional fit and Personal spark — and never
// a compatibility score. Only renders a section that has real evidence; if only
// one dimension is supported, only that one shows (per spec).
//
// Props (Phase 3's matcher produces this shape; all labels pre-resolved):
//   viewer:  { name, initials }
//   other:   { name, initials }
//   headline: string
//   professional: { theyHelpYou: string[], youHelpThem: string[] }   // topic labels
//   spark:   [{ emoji, title, note }]
//   opener:  string
//   onSayHello: () => void
export default function MatchExplanation({ viewer = {}, other = {}, headline, professional, spark = [], opener, onSayHello }) {
  const [copied, setCopied] = useState(false)
  const hasPro = professional && ((professional.theyHelpYou || []).length || (professional.youHelpThem || []).length)
  const hasSpark = spark && spark.length

  const copy = () => {
    if (opener && navigator.clipboard) navigator.clipboard.writeText(opener.replace(/[“”]/g, ''))
    setCopied(true); setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 24, padding: '30px 22px', fontFamily: C.sans, maxWidth: 620, margin: '0 auto' }}>
      <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, letterSpacing: '0.16em', color: C.gold, textTransform: 'uppercase', margin: '0 0 22px' }}>✦ Why you should meet</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Avatar person={viewer} tone="gold" />
        <span style={mutual}>Mutual<br />value</span>
        <Avatar person={other} tone="green" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 280, margin: '0 auto 14px', padding: '0 14px', fontWeight: 700, color: C.ink, fontSize: 15 }}>
        <span>{viewer.name || 'You'}</span><span>{other.name || 'Them'}</span>
      </div>

      {headline && <h2 style={{ textAlign: 'center', fontFamily: C.serif, fontWeight: 600, color: C.title, fontSize: 28, lineHeight: 1.12, margin: '0 0 22px' }}>{headline}</h2>}

      {hasPro ? (
        <div style={{ ...block, background: '#EDF2EE', border: '1px solid #D9E4DC' }}>
          <p style={{ ...blockKey, color: C.green }}>↔ Professional fit</p>
          <p style={blockHead}>You can help each other</p>
          {(professional.youHelpThem || []).length > 0 && (<>
            <p style={who}>{viewer.name || 'You'} can help {other.name || 'them'} with</p>
            <Tags items={professional.youHelpThem} />
          </>)}
          {(professional.theyHelpYou || []).length > 0 && (<>
            <p style={who}>{other.name || 'They'} can help {viewer.name || 'you'} with</p>
            <Tags items={professional.theyHelpYou} />
          </>)}
        </div>
      ) : null}

      {hasSpark ? (
        <div style={{ ...block, background: '#FBF3DE', border: '1px solid #E9D5A2' }}>
          <p style={{ ...blockKey, color: C.gold }}>✦ Personal spark</p>
          <p style={blockHead}>You already have common ground</p>
          {spark.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 0', borderTop: i ? '1px solid #EBD9AC' : 'none' }}>
              <span style={{ fontSize: 20 }}>{s.emoji}</span>
              <div><b style={{ fontSize: 15, color: C.ink }}>{s.title}</b>
                {s.note && <p style={{ margin: '3px 0 0', fontSize: 13.5, color: C.sub }}>{s.note}</p>}</div>
            </div>
          ))}
        </div>
      ) : null}

      {opener && (
        <div style={{ border: `1.5px dashed ${C.goldMid}`, background: '#FBF6E9', borderRadius: 16, padding: '18px 20px', marginTop: 18, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: C.gold, textTransform: 'uppercase', margin: '0 0 6px' }}>“ Try this opener</p>
            <p style={{ fontSize: 15, color: C.ink, lineHeight: 1.55, margin: 0 }}>{opener}</p>
          </div>
          <button type="button" onClick={copy} style={{ flexShrink: 0, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 16px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', color: C.ink, fontFamily: C.sans }}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
      )}

      {onSayHello && (
        <button type="button" onClick={onSayHello} style={{ width: '100%', marginTop: 18, background: C.green, color: '#fff', border: 'none', borderRadius: 13, padding: '16px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: C.sans }}>
          Say hello to {other.name || 'them'} →
        </button>
      )}
      <p style={{ textAlign: 'center', color: C.muted, fontSize: 13.5, marginTop: 16 }}>No abstract compatibility score — just real, explainable reasons to connect.</p>
    </div>
  )
}

function Avatar({ person, tone }) {
  const bg = tone === 'gold' ? 'linear-gradient(145deg,#C9A24B,#A9812C)' : 'linear-gradient(145deg,#2F5A42,#22402F)'
  return <span style={{ width: 84, height: 84, borderRadius: '50%', background: bg, color: '#fff', fontFamily: C.serif, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>{person.initials || (person.name || '?').slice(0, 2).toUpperCase()}</span>
}
function Tags({ items }) {
  return <div>{items.map(t => <span key={t} style={{ display: 'inline-block', padding: '8px 15px', borderRadius: 999, background: '#fff', border: '1px solid #E5E0D5', color: '#3A362E', fontSize: 13.5, fontWeight: 600, margin: '0 6px 6px 0' }}>{t}</span>)}</div>
}
const mutual = { fontSize: 12, fontWeight: 700, letterSpacing: '0.10em', color: C.muted, padding: '0 16px', textAlign: 'center', textTransform: 'uppercase' }
const block = { borderRadius: 18, padding: '22px', marginTop: 14 }
const blockKey = { fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 8px' }
const blockHead = { fontFamily: C.serif, fontSize: 22, fontWeight: 600, color: C.title, margin: '0 0 14px' }
const who = { fontSize: 13, fontWeight: 700, color: C.sub, margin: '14px 0 8px' }
