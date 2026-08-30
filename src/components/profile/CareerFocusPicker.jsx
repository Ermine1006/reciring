import Chip from '../Chip'
import {
  MAX_CAREER_FOCUS, normalizeCareerFocus, toCareerFocusStorage,
  getCareerFocusOptions, getCareerSpecializationOptions,
} from '../../data/careerFocus'

// ── Career Focus picker (shared by onboarding + settings) ───────────
// Renders ONLY the broad categories up front (max three). Selecting
// Finance reveals a quiet, optional specialization row — those never
// count toward the broad limit. `value` accepts anything ever stored
// (legacy labels, machine keys); `onChange` always emits canonical
// machine keys via toCareerFocusStorage.

const FONT = 'Inter, system-ui, sans-serif'

export default function CareerFocusPicker({ value = [], onChange }) {
  const shape = normalizeCareerFocus(value)
  const emit = (next) => onChange?.(toCareerFocusStorage(next))

  const toggleBroad = (label) => {
    const key = getCareerFocusOptions().find((o) => o.label === label)?.key
    if (!key) return
    if (shape.focus.includes(key)) {
      const specializations = { ...shape.specializations }
      delete specializations[key]                 // removing a broad area drops its specs
      emit({ focus: shape.focus.filter((k) => k !== key), specializations })
    } else if (shape.focus.length < MAX_CAREER_FOCUS) {
      emit({ ...shape, focus: [...shape.focus, key] })
    }
  }

  const toggleSpec = (parent) => (label) => {
    const key = getCareerSpecializationOptions(parent).find((o) => o.label === label)?.key
    if (!key) return
    const current = shape.specializations[parent] || []
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    emit({ ...shape, specializations: { ...shape.specializations, [parent]: next } })
  }

  const atLimit = shape.focus.length >= MAX_CAREER_FOCUS

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {getCareerFocusOptions().map((o) => (
          <Chip
            key={o.key}
            label={o.label}
            active={shape.focus.includes(o.key)}
            disabled={atLimit && !shape.focus.includes(o.key)}
            onClick={toggleBroad}
          />
        ))}
      </div>

      {shape.focus.includes('finance') && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#8A6E1E', fontFamily: FONT }}>
            Add finance interests
            <span style={{ fontWeight: 400, color: '#9A958B' }}> · optional, doesn't use a slot</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {getCareerSpecializationOptions('finance').map((o) => (
              <Chip
                key={o.key}
                label={o.label}
                active={(shape.specializations.finance || []).includes(o.key)}
                onClick={toggleSpec('finance')}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
