import { useState, useEffect, useMemo, useRef } from 'react'
import { T, FONT, MIN_TAP } from '../../data/togetherContent'
import { describeSession } from '../../data/practiceModes'
import { describeToken, relationshipProgress, acknowledgeReveal } from '../../lib/practiceToken'

// ── The shared Token reveal ──────────────────────────────────────
// The database created the Token; this only reveals it. Nothing here
// mints, verifies or counts. It is opened only when the server has
// already returned a verified session AND a real Token row was read
// back, so there is never anything to fabricate.

const fmtDate = (iso) => (iso
  ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
  : null)

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

/** The linked-ring motif: two rings that become one shared mark. */
function SharedRings({ joined, reduced = false, size = 132 }) {
  // reduced motion gets the finished drawing, not a faster one
  const t = (spec) => (reduced ? 'none' : spec)
  // one ring per person, drawn apart and then overlapping. The Token
  // is the overlap: it belongs to the pair, not to either of them.
  const shift = joined ? 0 : 13
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 132 82" fill="none" aria-hidden="true"
      style={{ display: 'block' }}>
      <defs>
        <radialGradient id="tokenGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C9A33B" stopOpacity={joined ? 0.22 : 0} />
          <stop offset="100%" stopColor="#C9A33B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="66" cy="41" rx="60" ry="38" fill="url(#tokenGlow)"
        style={{ transition: t('opacity 700ms ease') }} />
      <circle cx={52 - shift} cy="41" r="25" stroke={T.goldDark} strokeWidth="4" fill="none"
        style={{ transition: t('transform 760ms cubic-bezier(.22,.9,.28,1)') }} />
      <circle cx={80 + shift} cy="41" r="25" stroke={T.gold} strokeWidth="4" fill="none"
        style={{ transition: t('transform 760ms cubic-bezier(.22,.9,.28,1)') }} />
      {/* the relationship line, drawn only once the rings have met */}
      <path d="M14 74h104" stroke={T.matchaDeep} strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray="104" strokeDashoffset={joined ? 0 : 104} opacity={joined ? 0.85 : 0}
        style={{ transition: t('stroke-dashoffset 900ms ease 260ms, opacity 400ms ease 260ms') }} />
    </svg>
  )
}

function Row({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderTop: `1px solid ${T.border}` }}>
      <span style={{ flex: '0 0 42%', fontSize: 12.5, color: T.ink3, fontFamily: FONT }}>{label}</span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: FONT }}>{value}</span>
    </div>
  )
}

/**
 * @param token        the row the server returned; never synthesised
 * @param session      its session, for mode / category / focus
 * @param edges        practice_relationship_edges rows (server view)
 * @param startAt      'verification' | 'detail' — already-revealed
 *                     Tokens open at the detail, without animation
 */
export default function TokenReveal({
  open, token, session, edges = [], userId, partnerId,
  partnerName, partnerUnlocked = false, communityId = null,
  startAt = 'verification',
  onPractiseAgain, onViewPassport, onClose, onEvent,
}) {
  const reduced = prefersReducedMotion()
  const [stage, setStage] = useState(startAt)
  const [joined, setJoined] = useState(false)
  const headingRef = useRef(null)

  const detail = useMemo(
    () => describeToken({ token, session, partnerName, partnerUnlocked }),
    [token, session, partnerName, partnerUnlocked]
  )
  const progress = useMemo(
    () => relationshipProgress({ edges, userId, partnerId, communityId }),
    [edges, userId, partnerId, communityId]
  )
  const agreed = useMemo(() => describeSession(session || {}), [session])

  useEffect(() => { if (open) setStage(startAt) }, [open, startAt])

  // the rings meet once the Token stage is reached; with reduced
  // motion they are already together when it appears
  useEffect(() => {
    if (stage !== 'token') { setJoined(false); return undefined }
    if (reduced) { setJoined(true); return undefined }
    const id = window.setTimeout(() => setJoined(true), 90)
    return () => window.clearTimeout(id)
  }, [stage, reduced])

  useEffect(() => {
    if (open && headingRef.current) headingRef.current.focus()
  }, [open, stage])

  if (!open || !token) return null

  const toToken = (how) => {
    acknowledgeReveal(userId, token.id, how)
    onEvent?.(how === 'skipped' ? 'practice_token_reveal_skipped' : 'practice_token_revealed')
    setStage('token')
  }

  const card = {
    width: '100%', maxWidth: 360, maxHeight: '88dvh', overflowY: 'auto',
    background: T.page, borderRadius: 22, border: `1px solid ${T.border}`,
    boxShadow: '0 18px 50px rgba(60,45,10,0.24)', padding: '22px 20px 18px',
  }
  const primary = {
    width: '100%', minHeight: MIN_TAP, border: 'none', borderRadius: 13,
    padding: '12px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: FONT,
    background: T.matchaDeep, color: '#FFFFFF', cursor: 'pointer',
  }
  const quiet = {
    width: '100%', minHeight: MIN_TAP, border: `1px solid ${T.border}`,
    borderRadius: 13, padding: '11px 16px', fontSize: 13, fontWeight: 650,
    fontFamily: FONT, background: T.surface, color: T.ink2, cursor: 'pointer',
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="token-reveal-heading"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(24,22,15,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22,
      }}>
      {/* the whole outcome, announced once, without relying on motion */}
      <p role="status" aria-live="polite" style={{
        position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)',
      }}>
        Practice verified. One shared Token earned.
      </p>

      <div onClick={(e) => e.stopPropagation()} style={card}>
        {stage === 'verification' ? (
          <>
            <h2 id="token-reveal-heading" ref={headingRef} tabIndex={-1}
              style={{ margin: 0, fontSize: 20, fontWeight: 750, color: T.ink, letterSpacing: '-0.01em', fontFamily: FONT }}>
              Practice verified
            </h2>
            <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.55, color: T.ink2, fontFamily: FONT }}>
              You both confirmed that the agreed practice happened and both roles were completed.
            </p>

            <div style={{ margin: '15px 0 4px' }}>
              <Row label="With" value={detail.partnerUnlocked ? detail.partner : 'Your practice partner'} />
              <Row label="Mode" value={agreed.structured ? agreed.title : null} />
              <Row label="Interview type" value={agreed.structured ? agreed.categoryLabel : null} />
              <Row label="Focus" value={agreed.focusLabel || null} />
              <Row label="Verified" value={fmtDate(detail.verifiedAt)} />
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              <button type="button" style={primary} onClick={() => toToken('viewed')}>
                Reveal our Token
              </button>
              <button type="button" style={quiet} onClick={() => toToken('skipped')}>
                Skip animation
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
              <SharedRings joined={joined} reduced={reduced} />
            </div>

            <h2 id="token-reveal-heading" ref={headingRef} tabIndex={-1}
              style={{ margin: 0, fontSize: 20, fontWeight: 750, color: T.ink, textAlign: 'center', letterSpacing: '-0.01em', fontFamily: FONT }}>
              One shared Token earned
            </h2>
            <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.55, color: T.ink2, textAlign: 'center', fontFamily: FONT }}>
              This Token represents one verified practice exchange between you and your partner.
            </p>
            <p style={{ margin: '9px 0 0', fontSize: 12.5, color: T.matchaDeep, textAlign: 'center', fontWeight: 650, fontFamily: FONT }}>
              Your Practice Passport has been updated.
            </p>

            {/* relationship progress, straight from the server view */}
            {progress && (
              <div style={{
                marginTop: 15, background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 15, padding: '12px 14px',
              }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.ink, fontFamily: FONT }}>
                  Your practice connection grew stronger
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: T.ink2, lineHeight: 1.5, fontFamily: FONT }}>
                  {progress.fact}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: 650, color: T.matchaDeep, background: T.matchaSoft,
                    border: '1px solid #E2E7D2', borderRadius: 99, padding: '5px 11px', fontFamily: FONT,
                  }}>
                    {progress.levelLabel}
                  </span>
                  {fmtDate(progress.lastVerifiedAt) && (
                    <span style={{
                      fontSize: 11.5, fontWeight: 600, color: T.ink2, background: T.page,
                      border: `1px solid ${T.border}`, borderRadius: 99, padding: '5px 11px', fontFamily: FONT,
                    }}>
                      Most recent {fmtDate(progress.lastVerifiedAt)}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              <button type="button" style={primary}
                onClick={() => { onEvent?.('practise_again_clicked_from_token'); onPractiseAgain?.() }}>
                Practise again
              </button>
              <button type="button" style={quiet} onClick={onViewPassport}>
                View my Passport
              </button>
              <button type="button" onClick={onClose}
                style={{
                  minHeight: MIN_TAP, border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 650, color: T.ink3, fontFamily: FONT,
                }}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The verified state when no Token can be read. Shown instead of the
 * reveal, never alongside a fabricated one.
 */
export function TokenUnavailableNote() {
  return (
    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: T.ink3, lineHeight: 1.5, fontFamily: FONT }}>
      Token details are not available yet.
    </p>
  )
}
