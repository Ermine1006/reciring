import { useEffect, useState } from 'react'
import { PRACTICE_DIRECTIONS, TYPES_BY_DIRECTION, practiceTypeLabel } from '../../data/practiceDirections'
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
    <p className="practice-direction-label">Your career direction</p>
    <div className="practice-direction-options">
      {PRACTICE_DIRECTIONS.map(item => <button type="button" key={item.key}
        disabled={disabled} aria-label={item.label} aria-pressed={value === item.key} onClick={() => onChange(item.key)}>
        <span aria-hidden="true">{item.key === 'consulting' ? '✧' : '▥'}</span>
        <span><strong>{item.label}</strong><small>{item.key === 'consulting' ? 'Case & behavioural' : 'Technical, markets & behavioural'}</small></span>
      </button>)}
    </div>
    {value === 'finance' && !finance.supported && <p role="status" className="practice-direction-status">
      {finance.loading ? 'Checking finance availability…' : 'Finance practice is not enabled yet. Your existing choices are kept.'}
      {!finance.loading && <button type="button" onClick={finance.retry}>Check again</button>}
    </p>}
  </section>
}

export function PracticeTypeChoices({ direction, selected, onToggle, disabled, label, compact = false }) {
  return <div className="practice-type-choices" role="group" aria-label={label}>
    {TYPES_BY_DIRECTION[direction].map(type => <button type="button" key={type} disabled={disabled}
      aria-pressed={selected.includes(type)} onClick={() => onToggle(type)}>
      {selected.includes(type) ? '✓ ' : ''}{compact ? PRACTICE_TYPE_SHORT[type] : practiceTypeLabel(type)}
    </button>)}
  </div>
}
