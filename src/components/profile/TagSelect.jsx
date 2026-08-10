import { useState, useRef, useEffect, useMemo } from 'react'
import { C } from './theme'
import { sanitizeCustomTag } from '../../data/profileTaxonomy'

// ── TagSelect ───────────────────────────────────────────────────────────────
// A compact searchable multi-select dropdown that replaces the chip grids.
//   • click to open a menu; type to filter
//   • pick several (up to `max`); picks show as removable pills in the control
//   • type something not in the list → "＋ Add “…”" to add your own
//
// Props:
//   options   [{id,label}]  OR  grouped [{category, items:[{id,label}]}]
//   grouped   boolean
//   value     string[]   selected ids ('custom:Label' for free-text)
//   onChange  (ids) => void
//   max       number|undefined
//   placeholder string
export function TagSelect({ options = [], grouped = false, value = [], onChange, max, placeholder = 'Select or type…' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrap = useRef(null)
  const atMax = typeof max === 'number' && value.length >= max

  const flat = useMemo(() => grouped ? options.flatMap(g => g.items.map(i => ({ ...i, category: g.category }))) : options, [options, grouped])
  const labelOf = (id) => id.startsWith('custom:') ? id.slice(7) : (flat.find(o => o.id === id)?.label || id)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) { setOpen(false); setQ('') } }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const norm = (s) => s.toLowerCase().trim()
  const matches = (o) => !q || norm(o.label).includes(norm(q))
  const exactExists = flat.some(o => norm(o.label) === norm(q)) || value.some(v => norm(labelOf(v)) === norm(q))
  const canAddCustom = q.trim().length > 0 && !exactExists && !atMax

  const toggle = (id) => {
    if (value.includes(id)) return onChange(value.filter(v => v !== id))
    if (atMax) return
    onChange([...value, id])
  }
  const remove = (id, e) => { e.stopPropagation(); onChange(value.filter(v => v !== id)) }
  const addCustom = () => {
    const label = sanitizeCustomTag(q)
    setQ('')
    if (!label || atMax) return
    const id = `custom:${label}`
    if (!value.includes(id)) onChange([...value, id])
  }

  // Rows to render in the menu.
  const renderOption = (o) => {
    const on = value.includes(o.id)
    const disabled = !on && atMax
    return (
      <button key={o.id} type="button" role="option" aria-selected={on} disabled={disabled}
        onClick={() => toggle(o.id)} style={optRow(on, disabled)}>
        <span>{o.label}</span>
        {on && <span style={{ color: C.gold, fontWeight: 800 }}>✓</span>}
      </button>
    )
  }

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      {/* Control */}
      <div role="button" tabIndex={0} onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        style={control(open)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 }}>
          {value.length === 0 && <span style={{ color: C.muted, fontSize: 15 }}>{placeholder}</span>}
          {value.map(id => (
            <span key={id} style={pill}>
              {labelOf(id)}
              <span onClick={e => remove(id, e)} role="button" aria-label="Remove" style={pillX}>×</span>
            </span>
          ))}
        </div>
        <span style={{ color: C.muted, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </div>

      {/* Menu */}
      {open && (
        <div style={menu}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (canAddCustom) addCustom() } }}
            placeholder={atMax ? `Max ${max} reached — remove one to add` : 'Search or type your own…'}
            style={search} />
          <div style={list}>
            {grouped && !q
              ? options.map(g => {
                  const items = g.items.filter(matches)
                  if (!items.length) return null
                  return (
                    <div key={g.category}>
                      <p style={groupHdr}>{g.category}</p>
                      {items.map(renderOption)}
                    </div>
                  )
                })
              : flat.filter(matches).map(renderOption)}

            {canAddCustom && (
              <button type="button" onClick={addCustom} style={{ ...optRow(false, false), color: C.gold, fontWeight: 700 }}>
                ＋ Add “{q.trim()}”
              </button>
            )}
            {!canAddCustom && flat.filter(matches).length === 0 && (!grouped || q) && (
              <p style={{ padding: '12px 14px', color: C.muted, fontSize: 13.5, margin: 0 }}>No matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const control = (open) => ({
  width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', gap: 8,
  background: '#FCFBF8', border: `1px solid ${open ? C.goldMid : C.line}`, borderRadius: 12,
  padding: '9px 14px', cursor: 'pointer', fontFamily: C.sans, boxSizing: 'border-box',
})
const pill = { display: 'inline-flex', alignItems: 'center', gap: 6, background: C.chipGoldBg, border: `1px solid ${C.chipGoldBd}`, color: C.chipGoldInk, borderRadius: 999, padding: '5px 6px 5px 12px', fontSize: 13.5, fontWeight: 600 }
const pillX = { cursor: 'pointer', width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.06)', color: C.chipGoldInk, fontSize: 14, lineHeight: 1 }
const menu = { position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }
const search = { width: '100%', border: 'none', borderBottom: `1px solid ${C.line}`, padding: '13px 14px', fontSize: 14.5, outline: 'none', fontFamily: C.sans, color: C.ink, boxSizing: 'border-box' }
const list = { maxHeight: 260, overflowY: 'auto' }
const groupHdr = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: 0, padding: '10px 14px 4px' }
const optRow = (on, disabled) => ({
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  padding: '11px 14px', background: on ? C.chipGoldBg : '#fff', border: 'none', borderRadius: 0,
  fontSize: 14.5, fontWeight: on ? 700 : 500, color: disabled ? C.muted : (on ? C.chipGoldInk : C.ink),
  cursor: disabled ? 'default' : 'pointer', textAlign: 'left', fontFamily: C.sans, opacity: disabled ? 0.5 : 1,
})
