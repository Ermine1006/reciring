export const TEAMMATE_TRAITS = [
  { key: 'responsive', label: 'Responsive', description: 'Replied in time to coordinate our practice' },
  { key: 'reliable', label: 'Reliable', description: 'Followed through on what we agreed' },
  { key: 'well_prepared', label: 'Well prepared', description: 'Came ready for our practice' },
  { key: 'helpful_feedback', label: 'Helpful feedback', description: 'Gave specific, useful feedback' },
]
export const teammateTraitName = key => TEAMMATE_TRAITS.find(t => t.key === key)?.label
