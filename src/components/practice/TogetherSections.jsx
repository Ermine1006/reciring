import { useEffect, useState } from 'react'
import { T, FONT, MIN_TAP, PAGE, CONNECTION_CARDS, EMPTY_EVENT, MATCHING_COPY, ART_BOX } from '../../data/togetherContent'
import { preferenceChips, nextMilestoneProgress, eventMeta } from '../../lib/togetherSummary'
import { PRACTICE_TYPE_LABELS } from '../../data/practiceOptions'
import { formatWindow } from '../../lib/practiceMatching'

// ── The Together "For You" surface ───────────────────────────────
// Presentation only. Every number, chip and event comes from data the
// hub already loaded; every action calls a handler the hub already
// had. Nothing here decides anything about matching, verification,
// Tokens or scheduling.

const card = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: T.radius,
  boxShadow: T.shadow,
}

// One focus treatment for the whole page, so keyboard users always
// see where they are without any element inventing its own style.
const focusable = {
  outlineOffset: 2,
}

/**
 * index.css sets a global `:focus { outline: none }` and never
 * restores a focus-visible ring, so keyboard focus is invisible.
 * Fixing that globally would touch every other page, so the ring is
 * scoped to this page's wrapper instead. Motion is disabled here too
 * for anyone who asked their system for less of it.
 */
export const TOGETHER_CLASS = 'mutu-together'

const TOGETHER_CSS = `
      /* !important is deliberate: it has to beat the app-wide
         ":focus { outline: none }" reset in index.css, which would
         otherwise leave keyboard users with no visible focus at all. */
      .${TOGETHER_CLASS} :focus-visible {
        outline: 2px solid ${T.matchaDeep} !important;
        outline-offset: 2px !important;
        border-radius: 6px;
      }
      @media (prefers-reduced-motion: reduce) {
        .${TOGETHER_CLASS} * {
          transition-duration: 0.01ms !important;
          animation-duration: 0.01ms !important;
        }
      }
`

/**
 * The rule has to live in <head>: rendered inside the tree it sits
 * too early in the cascade and loses to a later sheet, which was
 * confirmed in the browser (the identical rule wins once it is in
 * <head>). Mounted once, and cleaned up with the page.
 */
export function TogetherStyles() {
  useEffect(() => {
    const id = 'mutu-together-styles'
    if (document.getElementById(id)) return undefined
    const el = document.createElement('style')
    el.id = id
    el.textContent = TOGETHER_CSS
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [])
  return null
}

function Chip({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: T.page, border: `1px solid ${T.border}`, borderRadius: 99,
      padding: '6px 11px', fontSize: 11.5, fontWeight: 600,
      color: T.ink2, fontFamily: FONT, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

/* ── 1. Your activity ───────────────────────────────────────────── */

export function ActivitySummary({ passport, onOpen }) {
  const p = passport || {}
  const verified = p.verified || 0
  const partners = p.partners || 0
  const progress = nextMilestoneProgress(p)

  return (
    <section style={{ ...card, margin: '0 16px', padding: '15px 17px' }}
      aria-labelledby="together-activity">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: -6 }}>
        <h2 id="together-activity" style={{
          margin: 0, fontSize: 16.5, fontWeight: 700, color: T.ink,
          letterSpacing: '-0.01em', fontFamily: FONT,
        }}>
          {PAGE.activityTitle}
        </h2>
        {/* text link, full 44px tap area */}
        <button type="button" onClick={onOpen} style={{
          minHeight: MIN_TAP, display: 'inline-flex', alignItems: 'center',
          border: 'none', background: 'none', padding: '0 0 0 12px', cursor: 'pointer',
          fontSize: 13, fontWeight: 650, color: T.matchaDeep, fontFamily: FONT, ...focusable,
        }}>
          {PAGE.activityAction}
        </button>
      </div>

      <p style={{ margin: '-2px 0 0', fontSize: 13, color: T.ink2, fontFamily: FONT }}>
        {verified} verified mock interview{verified === 1 ? '' : 's'}
        {' · '}
        {partners} different partner{partners === 1 ? '' : 's'}
      </p>

      {/* Only shown when a real, already-defined milestone is still
          open. No milestone left → no bar, rather than a bar that
          implies a goal Mutu never promised. */}
      {progress && (
        <div role="progressbar"
          aria-valuemin={0} aria-valuemax={progress.target} aria-valuenow={progress.current}
          aria-valuetext={progress.valueText} title={progress.valueText}
          style={{
            marginTop: 13, height: 6, borderRadius: 99,
            background: T.border, overflow: 'hidden',
          }}>
          <div style={{
            width: `${Math.round(progress.value * 100)}%`, height: '100%',
            background: T.matchaDeep, borderRadius: 99,
          }} />
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'stretch', marginTop: 14,
        borderTop: `1px solid ${T.border}`, paddingTop: 13,
      }}>
        <Metric icon="candidate" value={p.candidateRounds || 0}
          label={`Candidate round${(p.candidateRounds || 0) === 1 ? '' : 's'}`} />
        <span aria-hidden="true" style={{ width: 1, background: T.border, margin: '0 14px' }} />
        <Metric icon="interviewer" value={p.interviewerRounds || 0}
          label={`Interviewer round${(p.interviewerRounds || 0) === 1 ? '' : 's'}`} />
      </div>
    </section>
  )
}

function Metric({ icon, value, label }) {
  const tint = icon === 'candidate' ? T.matchaDeep : T.goldDark
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke={tint} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
      </svg>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 750, color: T.ink, fontFamily: FONT, lineHeight: 1.1 }}>
          {value}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: T.ink2, fontFamily: FONT, marginTop: 2 }}>
          {label}
        </span>
      </span>
    </div>
  )
}

/* ── 2. How do you want to connect? ─────────────────────────────── */

// Flat illustrations, hand-authored so the page needs no artwork
// dependency and no bitmap that would blur. Two tones per card plus a
// botanical accent, drawn only from the Mutu palette. No gradients.
const ART = {
  matcha: { deep: '#68764A', mid: '#8A9668', light: '#C3CBAE', pale: '#E2E7D2', leaf: '#8A9668' },
  gold:   { deep: '#A6822A', mid: '#C9A33B', light: '#E8D9A7', pale: '#F3E7C6', leaf: '#8A9668' },
}

const CARD_ART = {
  // two people taking turns: one speaking, one listening
  one_on_one: (p) => (
    <svg width="74" height="60" viewBox="0 0 74 60" fill="none" aria-hidden="true">
      <ellipse cx="36" cy="56" rx="28" ry="3" fill={p.pale} />
      {/* the round being spoken */}
      <path d="M18 3h30a7 7 0 0 1 7 7v9a7 7 0 0 1-7 7H33l-7 6v-6h-8a7 7 0 0 1-7-7v-9a7 7 0 0 1 7-7Z"
        fill={p.pale} stroke={p.mid} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M22 11h22M22 18h13" stroke={p.deep} strokeWidth="2" strokeLinecap="round" />
      {/* left person, speaking */}
      <circle cx="17" cy="38" r="7" fill={p.mid} stroke={p.deep} strokeWidth="1.7" />
      <path d="M5 54c0-6.4 5.4-10.2 12-10.2S29 47.6 29 54Z"
        fill={p.light} stroke={p.deep} strokeWidth="1.7" strokeLinejoin="round" />
      {/* right person, listening */}
      <circle cx="50" cy="40" r="6.4" fill={p.light} stroke={p.deep} strokeWidth="1.7" />
      <path d="M39 54c0-5.9 5-9.4 11-9.4S61 48.1 61 54Z"
        fill={p.pale} stroke={p.deep} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  // a small group gathering around a date
  groups: (p) => (
    <svg width="74" height="60" viewBox="0 0 74 60" fill="none" aria-hidden="true">
      <ellipse cx="36" cy="56" rx="28" ry="3" fill={p.pale} />
      {/* calendar */}
      <rect x="19" y="4" width="36" height="28" rx="4.5" fill={p.pale} stroke={p.mid} strokeWidth="1.7" />
      <path d="M19 13.5h36" stroke={p.mid} strokeWidth="1.7" />
      <path d="M28 1.5v5M46 1.5v5" stroke={p.deep} strokeWidth="2" strokeLinecap="round" />
      <rect x="24" y="19" width="7" height="6" rx="1.6" fill={p.light} />
      <rect x="33.5" y="19" width="7" height="6" rx="1.6" fill={p.mid} />
      <rect x="43" y="19" width="7" height="6" rx="1.6" fill={p.light} />
      {/* three people */}
      <circle cx="13" cy="40" r="5.4" fill={p.light} stroke={p.deep} strokeWidth="1.6" />
      <path d="M4 54c0-5.2 4.2-8.4 9-8.4s9 3.2 9 8.4Z" fill={p.pale} stroke={p.deep} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="36" cy="38" r="6.4" fill={p.mid} stroke={p.deep} strokeWidth="1.7" />
      <path d="M25 54c0-5.9 5-9.4 11-9.4S47 48.1 47 54Z" fill={p.light} stroke={p.deep} strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="59" cy="40" r="5.4" fill={p.light} stroke={p.deep} strokeWidth="1.6" />
      <path d="M50 54c0-5.2 4.2-8.4 9-8.4s9 3.2 9 8.4Z" fill={p.pale} stroke={p.deep} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
}

/**
 * A real illustration when one has been dropped in, the built-in SVG
 * otherwise. The image is only shown once the browser has actually
 * decoded it, so a missing or broken file degrades to the SVG rather
 * than to a broken-image icon.
 */
function CardArt({ card, palette }) {
  const [state, setState] = useState(card.art ? 'loading' : 'none')
  if (state === 'ok') {
    return (
      <img src={card.art} alt="" aria-hidden="true"
        width={ART_BOX.width} height={ART_BOX.height}
        style={{ width: ART_BOX.width, height: ART_BOX.height, objectFit: 'contain', display: 'block' }} />
    )
  }
  return (
    <>
      {state === 'loading' && (
        <img src={card.art} alt="" aria-hidden="true"
          onLoad={() => setState('ok')} onError={() => setState('none')}
          style={{ display: 'none' }} />
      )}
      {CARD_ART[card.id](palette)}
    </>
  )
}

export function ConnectionCards({ onSelect, selectedId }) {
  return (
    <>
      <h2 style={{
        fontSize: 17, fontWeight: 700, color: T.ink,
        margin: '22px 16px 11px', letterSpacing: '-0.01em', fontFamily: FONT,
      }}>
        {PAGE.connectHeading}
      </h2>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px',
        alignItems: 'stretch',
      }}>
        {CONNECTION_CARDS.map((c) => {
          const matcha = c.tone === 'matcha'
          const on = selectedId === c.id
          return (
            <div key={c.id} style={{
              background: matcha ? T.matchaSoft : T.goldBg,
              border: `1px solid ${on ? (matcha ? T.matchaDeep : T.goldLight) : (matcha ? '#E2E7D2' : T.goldLight)}`,
              borderRadius: T.radius, padding: '15px 14px 14px',
              display: 'flex', flexDirection: 'column', minWidth: 0,
            }}>
              <span style={{ display: 'block', marginBottom: 8, marginLeft: -4 }}>
                <CardArt card={c} palette={matcha ? ART.matcha : ART.gold} />
              </span>
              <h3 style={{
                margin: 0, fontSize: 16, fontWeight: 750, lineHeight: 1.2,
                color: matcha ? T.matchaDeep : T.goldDark,
                letterSpacing: '-0.01em', fontFamily: FONT,
              }}>
                {c.title}
              </h3>
              <p style={{
                margin: '6px 0 13px', fontSize: 12, lineHeight: 1.45,
                color: T.ink2, fontFamily: FONT, flex: 1,
              }}>
                {c.sub}
              </p>
              <button type="button" onClick={() => onSelect(c.id)}
                className="active:scale-[0.98] transition-all"
                style={{
                  minHeight: MIN_TAP, width: '100%', border: 'none', borderRadius: 13,
                  padding: '11px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: FONT,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', gap: 7, ...focusable,
                  // flat fills on purpose: the reference has no
                  // gradients, so the textured matcha CTA is not used here
                  background: matcha ? T.matchaDeep : T.goldDark,
                  color: '#FFFFFF',
                }}>
                {c.cta}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ── 3. Matching status ─────────────────────────────────────────── */

const typeList = (types = []) => (types || [])
  .map((t) => PRACTICE_TYPE_LABELS[t] || t).join(', ')

/**
 * What the member actually posted, in their own words, plus the way
 * out. Being in a pool that you cannot inspect or leave is not a
 * pool anyone should be asked to join, so both live here rather than
 * at the bottom of another tab.
 */
function YourListing({ myRequest, myWindows = [], onLeave }) {
  const [confirmLeave, setConfirmLeave] = useState(false)
  const live = (myWindows || []).filter((w) => w?.starts_at && new Date(w.starts_at) > new Date())
  const tz = myRequest?.timezone
  return (
    <div style={{ marginTop: 11, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
      <p style={{
        margin: '0 0 4px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
        fontWeight: 700, color: T.ink3, fontFamily: FONT,
      }}>
        What you posted
      </p>
      <dl style={{ margin: 0 }}>
        <ListRow label="You want to practise"
          value={[typeList(myRequest?.want_types), myRequest?.want_focus].filter(Boolean).join(' \u00b7 ')} />
        <ListRow label="You can help with"
          value={[typeList(myRequest?.help_types), myRequest?.help_focus].filter(Boolean).join(' \u00b7 ')} />
        <ListRow label="Your background" value={myRequest?.help_context} />
        <ListRow label="Session length"
          value={myRequest?.duration_minutes ? `About ${myRequest.duration_minutes} min` : null} />
        <ListRow label="Times you offered" value={live.length === 0 ? 'None listed' : (
          <span style={{ display: 'grid', gap: 3 }}>
            {live.map((w) => (
              <span key={w.starts_at}>{formatWindow(w.starts_at, w.ends_at, tz)}</span>
            ))}
          </span>
        )} />
      </dl>
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: T.ink3, lineHeight: 1.5, fontFamily: FONT }}>
        Partners see this without your name until you both accept.
      </p>

      {/* Leaving is as easy to find as joining was. */}
      {!confirmLeave ? (
        <button type="button" onClick={() => setConfirmLeave(true)}
          style={{
            minHeight: MIN_TAP, marginTop: 2, border: 'none', background: 'none',
            padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 650,
            color: T.ink2, fontFamily: FONT, textDecoration: 'underline',
            textUnderlineOffset: 3, ...focusable,
          }}>
          Leave the pool
        </button>
      ) : (
        <div style={{
          marginTop: 8, background: T.page, border: `1px solid ${T.border}`,
          borderRadius: 13, padding: '11px 13px',
        }}>
          <p style={{ margin: 0, fontSize: 12.5, color: T.ink, lineHeight: 1.5, fontFamily: FONT }}>
            Leave the pool? New partners will not find you. Your Tokens, your
            Passport and any booked session all stay. You can rejoin whenever
            you like.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => { setConfirmLeave(false); onLeave?.() }}
              style={{
                flex: 1, minHeight: MIN_TAP, border: `1px solid ${T.border}`,
                borderRadius: 11, background: T.surface, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700, color: '#B4232A', fontFamily: FONT, ...focusable,
              }}>
              Yes, leave
            </button>
            <button type="button" onClick={() => setConfirmLeave(false)}
              style={{
                flex: 1, minHeight: MIN_TAP, border: 'none', borderRadius: 11,
                background: T.matchaDeep, color: '#FFFFFF', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700, fontFamily: FONT, ...focusable,
              }}>
              Stay in the pool
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ListRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 10, padding: '5px 0' }}>
      <dt style={{ flex: '0 0 44%', margin: 0, fontSize: 12, color: T.ink3, fontFamily: FONT }}>{label}</dt>
      <dd style={{ flex: 1, margin: 0, fontSize: 12, color: T.ink, fontFamily: FONT, lineHeight: 1.45 }}>{value}</dd>
    </div>
  )
}

export function MatchingStatus({ state, myRequest, myWindows, onPrimary, onLeavePool }) {
  const copy = MATCHING_COPY[state] || MATCHING_COPY.searching
  const chips = preferenceChips(myRequest, myWindows)
  // in the pool → show the listing itself, not a summary of it
  const showListing = Boolean(myRequest && onLeavePool)
  return (
    // bottom padding is small because the action's own 44px tap area
    // supplies the rest; otherwise the card ends in a band of nothing
    <section style={{ ...card, margin: '14px 16px 0', padding: '14px 16px 6px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span aria-hidden="true" style={{
          flexShrink: 0, width: 38, height: 38, borderRadius: 99,
          background: T.page, border: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={T.matchaDeep} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="8.5" r="3.2" />
            <path d="M3 19c0-3.3 2.7-5.1 6-5.1s6 1.8 6 5.1" />
            <path d="M16.5 6.5a4.5 4.5 0 0 1 0 9" strokeDasharray="2.6 2.6" />
          </svg>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: T.ink, fontFamily: FONT, letterSpacing: '-0.01em' }}>
            {copy.title}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: T.ink2, fontFamily: FONT }}>
            {copy.body}
          </p>
        </div>
      </div>

      {/* chips and the action share one row: the preferences and the
          way to change them belong together, and the card stays short */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7,
        marginTop: showListing || chips.length === 0 ? 2 : 11,
      }}>
        {!showListing && chips.map((c) => <Chip key={c.id}>{c.label}</Chip>)}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onPrimary}
          style={{
            minHeight: MIN_TAP, display: 'inline-flex', alignItems: 'center',
            border: 'none', background: 'none', padding: '0 0 0 8px', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 650, color: T.matchaDeep, fontFamily: FONT,
            whiteSpace: 'nowrap', ...focusable,
          }}>
          {copy.cta}
        </button>
      </div>

      {/* Members in the pool can read their own listing and leave it. */}
      {showListing && (
        <YourListing myRequest={myRequest} myWindows={myWindows} onLeave={onLeavePool} />
      )}
    </section>
  )
}

/* ── 4. Upcoming for you ────────────────────────────────────────── */

export function UpcomingForYou({ event, onOpenEvent, onExplore }) {
  // A stored image_url can 404 (deleted upload, moved asset). Falling
  // back to the calendar tile keeps a real event usable instead of
  // showing a broken image where its photo should be.
  const [artBroken, setArtBroken] = useState(false)
  useEffect(() => { setArtBroken(false) }, [event?.id])
  const showImage = Boolean(event?.image_url) && !artBroken
  return (
    <>
      <h2 style={{
        fontSize: 17, fontWeight: 700, color: T.ink,
        margin: '22px 16px 11px', letterSpacing: '-0.01em', fontFamily: FONT,
      }}>
        {PAGE.upcomingHeading}
      </h2>
      <div style={{ padding: '0 16px' }}>
        {event ? (
          <button type="button" onClick={() => onOpenEvent?.(event.id)}
            className="active:scale-[0.995] transition-all"
            style={{
              ...card, width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: 0, display: 'flex', alignItems: 'stretch', gap: 0,
              overflow: 'hidden', height: 96, ...focusable,
            }}>
            {/* fixed crop: an image with its own aspect ratio would
                otherwise stretch the whole row to its natural height */}
            {showImage ? (
              <img src={event.image_url} alt="" loading="lazy"
                onError={() => setArtBroken(true)}
                style={{ width: 104, height: '100%', objectFit: 'cover', flexShrink: 0, display: 'block' }} />
            ) : (
              <span aria-hidden="true" style={{
                width: 104, height: '100%', flexShrink: 0, background: T.goldBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                  stroke={T.goldDark} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2.5" />
                  <path d="M8 3v4M16 3v4M3 10h18" />
                </svg>
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0, padding: '13px 15px' }}>
              <span style={{
                display: 'block', fontSize: 14, fontWeight: 700, color: T.ink,
                fontFamily: FONT, lineHeight: 1.3,
              }}>
                {event.title}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: T.ink2, fontFamily: FONT, marginTop: 3 }}>
                {eventMeta(event)}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
                fontSize: 12.5, fontWeight: 650, color: T.matchaDeep, fontFamily: FONT,
              }}>
                View event <span aria-hidden="true">→</span>
              </span>
            </span>
          </button>
        ) : (
          <div style={{ ...card, padding: '17px' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: FONT }}>
              {EMPTY_EVENT.title}
            </p>
            <p style={{ margin: '5px 0 12px', fontSize: 12.5, lineHeight: 1.5, color: T.ink2, fontFamily: FONT }}>
              {EMPTY_EVENT.body}
            </p>
            <button type="button" onClick={onExplore}
              style={{
                minHeight: MIN_TAP, border: 'none', borderRadius: 13, padding: '11px 18px',
                fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                background: T.goldDark, color: '#FFFFFF', ...focusable,
              }}>
              {EMPTY_EVENT.cta}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
