/**
 * Shared gold pill chip — used by onboarding wizard, settings page, and
 * any future tag selector. Visual style is canonical; do not branch.
 *
 * Props:
 *   label    — string shown inside the chip
 *   active   — whether this chip is selected (controls gold fill + check)
 *   onClick  — called with `label` when clicked
 *   disabled — optional, dims the chip and blocks clicks
 */
const C = {
  gold:      '#C9A33B',
  goldDark:  '#A6822A',
  goldBg:    '#F8F3E5',
  textSub:   '#6B7280',
  white:     '#FFFFFF',
  border:    '#E5E7EB',
}

export default function Chip({ label, active, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onClick(label)}
      disabled={disabled}
      className="transition-all duration-150 active:scale-95"
      style={{
        padding: '7px 16px', borderRadius: 99,
        fontSize: 12, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active
          ? 'linear-gradient(135deg, #EEF1E6, rgba(120,133,90,0.18))'
          : C.white,
        color: active ? '#5C6A3E' : C.textSub,
        border: `1.5px solid ${active ? '#8A9668' : C.border}`,
        boxShadow: active
          ? '0 2px 10px rgba(120,133,90,0.22), inset 0 1px 0 rgba(255,255,255,0.6)'
          : '0 1px 2px rgba(0,0,0,0.04)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {active && <span style={{ marginRight: 4 }}>&#10003;</span>}
      {label}
    </button>
  )
}
