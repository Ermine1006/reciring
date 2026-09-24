export const FINANCE_OBSERVATIONS = [
  { key: 'what', label: 'WHAT', description: 'Explained the concepts accurately.' },
  { key: 'why', label: 'WHY', description: 'Explained the reasoning and assumptions.' },
  { key: 'how', label: 'HOW', description: 'Described applying this in real analysis.' },
]
export const usesFinanceObservations = category => ['finance', 'finance_debt', 'finance_markets'].includes(category)
