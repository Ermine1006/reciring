import { MATCHA_DEEP } from '../../lib/matchaCta'
const FONT = 'Inter, system-ui, sans-serif'
const C = { line: '#E9E5DD', white: 'var(--mutu-surface, #FFFFFF)', ink: '#18160F', ink2: '#6E6A61', ink3: '#9A958B' }

export default function AvailabilityPresetOption({ preset, selected, onSelect, tzLabel }) {
  return (
    <button data-mutu-glass="" type="button" role="radio" aria-checked={selected}
      onClick={() => onSelect(preset.id)}
      className="active:scale-[0.98] transition-all"
      style={{
        width: '100%', textAlign: 'left', minHeight: 64, padding: '13px 15px',
        border: `1.5px solid ${selected ? MATCHA_DEEP : C.line}`, borderRadius: 16,
        background: selected ? '#F0F2E8' : C.white, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT,
      }}>
      <span aria-hidden="true" style={{
        width: 20, height: 20, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
        border: selected ? `6px solid ${MATCHA_DEEP}` : `1.5px solid ${C.ink3}`,
        background: C.white,
      }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{preset.label}</span>
        <span style={{ fontSize: 12.5, color: C.ink2 }}>
          {preset.detail}{preset.id === 'exact' || preset.id === 'none' ? '' : ` ${tzLabel}`}
        </span>
      </span>
    </button>
  )
}
