import { FINANCE_OBSERVATIONS } from '../../data/financeObservations'
import { feedbackSkills } from '../../data/practiceSkillRatings'

export default function FinanceObservations({ category, ratings, value, onChange, disabled }) {
  const skills = feedbackSkills(category).filter(skill => ratings[skill.key] != null)
  if (!skills.length) return null
  return <details className="practice-paper">
    <summary>What did you observe? · Optional</summary>
    <p>Separate from your rating. Leave unchecked if it did not come up.</p>
    {skills.map(skill => <fieldset key={skill.key} disabled={disabled}>
      <legend>{skill.label}</legend>
      {FINANCE_OBSERVATIONS.map(item => <label key={item.key} style={{ display: 'flex', gap: 10, padding: '10px 0', alignItems: 'center' }}>
        <input type="checkbox" checked={value[skill.key]?.includes(item.key) || false}
          onChange={event => {
            const next = { ...value }
            const chosen = value[skill.key] || []
            const updated = event.target.checked ? [...chosen, item.key] : chosen.filter(key => key !== item.key)
            if (updated.length) next[skill.key] = updated
            else delete next[skill.key]
            onChange(next)
          }} />
        <span><strong>{item.label}</strong> · {item.description}</span>
      </label>)}
    </fieldset>)}
    <p>Peer observations are not a certification of job readiness or spreadsheet proficiency.</p>
  </details>
}
