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
  gold:      '#C8A96A',
  goldDark:  '#A88245',
  goldBg:    '#FBF6EC',
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
          ? `linear-gradient(135deg, ${C.goldBg}, rgba(200,169,106,0.18))`
          : C.white,
        color: active ? C.goldDark : C.textSub,
        border: `1.5px solid ${active ? C.gold : C.border}`,
        boxShadow: active
          ? '0 2px 10px rgba(200,169,106,0.25), inset 0 1px 0 rgba(255,255,255,0.6)'
          : '0 1px 2px rgba(0,0,0,0.04)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {active && <span style={{ marginRight: 4 }}>&#10003;</span>}
      {label}
    </button>
  )
}
