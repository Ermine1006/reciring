// Shared design tokens for the redesigned Profile module (wizard, display,
// match explanation). Derived from the approved demo — Mutu's gold/green/white
// system: green carries primary actions, gold carries accents/selection, and
// each profile section has its own tint (gold = expertise, green = exploring,
// rose = beyond work).

export const C = {
  serif: 'Fraunces, Georgia, serif',
  sans: 'Inter, system-ui, -apple-system, sans-serif',

  title: '#233F2D', green: '#284A38', greenDeep: '#22402F',
  ink: '#26231D', sub: '#6C6559', muted: '#9A9488',
  gold: '#A87E27', goldMid: '#C59A3E', line: '#EAE3D6', card: '#FFFFFF',
  page: 'linear-gradient(180deg,#FAF6EE 0%,#F3ECDF 100%)',

  // Selection (gold chips)
  chipGoldBg: '#F5EBD1', chipGoldBd: '#DEC489', chipGoldInk: '#8A6A1E',

  // Section themes (display + tints)
  themes: {
    gold:  { tile: '#F0E3C4', ink: '#8A6A1E', chipBg: '#F6EDD7', chipBd: '#E3CC93', chipInk: '#8A6A1E' },
    green: { tile: '#DBE7DE', ink: '#3D6A4F', chipBg: '#E9F0EA', chipBd: '#C6D8C9', chipInk: '#3D6A4F' },
    rose:  { tile: '#EEDFD9', ink: '#8A5E4C', chipBg: '#F2E7E1', chipBd: '#E1CDC3', chipInk: '#8A5E4C' },
  },
}

export const cardStyle = {
  background: C.card, border: `1px solid ${C.line}`, borderRadius: 22,
  padding: '26px 22px', fontFamily: C.sans,
}
