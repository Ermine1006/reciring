// Vercel cron — runs daily, does two sweeps in one job:
//
//   1. event_below_min: find upcoming events starting in the next ~36h
//      with attendee_count < min_attendees AND host hasn't been
//      pinged yet (below_min_notified_at IS NULL). Insert one
//      notification per qualifying event for the host; stamp the
//      column so we never ping twice for the same event.
//
//   2. mark_completed: find events whose start_at is more than 4
//      hours in the past and status NOT IN ('cancelled','completed').
//      Set status='completed'. The 4h buffer covers most short events
//      (yoga, coffee chats, sports) without needing an explicit
//      duration column.
//
// Auth: Vercel automatically includes Authorization: Bearer <CRON_SECRET>
// on cron-triggered requests. We verify it here so only Vercel's
// scheduler can invoke this endpoint (without auth, anyone could hit
// /api/cron/event-attendance-check and spam notifications).
//
// Required env vars:
//   CRON_SECRET                — Vercel auto-generated, set via
//                                vercel.json / dashboard
//   VITE_SUPABASE_URL          — used by the service-role client
//   SUPABASE_SERVICE_ROLE_KEY  — to bypass RLS on writes

import { createClient } from '@supabase/supabase-js'

// How far in the future to look for "starts soon" events. We re-run
// daily so a 36h window catches everything that starts in the next
// 12-36h since the previous run was ~24h ago. Smaller windows risk
// missing events; bigger windows are fine because we dedupe on
// below_min_notified_at.
const LOOKAHEAD_HOURS = 36
const COMPLETED_BUFFER_HOURS = 4

export default async function handler(req, res) {
  // 1. Auth — only Vercel's cron should hit this
  const expected = process.env.CRON_SECRET
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!expected || auth !== expected) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'server not configured' })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const now = new Date()
  const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 3600_000)
  const completedCutoff = new Date(now.getTime() - COMPLETED_BUFFER_HOURS * 3600_000)

  const summary = { pinged: 0, completed: 0, errors: [] }

  // ── Sweep 1: below-minimum warnings ────────────────────────
  try {
    const { data: candidates, error } = await admin
      .from('events')
      .select('id, title, host_user_id, min_attendees, max_attendees, event_attendees(count)')
      .gte('start_at', now.toISOString())
      .lte('start_at', horizon.toISOString())
      .gt('min_attendees', 0)
      .is('below_min_notified_at', null)
      .in('status', ['upcoming', 'full'])

    if (error) throw error

    for (const ev of (candidates || [])) {
      const attendeeCount = ev.event_attendees?.[0]?.count || 0
      if (attendeeCount >= ev.min_attendees) continue  // healthy turnout

      // Insert notification for host
      const body = `Only ${attendeeCount} ${attendeeCount === 1 ? 'person has' : 'people have'} joined "${ev.title}". You set a minimum of ${ev.min_attendees}. Continue or cancel?`
      const { error: nErr } = await admin.from('notifications').insert({
        user_id:   ev.host_user_id,
        type:      'event_below_min',
        title:     'Low attendance',
        body,
        payload:   {
          event_id:        ev.id,
          attendee_count:  attendeeCount,
          min_attendees:   ev.min_attendees,
        },
      })
      if (nErr) { summary.errors.push({ event_id: ev.id, error: nErr.message }); continue }

      // Stamp the dedupe column
      const { error: uErr } = await admin
        .from('events')
        .update({ below_min_notified_at: now.toISOString() })
        .eq('id', ev.id)
      if (uErr) { summary.errors.push({ event_id: ev.id, error: uErr.message }); continue }

      summary.pinged++
    }
  } catch (err) {
    summary.errors.push({ sweep: 'below_min', error: err?.message || String(err) })
  }

  // ── Sweep 2: mark past events as completed ─────────────────
  try {
    const { data: completedRows, error } = await admin
      .from('events')
      .update({ status: 'completed' })
      .lt('start_at', completedCutoff.toISOString())
      .not('status', 'in', '(cancelled,completed)')
      .select('id')

    if (error) throw error
    summary.completed = (completedRows || []).length
  } catch (err) {
    summary.errors.push({ sweep: 'mark_completed', error: err?.message || String(err) })
  }

  return res.status(200).json({
    ok: true,
    ran_at: now.toISOString(),
    ...summary,
  })
}
