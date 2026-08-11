// ============================================================
// register-luma-guest — server-side registration for simple, free,
// Mutu-managed Luma events (luma_access = 'managed').
//
//   POST https://public-api.luma.com/v1/events/guests/add
//
// The signed-in Mutu user is identified from their Supabase JWT; we register
// THEM (their own email) — never anyone else. Paid / configurable events use
// the official Luma checkout embed instead (client side).
// ============================================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { CORS, lumaFetch, normalizeEmail } from '../_shared/luma.ts'

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'content-type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  // Identify the caller from their JWT.
  const authHeader = req.headers.get('Authorization') || ''
  const asUser = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  })
  const { data: { user }, error: authErr } = await asUser.auth.getUser()
  if (authErr || !user) return json({ error: 'Not signed in.' }, 401)

  let body
  try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
  const eventId = body.eventId
  if (!eventId) return json({ error: 'eventId required' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

  // The event must be a Luma-managed event.
  const { data: ev } = await db.from('events').select('id, luma_event_id, luma_access, source').eq('id', eventId).maybeSingle()
  if (!ev || ev.source !== 'luma' || !ev.luma_event_id) return json({ error: 'Not a Luma event.' }, 400)
  if (ev.luma_access !== 'managed') return json({ error: 'This event registers on Luma — use the checkout link.' }, 400)

  const email = normalizeEmail(user.email)
  if (!email) return json({ error: 'Your account has no email to register with.' }, 400)
  const { data: prof } = await db.from('profiles').select('name, visibility').eq('id', user.id).maybeSingle()

  try {
    const res = await lumaFetch('/events/guests/add', {
      method: 'POST',
      body: { event_api_id: ev.luma_event_id, guests: [{ email, name: prof?.name || undefined }] },
    })
    const added = res?.guests?.[0] || res?.guest || {}

    await db.from('event_attendees').upsert({
      event_id: ev.id,
      user_id: user.id,
      luma_guest_id: added.api_id || added.guest_api_id || null,
      guest_email: email,
      approval_status: added.approval_status || 'approved',
      registration_source: 'luma',
      visibility: prof?.visibility === 'public' ? 'visible' : 'hidden',
      synced_at: new Date().toISOString(),
    }, { onConflict: 'event_id,user_id' })

    return json({ ok: true, approval_status: added.approval_status || 'approved' })
  } catch (e) {
    return json({ ok: false, error: 'Could not register on Luma. Please try the Luma link.' , detail: String(e?.message || e) }, 502)
  }
})
