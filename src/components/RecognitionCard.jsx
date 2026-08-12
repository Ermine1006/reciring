import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Chip from './Chip'
import {
  confirmExchange, fetchExchangeStatus, hasRecognized, submitRecognition,
} from '../lib/recognition'
import { matchaCta } from '../lib/matchaCta'

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#1A1712', text: '#111111', textSub: '#6B6152', textMuted: '#9CA3AF',
  border: '#E5E7EB', white: '#FFFFFF',
}

// The five things worth naming after an exchange. Never a rating — always
// specific, human recognition.
const CHIP_OPTIONS = [
  'Responsive', 'Great listener', 'Followed through',
  'High-quality advice', 'Warm introduction',
]

// Local copy of the onboarding toggleList helper (it isn't exported).
const toggle = (setList) => (val) =>
  setList(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])

const eyebrow = {
  fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
  fontWeight: 600, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif',
}
const inputStyle = {
  width: '100%', background: '#FAFAFA', border: `1.5px solid ${C.border}`,
  color: C.text, outline: 'none', padding: '12px 16px', borderRadius: 12,
  fontSize: 14, fontFamily: 'Inter, system-ui, sans-serif',
}
const card = {
  background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF8F2 100%)',
  border: `1px solid ${C.goldLight}`, borderRadius: 18, overflow: 'hidden',
  boxShadow: '0 6px 18px rgba(201,163,59,0.10)',
}

/**
 * The recognition flow for a single match, rendered inside the chat thread.
 * Replaces the old star-rating prompt. Drives itself off the DB:
 *   'cta'      → either person taps "We met"
 *   'waiting'  → I've confirmed; waiting for the other person
 *   'recognize'→ both confirmed; I pick chips + optional private line
 *   'done'     → I've recognized (this session), shows "You created value"
 *   'already'  → I recognized in a past session (compact acknowledgement)
 *
 * Never shows points, scores, stars, ranks, or levels.
 */
export default function RecognitionCard({ matchId, peerId, peerName, currentUserId, onSeeImpact }) {
  const [phase, setPhase]   = useState('loading')
  const [chips, setChips]   = useState([])
  const [note, setNote]     = useState('')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState(null)
  const pollRef = useRef(null)

  const name = peerName || 'your peer'

  // Resolve the current phase from the DB.
  const refresh = async () => {
    if (!currentUserId) return
    const { recognized } = await hasRecognized(matchId, currentUserId)
    if (recognized) { setPhase('already'); return }
    const { mineConfirmed, bothConfirmed } = await fetchExchangeStatus(matchId, currentUserId)
    if (bothConfirmed)     setPhase('recognize')
    else if (mineConfirmed) setPhase('waiting')
    else                    setPhase('cta')
  }

  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [matchId, currentUserId])

  // While waiting for the counterpart, poll so the screen advances on its own
  // once they confirm. Cleared as soon as we leave the waiting phase.
  useEffect(() => {
    if (phase !== 'waiting') { if (pollRef.current) clearInterval(pollRef.current); return }
    pollRef.current = setInterval(refresh, 4000)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line
  }, [phase, matchId, currentUserId])

  const handleWeMet = async () => {
    if (busy) return
    setBusy(true); setErr(null)
    const { error } = await confirmExchange(matchId, currentUserId)
    setBusy(false)
    if (error) { setErr('Could not confirm — try again.'); return }
    await refresh()
  }

  const handleSend = async () => {
    if (busy || chips.length === 0) return
    setBusy(true); setErr(null)
    const { error } = await submitRecognition({
      matchId, giverId: currentUserId, receiverId: peerId, chips, freeText: note,
    })
    setBusy(false)
    if (error) { setErr(error.message || 'Could not send — try again.'); return }
    setPhase('done')
  }

  if (phase === 'loading' || !currentUserId) return null

  // Compact acknowledgement for a match already recognized in a prior session.
  if (phase === 'already') {
    return (
      <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ color: C.goldDark, fontSize: 15, lineHeight: 1 }}>✓</span>
        <span style={{ fontSize: 13, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
          You recognized {name}.
        </span>
      </div>
    )
  }

  return (
    <div style={{ ...card, padding: 16 }}>
      <AnimatePresence mode="wait">

        {/* ── We met ── */}
        {phase === 'cta' && (
          <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 16, fontWeight: 600, color: C.ink, margin: '0 0 4px' }}>
              Did you two connect?
            </p>
            <p style={{ fontSize: 12.5, color: C.textMuted, margin: '0 0 14px', lineHeight: 1.5 }}>
              When you both confirm, you'll each get to recognize what stood out.
            </p>
            <PrimaryButton onClick={handleWeMet} busy={busy}>We met</PrimaryButton>
          </motion.div>
        )}

        {/* ── Waiting for the other person ── */}
        {phase === 'waiting' && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }}>
            <Spinner />
            <span style={{ fontSize: 13.5, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
              Waiting for {name} to confirm…
            </span>
          </motion.div>
        )}

        {/* ── Recognition screen ── */}
        {phase === 'recognize' && (
          <motion.div key="recognize" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p style={{ ...eyebrow, marginBottom: 10 }}>You both confirmed</p>
            <h3 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 19, fontWeight: 600, color: C.ink, lineHeight: 1.3, margin: '0 0 4px' }}>
              What stood out about working with {name}?
            </h3>
            <p style={{ fontSize: 12.5, color: C.textMuted, margin: '0 0 14px' }}>Pick what's true.</p>
            <div className="flex flex-wrap gap-2">
              {CHIP_OPTIONS.map(opt => (
                <Chip key={opt} label={opt} active={chips.includes(opt)} onClick={toggle(setChips)} />
              ))}
            </div>
            <input
              style={{ ...inputStyle, marginTop: 16 }}
              value={note}
              maxLength={280}
              onChange={(e) => setNote(e.target.value)}
              placeholder="One line, if you'd like (private)"
            />
            {err && <p style={{ color: '#DC2626', fontSize: 12, margin: '10px 0 0' }}>{err}</p>}
            <PrimaryButton onClick={handleSend} busy={busy} disabled={chips.length === 0} style={{ marginTop: 18 }}>
              Send recognition
            </PrimaryButton>
          </motion.div>
        )}

        {/* ── You created value ── */}
        {phase === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', padding: '10px 6px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(circle at 35% 30%, #F4E4BE, #C9A33B)', boxShadow: '0 8px 22px rgba(201,163,59,0.4)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5C3D11" strokeWidth="2.4">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, fontWeight: 600, color: C.ink, margin: '0 0 6px' }}>
              You created value
            </h3>
            <p style={{ fontSize: 13.5, color: C.textSub, margin: '0 auto 18px', maxWidth: 260, lineHeight: 1.55 }}>
              {name} will see what stood out. This is the quiet ledger of who you've helped — and it starts working for you.
            </p>
            <PrimaryButton onClick={onSeeImpact}>See your impact</PrimaryButton>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

function PrimaryButton({ children, onClick, busy, disabled, style }) {
  const off = busy || disabled
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      className="active:scale-[0.98]"
      style={{
        width: '100%', padding: 14, borderRadius: 14, border: 'none',
        fontSize: 14.5, fontWeight: 700, letterSpacing: '0.02em', cursor: off ? 'default' : 'pointer',
        fontFamily: 'Inter, system-ui, sans-serif', transition: 'all 0.18s',
        ...(off
          ? { background: '#EEE9DE', color: '#B4AC9C', boxShadow: 'none' }
          : matchaCta),
        ...style,
      }}
    >
      {busy ? 'One moment…' : children}
    </button>
  )
}

function Spinner() {
  return (
    <span style={{ display: 'inline-block', width: 14, height: 14, flex: 'none',
      border: `2px solid ${C.goldLight}`, borderTopColor: C.goldDark, borderRadius: '50%',
      animation: 'recSpin 0.7s linear infinite' }}>
      <style>{`@keyframes recSpin{to{transform:rotate(360deg)}}`}</style>
    </span>
  )
}
