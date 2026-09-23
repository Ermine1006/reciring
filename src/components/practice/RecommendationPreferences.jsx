import PeerStrengthSharing from './PeerStrengthSharing'
import PracticePreferencesSheet from './PracticePreferencesSheet'
import { useEffect, useState } from 'react'
import PracticePreferenceFields, { practicePreferenceDraft, skillsForTypes, togglePracticeSkill } from './PracticePreferenceFields'
import { skillName } from '../../lib/practiceRecommendations'

export default function RecommendationPreferences({ value, request, suggestions = [], onSave, communityId, onSharingChange, onEditTypes, onTimes }) {
  const [draft, setDraft] = useState(() => practicePreferenceDraft(value, request))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  // Live invitation polling must not overwrite an unfinished preference edit.
  const saved = JSON.stringify(practicePreferenceDraft(value, request))
  useEffect(() => { if (!dirty) setDraft(JSON.parse(saved)) }, [saved, dirty])
  const change = next => { setDraft(next); setDirty(true); setMessage('') }
  const toggle = (field, key) => {
    change(togglePracticeSkill(draft, field, key))
  }
  const save = async () => {
    setSaving(true); setMessage('')
    try {
      const result = await onSave(draft)
      if (result?.error) setMessage('Could not save. Your choices are still here. Please try again.')
      else { setDirty(false); setMessage('Preferences saved.') }
    }
    catch { setMessage('Could not save. Please try again.') }
    finally { setSaving(false) }
  }
  return <><button type="button" className="quest-recommendation-settings practice-preference-entry" onClick={() => setOpen(true)}>
    <span className="quest-preference-icon" aria-hidden="true">✦</span>
    <span><strong>Personalise my practice</strong><small>My focus, strengths & practice experience</small></span>
    <span className="quest-preference-edit" aria-hidden="true">Edit ›</span>
  </button>
    <PracticePreferencesSheet open={open} busy={saving} onClose={() => setOpen(false)}>
    <div className="quest-preference-body">
    <p>Your focus stays private. Support skills you save appear on your anonymous card as chosen by you.</p>
    <div className="quest-preference-shortcuts">
      {onEditTypes && <button type="button" className="quest-link" disabled={saving} onClick={onEditTypes}>Change practice types</button>}
      {onTimes && <button type="button" className="quest-link" disabled={saving} onClick={onTimes}>Edit available times</button>}
    </div>
    <PracticePreferenceFields draft={draft} request={request} onChange={change} disabled={saving} />
    {suggestions.length > 0 && <div><p>From your recent verified feedback · Only you can see this</p><div className="quest-skill-options">{skillsForTypes(suggestions, request.want_types).map(k => <button key={k} type="button" disabled={saving || (!draft.focus_skills.includes(k) && draft.focus_skills.length >= 3)} aria-pressed={draft.focus_skills.includes(k)} onClick={() => toggle('focus_skills', k)}>{draft.focus_skills.includes(k) ? '✓ ' : '+ '}{skillName(k)}</button>)}</div><small>Choose a suggestion and save to use it for your next recommendations.</small></div>}
    {communityId && <><PeerStrengthSharing communityId={communityId} onChange={onSharingChange} /><PeerStrengthSharing communityId={communityId} onChange={onSharingChange} history /></>}
    <label className="quest-response-choice"><input type="checkbox" checked={draft.share_response} disabled={saving} onChange={e => change({ ...draft, share_response: e.target.checked })} /> Share my response record and use it to find similar response habits</label>
    <small>Last 90 days. One invitation per sender, at least 3 senders. Accepting or declining within 48 hours both count. Names stay hidden until you both accept.</small>
    <button type="button" className="quest-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save & refresh recommendations'}</button>
    {message && <p role="status">{message}</p>}
    </div>
    </PracticePreferencesSheet></>
}
