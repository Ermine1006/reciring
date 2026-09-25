import { useEffect, useState } from 'react'
import { PRACTICE_DIRECTIONS, TYPES_BY_DIRECTION, practiceTypeLabel, typesInDirection } from '../../data/practiceDirections'
import { fetchFinancePracticeSupport } from '../../lib/practiceFinance'
import { PRACTICE_TYPE_SHORT } from '../../data/practiceOptions'
import './practice-directions.css'

export function useFinancePracticeSupport() {
  const [status, setStatus] = useState({ supported: false, loading: true })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setStatus({ supported: false, loading: true })
    fetchFinancePracticeSupport().then(result => { if (active) setStatus({ ...result, loading: false }) })
    return () => { active = false }
  }, [attempt])
  return { ...status, retry: () => setAttempt(n => n + 1) }
}

export default function PracticeDirectionPicker({ value, onChange, disabled = false, finance }) {
  return <section className="practice-direction-picker" aria-label="Career direction">
    <p className="practice-direction-label">Career direction</p>
    <div className="practice-direction-options">
      {PRACTICE_DIRECTIONS.map(item => <button type="button" key={item.key}
        disabled={disabled} aria-label={item.label} aria-pressed={value === item.key} onClick={() => onChange(item.key)}>
        {item.label}
      </button>)}
    </div>
    {value === 'finance' && !finance.supported && <p role="status" className="practice-direction-status">
      {finance.loading ? 'Checking finance availability…' : 'Finance practice is not enabled yet. Your existing choices are kept.'}
      {!finance.loading && <button type="button" onClick={finance.retry}>Check again</button>}
    </p>}
  </section>
}

export function PracticeTypeChoices({ direction, selected, onToggle, disabled, label, compact = false }) {
  // A member may practise across both directions on purpose, so
  // switching direction keeps what they picked under the other one.
  // It must still be VISIBLE: a selection you cannot see is one you
  // cannot undo, and it silently drives what the rest of the app shows
  // you, which is how finance skills ended up in front of someone who
  // had switched to consulting. Shown here, named by its direction,
  // and removable in one tap.
  const elsewhere = PRACTICE_DIRECTIONS
    .filter(item => item.key !== direction)
    .flatMap(item => typesInDirection(selected, item.key).map(type => ({ type, direction: item.label })))

  return <div className="practice-type-choices" role="group" aria-label={label}>
    {TYPES_BY_DIRECTION[direction].map(type => <button type="button" key={type} disabled={disabled}
      aria-pressed={selected.includes(type)} onClick={() => onToggle(type)}>
      {selected.includes(type) ? '✓ ' : ''}{compact ? PRACTICE_TYPE_SHORT[type] : practiceTypeLabel(type)}
    </button>)}
    {elsewhere.map(({ type, direction: name }) => <button type="button" key={type}
      className="practice-type-elsewhere" disabled={disabled} aria-pressed="true"
      title={`Also selected under ${name}. Tap to remove.`}
      onClick={() => onToggle(type)}>
      ✓ {compact ? PRACTICE_TYPE_SHORT[type] : practiceTypeLabel(type)} · {name} ✕
    </button>)}
  </div>
}
