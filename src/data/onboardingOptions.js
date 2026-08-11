// Shared option lists used by the onboarding wizard AND the My Profile editor.
// Keep these in one place so add/rename only happens here.

// Program options. The legacy 'MBA' value (used before splitting full-time vs
// part-time) is migrated to 'FT-MBA' by scripts/migration-program-options.sql.
export const PROGRAMS = ['FT-MBA', 'PT-MBA', 'MMA', 'MFin', 'EMBA', 'GEMBA', 'PhD', 'Other']

export const CAREER_STAGES = [
  'Pre-MBA',
  'Current student',
  'Recent grad',
  'Experienced professional',
]

// Graduation-year chips (rolling window) + the "MBA '26"-style credential
// prefix derived from a program, shared by onboarding and the profile editor.
// Rolling window: ~15 years back (for alumni) through 5 years ahead.
export const GRAD_YEARS = (() => { const y = new Date().getFullYear(); return Array.from({ length: 21 }, (_, i) => y - 15 + i) })()
export function programCredential(program) {
  if (!program || program === 'Other') return ''
  return /MBA/i.test(program) ? 'MBA' : program // FT/PT/E/GEMBA → MBA; MMA/MFin/PhD as-is
}

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
