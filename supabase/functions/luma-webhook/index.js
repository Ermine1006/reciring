// ============================================================
// luma-webhook — receive Luma events and keep Mutu in sync.
//
// Handles: guest.registered, guest.updated, event.updated, event.canceled.
// Matches a guest to a Mutu user by NORMALIZED email; raw emails are stored in
// the private guest_email column (revoked from client roles) and never returned.
//
// Optional shared-secret check: if LUMA_WEBHOOK_SECRET is set, the request must
// carry it (align this with Luma's actual signing before production).
// ============================================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { CORS, normalizeEmail, lumaEventToRow } from '../_shared/luma.ts'

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
}
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'content-type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const secret = Deno.env.get('LUMA_WEBHOOK_SECRET')
  if (secret) {
    const given = req.headers.get('x-luma-signature') || req.headers.get('authorization') || ''
    if (!given.includes(secret)) return json({ error: 'bad signature' }, 401)
  }

  const db = admin()
  let payload
  try { payload = await req.json() } catch { return json({ error: 'invalid json' }, 400) }

  const type = payload.type || payload.event_type || payload.event
  const data = payload.data || payload
  try {
    if (type === 'guest.registered' || type === 'guest.updated') {
      await handleGuest(db, data)
    } else if (type === 'event.updated') {
      await handleEventUpdated(db, data)
    } else if (type === 'event.canceled' || type === 'event.cancelled') {
      await handleEventCanceled(db, data)
    } else {
      await log(db, 'webhook', null, type, true, 'ignored')
      return json({ ok: true, ignored: type })
    }
    await log(db, 'webhook', lumaEventId(data), type, true, null)
    return json({ ok: true })
  } catch (e) {
    await log(db, 'webhook', lumaEventId(data), type, false, String(e?.message || e))
    return json({ ok: false, error: String(e?.message || e) }, 500)
  }
})

function lumaEventId(data) {
  return data?.event?.api_id || data?.event_api_id || data?.event_id || data?.guest?.event_api_id || null
}

async function handleGuest(db, data) {
  const guest = data.guest || data
  const lumaEvId = lumaEventId(data) || guest.event_api_id
  if (!lumaEvId) throw new Error('guest event id missing')

  const { data: ev } = await db.from('events').select('id').eq('luma_event_id', lumaEvId).maybeSingle()
  if (!ev) throw new Error(`no Mutu event for luma_event_id ${lumaEvId}`) // sync the calendar first

  const email = normalizeEmail(guest.email || guest.user_email)
  // Match to a Mutu user by email (never expose the address).
  let userId = null, visibility = 'visible'
  if (email) {
    const { data: prof } = await db.from('profiles').select('id, visibility').ilike('email', email).maybeSingle()
    if (prof) { userId = prof.id; visibility = prof.visibility === 'public' ? 'visible' : 'hidden' }
  }

  const row = {
    event_id: ev.id,
    user_id: userId,
    luma_guest_id: guest.api_id || guest.guest_api_id || guest.id,
    guest_email: email || null,
    approval_status: guest.approval_status || 'approved',
    checked_in_at: guest.checked_in_at || null,
    registration_source: 'luma',
    visibility,
    synced_at: new Date().toISOString(),
  }
  // Upsert on the (event_id, luma_guest_id) unique index.
  await db.from('event_attendees').upsert(row, { onConflict: 'event_id,luma_guest_id' })
  // Keep the event's headline count fresh if Luma sent one.
  if (typeof (data.event?.guest_count) === 'number') {
    await db.from('events').update({ attendee_count: data.event.guest_count, last_synced_at: new Date().toISOString() }).eq('id', ev.id)
  }
}

async function handleEventUpdated(db, data) {
  const ev = data.event || data
  const lumaEvId = ev.api_id || ev.event_api_id
  if (!lumaEvId) throw new Error('event id missing')
  const row = lumaEventToRow(ev)
  await db.from('events').update({
    title: row.title, description: row.description, start_at: row.start_at,
    location: row.location, category: row.category, luma_event_url: row.luma_event_url,
    image_url: row.image_url, attendee_count: row.attendee_count,
    last_synced_at: new Date().toISOString(),
  }).eq('luma_event_id', lumaEvId)
}

async function handleEventCanceled(db, data) {
  const ev = data.event || data
  const lumaEvId = ev.api_id || ev.event_api_id
  if (!lumaEvId) throw new Error('event id missing')
  await db.from('events').update({
    status: 'cancelled',
    cancellation_reason: 'Cancelled on Luma',
    cancelled_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
  }).eq('luma_event_id', lumaEvId)
}

async function log(db, kind, lumaId, eventType, ok, detail) {
  try { await db.from('luma_sync_log').insert({ kind, luma_event_id: lumaId, event_type: eventType, ok, detail }) } catch { /* ignore */ }
}
