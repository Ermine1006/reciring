// Matcha accent — the app's ACTION / interaction color.
//
// Design system: Gold = brand / premium (logo, active nav, borders, brand
// accents). Matcha = action / friendly interaction (primary CTAs, Refresh,
// small interactive affordances). White / warm ivory = canvas.
//
// Roughly 70% white · 20% gold · 10% matcha. Do NOT green surfaces, cards,
// text, borders, the logo, or the active-nav state — matcha is an accent on
// interactive elements only.

export const MATCHA       = '#789A3D'  // primary matcha (CTA fill)
export const MATCHA_DEEP  = '#6E8C38'  // pressed / deeper
export const MATCHA_INK   = '#5F7A33'  // matcha text on light (Refresh, links, quiet pills)
export const MATCHA_SOFT  = '#F0F2E6'  // faint matcha tint (rare, for selected states)

// Very subtle seigaiha (青海波) wave texture, baked in at 0.07 opacity so it
// reads as a premium whisper — visible only on close inspection, never busy.
const SEIGAIHA =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='12'%3E%3Cg%20fill='none'%20stroke='%23ffffff'%20stroke-opacity='0.07'%20stroke-width='0.8'%3E%3Cpath%20d='M0%2012%20A12%2012%200%200%201%2024%2012'/%3E%3Cpath%20d='M3.6%2012%20A8.4%208.4%200%200%201%2020.4%2012'/%3E%3Cpath%20d='M7.2%2012%20A4.8%204.8%200%200%201%2016.8%2012'/%3E%3C/g%3E%3C/svg%3E\")"

// Textured matcha primary-CTA background. Spread into a button's inline style
// AFTER its base style so it replaces the old gold fill:
//   style={{ ...base, ...matchaCta }}
// Provides backgroundColor + image layers + white text + a soft matcha shadow.
// (Remove the button's own background/backgroundColor when applying.)
export const matchaCta = {
  backgroundColor: MATCHA,
  backgroundImage:
    `linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 46%, rgba(0,0,0,0.05)), ${SEIGAIHA}`,
  backgroundRepeat: 'no-repeat, repeat',
  backgroundSize: 'auto, 15px 7.5px',
  color: '#FFFFFF',
  boxShadow: '0 2px 8px rgba(110,140,56,0.30), inset 0 1px 0 rgba(255,255,255,0.16)',
}

// Flat matcha (no texture) — for very small pills/toggles where texture would
// be invisible anyway.
export const matchaFlat = {
  background: MATCHA,
  color: '#FFFFFF',
  boxShadow: '0 2px 7px rgba(110,140,56,0.28)',
}
