// Matched → Scheduled → Completed together — the visible progress of
// one exchange. Purely presentational; state comes from the pairing/
// session machine (deriveDisplayState).

import { MATCHA_DEEP } from '../../lib/matchaCta'

const C = { gold: '#C9A33B', ink3: '#9A958B', line: '#E9E5DD' }
const FONT = 'Inter, system-ui, sans-serif'

const STEPS = ['Matched', 'Scheduled', 'Completed together']

// display state → how many steps are done (0–3)
export function progressStage(state) {
  if (state === 'verified') return 3
  if (['scheduled', 'ready_to_confirm', 'waiting_for_partner'].includes(state)) return 2
  return 1   // accepted pairing = matched
}

export default function ExchangeProgress({ state }) {
  const done = progressStage(state)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '2px 0 2px' }}>
      {STEPS.map((label, i) => {
        const isDone = i < done
        const isNext = i === done
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: i < 2 ? 1 : 'none' }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 800,
              background: isDone ? MATCHA_DEEP : '#FFFFFF',
              border: `1.5px solid ${isDone ? MATCHA_DEEP : isNext ? C.gold : C.line}`,
              color: isDone ? '#fff' : C.ink3,
            }}>
              {isDone ? '✓' : ''}
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 650, fontFamily: FONT, whiteSpace: 'nowrap',
              color: isDone ? MATCHA_DEEP : isNext ? '#8A6E1E' : C.ink3,
            }}>
              {label}
            </span>
            {i < 2 && <span style={{ flex: 1, height: 1.5, background: isDone ? MATCHA_DEEP : C.line, minWidth: 8 }} />}
          </div>
        )
      })}
    </div>
  )
}
