import ProfileWizard from './ProfileWizard'
import { useProfileV3 } from './useProfileV3'

// First-run onboarding for flagged accounts — the 4-step wizard with real
// persistence. Finishing marks onboarding_done + profile_v3_reviewed, which
// re-renders the app into the main shell.
export default function ProfileOnboardingV3() {
  const { draft, onChange, saveNow } = useProfileV3(true)
  const finish = () => { saveNow({ onboarding_done: true, profile_v3_reviewed: true }) }
  // Rendered directly under #root (a fixed-height flex ROW), so this wrapper
  // must own its own full-viewport height + scroll — flex-1 does nothing on the
  // cross axis here and left the page unable to scroll.
  return (
    <div className="phone-scroll" style={{ width: '100%', height: '100dvh' }}>
      <ProfileWizard value={draft} onChange={onChange} onFinish={finish} onBack={() => {}} />
    </div>
  )
}
