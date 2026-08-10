import { useState } from 'react'
import { C } from './theme'
import { sanitizeCustomTag } from '../../data/profileTaxonomy'

// ── TagPicker ──────────────────────────────────────────────────────────────
// Reusable multi-select chip picker used by every capture step (industries,
// topics, interests, activities). Stores canonical ids; a custom entry is kept
// as `custom:<label>` until the review queue promotes it to a canonical id.
//
// Props:
//   options   [{id,label}]  OR  grouped [{category, items:[{id,label}]}]
//   grouped   boolean
//   value     string[]      selected ids
//   onChange  (ids) => void
//   max       number|undefined
//   allowCustom boolean
export function TagPicker({ options = [], grouped = false, value = [], onChange, max, allowCustom = false }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const atMax = typeof max === 'number' && value.length >= max

  const toggle = (id) => {
    if (value.includes(id)) return onChange(value.filter(v => v !== id))
    if (atMax) return
    onChange([...value, id])
  }
  const commitCustom = () => {
    const label = sanitizeCustomTag(draft)
    setDraft(''); setAdding(false)
    if (!label || atMax) return
    const id = `custom:${label}`
    if (!value.includes(id)) onChange([...value, id])
  }
  const labelFor = (id) => id.startsWith('custom:') ? id.slice(7) : (flat(options, grouped).find(o => o.id === id)?.label || id)

  const renderChip = (o) => {
    const on = value.includes(o.id)
    return (
      <button key={o.id} type="button" role="checkbox" aria-checked={on}
        onClick={() => toggle(o.id)} disabled={!on && atMax}
        style={chip(on, !on && atMax)}>
        {on && <span style={ck}>✓</span>}{o.label}
      </button>
    )
  }

  // Custom-selected ids that aren't in the option list get their own chips.
  const customSel = value.filter(v => v.startsWith('custom:'))

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {grouped
          ? options.map(g => (
              <div key={g.category} style={{ width: '100%' }}>
                <p style={groupLabel}>{g.category}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>{g.items.map(renderChip)}</div>
              </div>
            ))
          : options.map(renderChip)}

        {customSel.map(id => (
          <button key={id} type="button" onClick={() => toggle(id)} style={chip(true, false)}>
            <span style={ck}>✓</span>{labelFor(id)}
          </button>
        ))}

        {allowCustom && !grouped && (
          adding ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitCustom(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
                onBlur={commitCustom} placeholder="Type & press Enter"
                maxLength={40}
                style={{ padding: '9px 12px', borderRadius: 999, border: `1.5px solid ${C.goldMid}`, fontSize: 14, outline: 'none', fontFamily: C.sans, minWidth: 150 }} />
            </span>
          ) : (
            <button type="button" onClick={() => !atMax && setAdding(true)} disabled={atMax}
              style={{ ...chip(false, atMax), borderStyle: 'dashed', color: C.muted }}>＋ Add your own</button>
          )
        )}
      </div>
      {allowCustom && grouped && (
        <p style={{ ...groupLabel, marginTop: 12, color: C.muted, cursor: atMax ? 'default' : 'pointer' }}
           onClick={() => !atMax && setAdding(true)}>＋ Add your own</p>
      )}
    </div>
  )
}

// ── CheckList ───────────────────────────────────────────────────────────────
// Green-checkbox rows for the "How I'm open to helping" step.
export function CheckList({ options = [], value = [], onChange }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  return (
    <div>
      {options.map((o, i) => {
        const on = value.includes(o.id)
        return (
          <div key={o.id} role="checkbox" aria-checked={on} tabIndex={0}
            onClick={() => toggle(o.id)}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(o.id) } }}
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 2px',
              borderTop: i ? `1px solid ${C.line}` : 'none', cursor: 'pointer' }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14, background: on ? C.green : '#fff', border: `1.5px solid ${on ? C.green : C.line}` }}>{on ? '✓' : ''}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.ink, fontFamily: C.sans }}>{o.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── styles ──
function flat(options, grouped) { return grouped ? options.flatMap(g => g.items) : options }
const chip = (on, disabled) => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999,
  border: `1.5px solid ${on ? C.goldMid : C.line}`, background: on ? C.chipGoldBg : '#fff',
  color: on ? C.chipGoldInk : C.sub, fontSize: 14, fontWeight: on ? 700 : 600,
  fontFamily: C.sans, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
})
const ck = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: C.goldMid, color: '#fff', fontSize: 11 }
const groupLabel = { fontSize: 12.5, fontWeight: 700, color: C.ink, margin: '4px 0 8px', fontFamily: C.sans }
