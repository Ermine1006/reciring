import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import EventCover from './EventCover'
import EventMarketplace from './EventMarketplace'
import { fetchEventById } from '../lib/events'
import { GOAL_OPTIONS, fetchEventGoals, saveEventGoals } from '../lib/eventPrep'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3', goldBg: '#FBF6EC',
  ink: '#14110C', sub: '#6B6152', muted: '#9C9789', white: '#FFFFFF', border: '#EFEAE0',
}

function fmtWhen(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * Event Preparation page (Phase 2). Helps an attendee prepare intentionally:
 * set a goal, post what they're looking for / can offer, and browse the
 * Opportunity Board — all before the event.
 *
 * Looking-for / can-offer + the Opportunity Board are the existing Event
 * Marketplace (reused). Only "My goal" is new (event_goals).
 */
export default function EventPreparePage({ eventId, userId, onBack, onOpenMatch }) {
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState([])
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: ev }, { goals: g }] = await Promise.all([
        fetchEventById(eventId),
        fetchEventGoals(eventId, userId),
      ])
      if (!alive) return
      setEvent(ev)
      setGoals(g)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [eventId, userId])

  const toggleGoal = async (id) => {
    const next = goals.includes(id) ? goals.filter(g => g !== id) : [...goals, id]
    setGoals(next)                                  // optimistic
    const { error } = await saveEventGoals(eventId, userId, next)
    if (!error) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1400) }
  }

  if (loading) {
    return <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4', padding: 24, textAlign: 'center' }}>
      <p style={{ color: C.muted, fontSize: 14, marginTop: 40 }}>Loading…</p>
    </div>
  }

  return (
    <div className="flex-1 phone-scroll" style={{ background: '#F9F7F4' }}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} style={{ padding: '14px 18px 34px' }}>
        {/* Back */}
        <button onClick={onBack} style={backBtn}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>

        {/* Cover + title */}
        <EventCover event={event} radius={16} style={{ marginBottom: 14, border: `1px solid ${C.border}` }} />
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Prepare for this event
        </p>
        <h1 style={{ margin: '4px 0 3px', fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
          {event?.title}
        </h1>
        <p style={{ margin: 0, fontSize: 12.5, color: C.sub, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {fmtWhen(event?.start_at)}{event?.location ? ` · ${event.location}` : ''}
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: C.sub, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Make the most of your conversations — set a goal, share what you're looking for, and see who else is coming.
        </p>

        {/* ── 1. My goal ─────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '22px 0 10px' }}>
          <p style={sectionLabel}>My goal for this event</p>
          {savedFlash && <span style={{ fontSize: 11, color: C.goldDark, fontWeight: 600 }}>✓ Saved</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {GOAL_OPTIONS.map(g => {
            const on = goals.includes(g.id)
            return (
              <button key={g.id} type="button" onClick={() => toggleGoal(g.id)}
                style={{
                  padding: '9px 15px', borderRadius: 999,
                  border: `1.5px solid ${on ? C.gold : C.border}`,
                  background: on ? C.goldBg : C.white,
                  color: on ? C.goldDark : C.sub,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif', transition: 'all .15s',
                }}>
                {on ? '✓ ' : ''}{g.label}
              </button>
            )
          })}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: C.muted, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Private to you — helps Mutu tailor who you meet.
        </p>

        {/* ── 2–4. Looking for / Can offer / Opportunity Board ── */}
        {/* Reuses the Event Marketplace: "Your posts" = looking-for + offering,
            "Browse attendees" = the Opportunity Board, with "I'm Interested". */}
        <div style={{ marginTop: 24 }}>
          <EventMarketplace
            eventId={eventId}
            userId={userId}
            isHost={event?.host_user_id === userId}
            onOpenChat={onOpenMatch}
          />
        </div>
      </motion.div>
    </div>
  )
}

const backBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
  background: C.white, border: `1px solid ${C.border}`, borderRadius: 99,
  padding: '7px 14px', fontSize: 13, fontWeight: 600, color: C.ink,
  fontFamily: 'Inter, system-ui, sans-serif', cursor: 'pointer',
}
const sectionLabel = { fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.gold, fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }
