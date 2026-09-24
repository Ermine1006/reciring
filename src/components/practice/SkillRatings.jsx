import { feedbackSkills, RATING_ANCHORS } from '../../data/practiceSkillRatings'

export default function SkillRatings({ category, value, onChange, disabled }) {
  const options = feedbackSkills(category)
  const set = (key, score) => {
    const next = { ...value }
    if (score === '') delete next[key]
    else next[key] = Number(score)
    onChange(next)
  }
  return <details style={{ marginBottom: 20 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 650 }}>Rate observed skills · Optional</summary>
    <p>Choose up to 3. Rate only what you observed in this session.</p>
    <p style={{ fontSize: 12 }}>Private to you and your partner after you both confirm. Ratings do not appear on pool cards.</p>
    <details><summary>What do 1 to 5 mean?</summary>
      <ol>{RATING_ANCHORS.map(label => <li key={label}>{label}</li>)}</ol>
    </details>
    {options.map(skill => <label key={skill.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
      <span>{skill.label}{skill.key === 'leadership' && <small style={{ display: 'block' }}>Guides the discussion, makes decisions and responds to input.</small>}</span>
      <select aria-label={`Rate ${skill.label}`} value={value[skill.key] ?? ''}
        disabled={disabled || (value[skill.key] == null && Object.keys(value).length >= 3)}
        onChange={event => set(skill.key, event.target.value)} style={{ minHeight: 44, maxWidth: '48%', borderRadius: 12, padding: 8 }}>
        <option value="">Not rated</option>
        {RATING_ANCHORS.map((label, i) => <option key={label} value={i + 1}>{i + 1} · {label}</option>)}
      </select>
    </label>)}
  </details>
}
