import { INTERVIEW_CATEGORIES, SKILLS_BY_CATEGORY } from '../../data/practiceModes'
import { PRACTICE_EXPERIENCE_RANGES } from '../../data/practiceExperience'

export const skillsForTypes = (skills = [], types = []) => skills.filter(key =>
  types.some(type => SKILLS_BY_CATEGORY[type]?.some(skill => skill.key === key)))

export function practicePreferenceDraft(value = {}, request = {}) {
  return {
    ...value,
    focus_skills: skillsForTypes(value.focus_skills, request.want_types),
    support_skills: skillsForTypes(value.support_skills, request.help_types),
    share_response: value.share_response === true,
  }
}

export function togglePracticeSkill(draft, field, key) {
  const selected = draft[field] || []
  return { ...draft, [field]: selected.includes(key)
    ? selected.filter(skill => skill !== key)
    : selected.length < 3 ? [...selected, key] : selected }
}

export default function PracticePreferenceFields({ draft, request, onChange, disabled = false }) {
  return <div className="practice-preference-fields">
    {[
      ['focus_skills', 'What would you like to work on?', request.want_types, 'Private · Choose up to 3'],
      ['support_skills', 'What can you help a partner with?', request.help_types, 'Shown as chosen by you · Choose up to 3'],
    ].map(([field, title, types, hint]) => <fieldset key={field} disabled={disabled}>
      <legend>{title}</legend><p>{hint}</p>
      {(types || []).filter(type => SKILLS_BY_CATEGORY[type]).map(type => <div key={type}>
        <p>{INTERVIEW_CATEGORIES[type].label}</p>
        <div className="quest-skill-options">
          {SKILLS_BY_CATEGORY[type].map(skill => {
            const selected = draft[field]?.includes(skill.key)
            return <button key={skill.key} type="button" aria-pressed={Boolean(selected)}
              disabled={disabled || (!selected && draft[field]?.length >= 3)}
              onClick={() => onChange(togglePracticeSkill(draft, field, skill.key))}>
              {selected ? '✓ ' : ''}{skill.label}
            </button>
          })}
        </div>
      </div>)}
      {!types?.length && <p>Choose a practice type above to see its skills.</p>}
    </fieldset>)}
    {draft.prior_practice_supported && <fieldset disabled={disabled}>
      <legend>Practice before Mutu</legend>
      <p>Optional and private. Self reported, separate from verified Mutu sessions.</p>
      {(request.want_types || []).filter(type => INTERVIEW_CATEGORIES[type]).map(type => <label className="quest-experience-choice" key={type}>
        <span>{INTERVIEW_CATEGORIES[type].label}</span>
        <select value={draft.prior_practice?.[type] || ''} onChange={event => {
          const prior = { ...draft.prior_practice }
          if (event.target.value) prior[type] = event.target.value
          else delete prior[type]
          onChange({ ...draft, prior_practice: prior })
        }}>
          <option value="">Prefer not to say</option>
          {PRACTICE_EXPERIENCE_RANGES.map(range => <option key={range.value} value={range.value}>{range.label}</option>)}
        </select>
      </label>)}
    </fieldset>}
  </div>
}
