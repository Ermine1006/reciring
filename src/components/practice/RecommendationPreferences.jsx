import PeerStrengthSharing from './PeerStrengthSharing'
import { useState } from 'react'
import { SKILLS_BY_CATEGORY, INTERVIEW_CATEGORIES } from '../../data/practiceModes'
import { skillName } from '../../lib/practiceRecommendations'

export default function RecommendationPreferences({ value, request, suggestions = [], onSave, communityId, onSharingChange }) {
  const [draft, setDraft] = useState(() => ({
    ...value,
    focus_skills: value.focus_skills.filter(k => (request.want_types || []).some(t => SKILLS_BY_CATEGORY[t]?.some(s => s.key === k))),
    support_skills: value.support_skills.filter(k => (request.help_types || []).some(t => SKILLS_BY_CATEGORY[t]?.some(s => s.key === k))),
  }))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const toggle = (field, key) => {
    setMessage('')
    setDraft(d => ({ ...d, [field]: d[field].includes(key) ? d[field].filter(k => k !== key) : d[field].length < 3 ? [...d[field], key] : d[field] }))
  }
  const save = async () => {
    setSaving(true); setMessage('')
    try { const result = await onSave(draft); setMessage(result?.error ? 'Could not save. Please try again.' : 'Saved. Recommendations refreshed.') }
    catch { setMessage('Could not save. Please try again.') }
    finally { setSaving(false) }
  }
  return <details className="quest-recommendation-settings"><summary>Personalise my recommendations</summary>
    <p>Your practice focus stays private. Support skills you save appear on your anonymous card as self selected.</p>
    {[['focus_skills', 'My next focus', request.want_types], ['support_skills', 'Skills I feel strong in', request.help_types]].map(([field, title, types]) => <fieldset key={field} disabled={saving}>
      <legend>{title} · Choose up to 3</legend>
      {(types || []).filter(t => SKILLS_BY_CATEGORY[t]).map(t => <div key={t}><p>{INTERVIEW_CATEGORIES[t].label}</p><div className="quest-skill-options">
        {SKILLS_BY_CATEGORY[t].map(skill => <button type="button" key={skill.key} aria-pressed={draft[field].includes(skill.key)} disabled={!draft[field].includes(skill.key) && draft[field].length >= 3} onClick={() => toggle(field, skill.key)}>{draft[field].includes(skill.key) ? '✓ ' : ''}{skill.label}</button>)}
      </div></div>)}
    </fieldset>)}
    {suggestions.length > 0 && <div><p>From your recent verified feedback · Only you can see this</p><div className="quest-skill-options">{suggestions.filter(k => (request.want_types || []).some(t => SKILLS_BY_CATEGORY[t]?.some(s => s.key === k))).map(k => <button key={k} type="button" disabled={saving || (!draft.focus_skills.includes(k) && draft.focus_skills.length >= 3)} aria-pressed={draft.focus_skills.includes(k)} onClick={() => toggle('focus_skills', k)}>{draft.focus_skills.includes(k) ? '✓ ' : '+ '}{skillName(k)}</button>)}</div><small>Choose a suggestion and save to use it for your next recommendations.</small></div>}
    {communityId && <><PeerStrengthSharing communityId={communityId} onChange={onSharingChange} /><PeerStrengthSharing communityId={communityId} onChange={onSharingChange} history /></>}
    <label className="quest-response-choice"><input type="checkbox" checked={draft.share_response} disabled={saving} onChange={e => { setDraft(d => ({ ...d, share_response: e.target.checked })); setMessage('') }} /> Share my response record and use it to find similar response habits</label>
    <small>Last 90 days. One invitation per sender, at least 3 senders. Accepting or declining within 48 hours both count. Names stay hidden until you both accept.</small>
    <button type="button" className="quest-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save & refresh recommendations'}</button>
    {message && <p role="status">{message}</p>}
  </details>
}
