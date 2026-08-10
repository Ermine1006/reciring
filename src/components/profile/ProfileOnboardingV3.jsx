import ProfileQuickStart from './ProfileQuickStart'
import { useProfileV3 } from './useProfileV3'

// First-run onboarding for flagged accounts — the LEAN one-screen quick-start
// (Program + can-help + want-help + interests). The full profile (role,
// industries, activities, prompts, connection prefs) is filled later from
// Edit profile. Finishing marks onboarding_done + profile_v3_reviewed.
export default function ProfileOnboardingV3() {
  const { draft, onChange, saveNow } = useProfileV3(true)

  const finish = () => {
    const extra = { onboarding_done: true, profile_v3_reviewed: true }
    // Default a single low-pressure connection preference so "you're both open
    // to coffee" spark matching works even though onboarding no longer asks.
    if (!(draft.helpingPreferences || []).length) extra.helping_preferences = ['coffee-chat']
    saveNow(extra)
  }

  // Owns full-viewport height + scroll (rendered directly under #root's flex row).
  return (
    <div className="phone-scroll" style={{ width: '100%', height: '100dvh' }}>
      <ProfileQuickStart value={draft} onChange={onChange} onDone={finish} />
    </div>
  )
}
