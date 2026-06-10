// Shared option lists used by the onboarding wizard AND the My Profile editor.
// Keep these in one place so add/rename only happens here.

export const PROGRAMS = ['MBA', 'MFin', 'MBAN', 'MMgt', 'MMA', 'PhD', 'Other']

export const CAREER_STAGES = [
  'Pre-MBA',
  'Current student',
  'Recent grad',
  'Experienced professional',
]

// id = stored value in profiles.networking_intent (matches Edge Function scorer keys)
// label = display string in chips
export const NETWORKING_INTENTS = [
  { id: 'mentor',      label: 'Mentors' },
  { id: 'cofounder',   label: 'Co-founders' },
  { id: 'investor',    label: 'Investors' },
  { id: 'opportunity', label: 'Career opportunities' },
  { id: 'friend',      label: 'Friends' },
  { id: 'insight',     label: 'Industry insights' },
  { id: 'talent',      label: 'Talent' },
]
