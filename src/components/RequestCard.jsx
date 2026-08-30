import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { fetchTrustSignal } from '../lib/recognition'
import { Handshake, X } from 'lucide-react'
import PeerAvatar from './PeerAvatar'
import { posterDisplay } from '../lib/visibility'
import { resolveAvatarSeed } from './SettingsPage'

// Distance (px) the card must travel to commit a swipe on release. Kept
// deliberately high so you can drag right, HOLD to read the big CONNECT stamp,
// and only connect on a full, intentional swipe — dragging back under the bar
// cancels. (An earlier attempt lowered this + added a flick trigger, which
// made the card fly off too eagerly and killed the lingering the user wanted.)
const SWIPE_THRESHOLD = 90
const ROTATION_RANGE  = 10

const C = {
  gold:       '#C9A33B',
  goldDark:   '#A6822A',
  goldLight:  '#E8D9A7',
  goldBg:     '#F8F3E5',
  warm:       '#8B6F47',
  warmDark:   '#3D3020',
  warmBg:     '#FAF6F0',
  warmBorder: '#E8DDD0',
  text:       '#111111',
  textSub:    '#4B5563',
  textMuted:  '#9CA3AF',
  white:      '#FFFFFF',
}

/* ── Urgency indicator config ────────────────────────────────────── */
const URGENCY = {
  urgent: { label: 'Urgent',    bg: '#FEF2F2', border: '#FECACA', color: '#991B1B', dot: '#EF4444' },
  soon:   { label: 'This week', bg: '#FFF8EB', border: '#FDE68A', color: '#92400E', dot: '#F59E0B' },
}

// One-time swipe hint. localStorage access is wrapped so a private-browsing
// SecurityError degrades to "always show" rather than crashing the deck.
const SWIPE_HINT_KEY = 'mutu:swipeHintSeen'
function swipeHintSeen() {
  try { return window.localStorage.getItem(SWIPE_HINT_KEY) === '1' } catch { return false }
}
function markSwipeHintSeen() {
  try { window.localStorage.setItem(SWIPE_HINT_KEY, '1') } catch {}
}

export default function RequestCard({ request, onDrag, onSwipeLeft, onSwipeRight, isTop, matchReason, matchReasons, onTap }) {
  const [offset, setOffset] = useState(0)
  const [hasDragged, setHasDragged] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Coarse trust signal for the poster (Slice 4) — shown only once ≥3 distinct
  // people have recognized them. Floored to 3+/5+/10+, no identity revealed.
  const posterId = request?.created_by || request?.poster_id
  const [trust, setTrust] = useState(null)
  useEffect(() => {
    let alive = true
    if (!posterId) { setTrust(null); return }
    fetchTrustSignal(posterId).then(t => { if (alive) setTrust(t) })
    return () => { alive = false }
  }, [posterId])
  const trustTier = !trust?.qualified ? null
    : trust.recognizerCount >= 10 ? '10+'
    : trust.recognizerCount >= 5  ? '5+' : '3+'
  const [showHint, setShowHint] = useState(() => !swipeHintSeen())
  const rotate       = offset ? Math.min(Math.max(offset / 16, -ROTATION_RANGE), ROTATION_RANGE) : 0
  // Stamps reach full strength at ~45% of the swipe distance instead of 100%,
  // so the meaning of the gesture is readable early in the drag (beta fb5).
  const matchOpacity = offset ? Math.min( offset / (SWIPE_THRESHOLD * 0.45), 1) : 0
  const passOpacity  = offset ? Math.min(-offset / (SWIPE_THRESHOLD * 0.45), 1) : 0
  // While the finger is down the stamp tracks it instantly; on release the
  // opacity transition below lets it linger and fade instead of vanishing
  // the moment offset snaps back to 0. The fade is slow so CONNECT/PASS stay
  // readable for a beat after you let go.
  const stampTransition = dragging
    ? 'transform 0.05s'
    : 'opacity 0.9s ease-out, transform 0.4s ease-out'

  const handleDrag = (_, info) => {
    if (!isTop) return
    if (Math.abs(info.offset.x) > 4) {
      setHasDragged(true)
      setDragging(true)
      if (showHint) { setShowHint(false); markSwipeHintSeen() }
    }
    setOffset(info.offset.x)
    onDrag?.(info.offset.x)
  }

  const handleDragEnd = (_, info) => {
    if (!isTop) return
    setDragging(false)
    setOffset(0)
    onDrag?.(0)
    if (info.offset.x >  SWIPE_THRESHOLD) onSwipeRight()
    else if (info.offset.x < -SWIPE_THRESHOLD) onSwipeLeft()
    // Reset after a tick so the pointerUp handler can read it
    setTimeout(() => setHasDragged(false), 0)
  }

  const handlePointerUp = () => {
    if (!isTop || hasDragged) return
    onTap?.(request)
  }

  return (
    <motion.div
      layout
      className="absolute inset-x-4 top-4 touch-none"
      style={{
        borderRadius: 24,
        cursor: isTop ? 'grab' : 'default',
        zIndex: isTop ? 10 : 5,
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF8F2 100%)',
        border: `1px solid ${C.goldLight}`,
        boxShadow: isTop
          ? '0 16px 50px rgba(0,0,0,0.08), 0 4px 16px rgba(201,163,59,0.12)'
          : '0 6px 20px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        height: 'auto',
        maxHeight: 'calc(100% - 24px)',
        display: 'flex',
        flexDirection: 'column',
        // Dragging on the card's TEXT was starting an iOS text selection /
        // callout mid-swipe, which cancelled the drag so the CONNECT/PASS
        // stamp stopped tracking the finger and the gesture felt inconsistent.
        // Suppressing selection keeps the whole gesture with the drag handler.
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onPointerUp={handlePointerUp}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      // 1:1 with the finger — the card sticks to and moves WITH your thumb
      // (was 0.6, a laggy rubber-band that pulled back and made CONNECT feel
      // like it wouldn't stay under your finger). Springs back on release
      // only if you didn't cross the swipe threshold.
      dragElastic={1}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      animate={{
        rotate,
        scale: isTop ? 1 : 0.94,
        y:     isTop ? 0 : 16,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* ── Top accent stripe ─────────────────────────── */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg,
            transparent 0%,
            ${C.goldLight} 15%,
            ${C.gold}     40%,
            ${C.warmBorder} 65%,
            ${C.warm}     85%,
            transparent  100%)`,
        }}
      />

      {/* ── Swipe overlays (Tinder/Hinge style stamps) ── */}
      {isTop && (
        <>
          {/* CONNECT — top-left stamp on right swipe */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 28, left: 20, zIndex: 20,
              opacity: matchOpacity,
              transform: `scale(${0.7 + matchOpacity * 0.3}) rotate(-12deg)`,
              transition: stampTransition,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              border: `3px solid ${C.gold}`,
              background: 'rgba(251,246,236,0.92)',
              boxShadow: '0 4px 20px rgba(201,163,59,0.35)',
            }}>
              <Handshake size={22} stroke={C.goldDark} strokeWidth={2.2} />
              <span style={{
                fontSize: 18, fontWeight: 800, letterSpacing: '0.12em',
                color: C.goldDark, fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                CONNECT
              </span>
            </div>
          </div>

          {/* PASS — top-right stamp on left swipe */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: 28, right: 20, zIndex: 20,
              opacity: passOpacity,
              transform: `scale(${0.7 + passOpacity * 0.3}) rotate(12deg)`,
              transition: stampTransition,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              border: '3px solid #9CA3AF',
              background: 'rgba(243,244,246,0.92)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}>
              <X size={22} stroke="#6B7280" strokeWidth={2.6} />
              <span style={{
                fontSize: 18, fontWeight: 800, letterSpacing: '0.12em',
                color: '#6B7280', fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                PASS
              </span>
            </div>
          </div>

          {/* First-use swipe hint (fb5) — shows until the very first real
              drag anywhere in Discover, then never again (localStorage). */}
          {showHint && (
            <motion.div
              className="absolute pointer-events-none"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              style={{
                bottom: 18, left: 0, right: 0, zIndex: 20,
                display: 'flex', justifyContent: 'center',
              }}
            >
              <motion.div
                animate={{ x: [-5, 5, -5] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'rgba(17,17,17,0.78)',
                  backdropFilter: 'blur(6px)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                }}
              >
                <X size={14} stroke="#D1D5DB" strokeWidth={2.6} />
                <span style={{
                  fontSize: 12, fontWeight: 600, color: '#E5E7EB',
                  fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'nowrap',
                }}>
                  ← Swipe left to pass&nbsp;&nbsp;·&nbsp;&nbsp;Swipe right to connect →
                </span>
                <Handshake size={14} stroke={C.goldLight} strokeWidth={2.2} />
              </motion.div>
            </motion.div>
          )}
        </>
      )}

      {/* ── Card body ─────────────────────────────────── */}
      {/* pan-y: allow vertical scroll of a long request while keeping the
          left/right swipe gesture working (a plain scroll child eats it). */}
      <div style={{ padding: '28px 30px 24px', flex: 1, overflowY: 'auto', minHeight: 0, touchAction: 'pan-y' }}>

        {/* ── Scannable meta bar — the 1-second decision row ────── */}
        {(() => {
          const urg = request.urgency ? URGENCY[request.urgency] : null
          return (
            <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 20 }}>
              {/* Category — filled, high-contrast */}
              <span style={{
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
                color: '#FFFFFF',
                borderRadius: 99, padding: '5px 14px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                fontFamily: 'Inter, system-ui, sans-serif',
                boxShadow: '0 2px 6px rgba(201,163,59,0.25)',
              }}>
                {request.category}
              </span>
              {/* Time — filled dark chip */}
              {request.time && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: '#1A1A1A', color: '#FFFFFF',
                  borderRadius: 99, padding: '5px 12px',
                  fontSize: 11, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M12 6v6l4 2" />
                  </svg>
                  {request.time}
                </span>
              )}
              {/* Urgency — bold color-coded */}
              {urg && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: urg.color, color: '#FFFFFF',
                  borderRadius: 99, padding: '5px 12px',
                  fontSize: 11, fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif',
                  boxShadow: `0 2px 8px ${urg.dot}44`,
                }}>
                  {urg.label}
                </span>
              )}
              {/* Timestamp — right-aligned, quiet */}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.textMuted, opacity: 0.55, fontFamily: 'Inter, system-ui, sans-serif' }}>
                {request.createdAt}
              </span>
            </div>
          )
        })()}

        {/* ── WHAT THEY NEED ─────────────────────────────── */}
        <div style={{ marginBottom: 22 }}>
          <div className="flex items-center" style={{ marginBottom: 10 }}>
            <div style={{ width: 2.5, height: 14, background: C.gold, borderRadius: 99, marginRight: 10, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#8A6E1E',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              Looking for
            </span>
          </div>
          <p
            style={{
              // 15px / 3 lines rather than 17px / 2: beta feedback (fb9) —
              // titles like "Connect with others in the CPG Industry — Want
              // to connect with…" were cutting off before the actual ask.
              fontSize: 15,
              lineHeight: 1.45,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#111111',
              fontFamily: 'Inter, system-ui, sans-serif',
              paddingLeft: 13,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {request.needs}
          </p>
        </div>

        {/* ── Tags ────────────────────────────────────── */}
        {request.tags?.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 18, paddingLeft: 13 }}>
            {request.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
                  color: C.textSub, background: '#F5F3F0', border: '1px solid #EDE9E3',
                  borderRadius: 99, padding: '3px 10px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Divider + secondary block render only when the poster shared
            a standing contribution — an ask alone is a complete card. */}
        {Boolean(request.offers?.trim()) && (
        <>
        <div
          style={{
            height: 1,
            background: 'linear-gradient(90deg, rgba(201,163,59,0.25), rgba(139,111,71,0.1), transparent)',
            marginBottom: 22,
          }}
        />

        {/* ── ALSO HAPPY TO HELP WITH — warmer, secondary context:
            a standing community contribution, never the "price" of
            the ask above, so it reads smaller and softer. ── */}
        <div style={{ marginBottom: 18 }}>
          <div className="flex items-center" style={{ marginBottom: 8 }}>
            <div style={{ width: 2.5, height: 14, background: C.warm, borderRadius: 99, marginRight: 10, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: C.warmDark,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              Also happy to help with
            </span>
          </div>
          <p
            style={{
              // Secondary to the ask above: smaller, lighter, 2 lines.
              fontSize: 13,
              lineHeight: 1.5,
              fontWeight: 500,
              color: '#5C5449',
              fontFamily: 'Inter, system-ui, sans-serif',
              paddingLeft: 13,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {request.offers}
          </p>
        </div>
        </>
        )}

        {/* Footer */}
        {(() => {
          const display = posterDisplay(request)
          const avatarSeed = display.useAvatar
            ? (resolveAvatarSeed(display.avatarUrl) || request.id)
            : request.id
          return (
        <div
          className="flex items-center gap-2"
          style={{
            paddingTop: 14,
            borderTop: '1px solid rgba(0,0,0,0.05)',
          }}
        >
          {/* Avatar — preset for public users with avatar_url, otherwise anonymous */}
          <div style={{
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            flexShrink: 0,
          }}>
            <PeerAvatar name={display.primary} anonymous={!display.isPublic} seed={avatarSeed} size={36} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 11,
              letterSpacing: display.isPublic ? '0.04em' : '0.12em',
              textTransform: display.isPublic ? 'none' : 'uppercase',
              fontWeight: display.isPublic ? 600 : 500,
              color: display.isPublic ? C.text : C.textMuted,
              opacity: display.isPublic ? 0.95 : 0.6,
              fontFamily: 'Inter, system-ui, sans-serif',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {display.isPublic && (
                <span style={{ marginRight: 5, opacity: 0.85 }}>🌟</span>
              )}
              {display.primary}
              {display.secondary && (
                <span style={{ color: C.textMuted, opacity: 0.7, fontWeight: 400 }}>
                  {' · '}{display.secondary}
                </span>
              )}
              {/* Student / Alumni badge (fb11) — anonymity-safe: says what
                  kind of member this is, not who. Other member types
                  (invited, premium, admin) stay unlabelled. */}
              {(request.creator?.member_type === 'student' || request.creator?.member_type === 'alumni') && (
                <span style={{
                  marginLeft: 7,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: request.creator.member_type === 'alumni' ? '#8A6E1E' : '#4B6B8C',
                  background: request.creator.member_type === 'alumni' ? 'rgba(201,163,59,0.14)' : 'rgba(75,107,140,0.10)',
                  border: `1px solid ${request.creator.member_type === 'alumni' ? 'rgba(201,163,59,0.4)' : 'rgba(75,107,140,0.25)'}`,
                  verticalAlign: 'middle',
                }}>
                  {request.creator.member_type === 'alumni' ? 'Alumni' : 'Student'}
                </span>
              )}
            </p>
            {/* Up to 3 match reasons as chips. Falls back to the single joined
                string when only matchReason is provided (older callers). */}
            {(() => {
              const chips = (matchReasons && matchReasons.length)
                ? matchReasons.slice(0, 3)
                : (matchReason ? [matchReason] : [])
              if (chips.length === 0) return null
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {chips.map((c, i) => (
                    <span key={i} style={{
                      fontSize: 10.5,
                      color: C.warm,
                      fontWeight: 600,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      background: 'rgba(201,163,59,0.10)',
                      border: '1px solid rgba(201,163,59,0.22)',
                      borderRadius: 99,
                      padding: '2px 8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>
                      {c}
                    </span>
                  ))}
                </div>
              )
            })()}
            {/* Trust line (Slice 4) — quiet metadata row, below the reasoning.
                No identity, no chip detail; only the floored recognizer count. */}
            {trustTier && (
              <p style={{
                fontSize: 11,
                color: C.textMuted,
                fontWeight: 500,
                fontFamily: 'Inter, system-ui, sans-serif',
                marginTop: 4,
                display: 'flex', alignItems: 'center', gap: 5,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.goldDark} strokeWidth="2" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Consistently follows through · recognized by {trustTier} members
              </p>
            )}
          </div>

          {/* Tap hint */}
          {isTop && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              color: C.textMuted, opacity: 0.5, flexShrink: 0,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 500, fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                Details
              </span>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </div>
          )
        })()}

      </div>
    </motion.div>
  )
}
