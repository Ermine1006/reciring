import ProfileWizard from './ProfileWizard'
import { useProfileV3 } from './useProfileV3'

// First-run onboarding for flagged accounts — the 4-step wizard with real
// persistence. Finishing marks onboarding_done + profile_v3_reviewed, which
// re-renders the app into the main shell.
export default function ProfileOnboardingV3() {
  const { draft, onChange, saveNow } = useProfileV3(true)
  const finish = () => { saveNow({ onboarding_done: true, profile_v3_reviewed: true }) }
  return (
    <div className="flex-1 phone-scroll" style={{ minHeight: '100%' }}>
      <ProfileWizard value={draft} onChange={onChange} onFinish={finish} onBack={() => {}} />
    </div>
  )
}
