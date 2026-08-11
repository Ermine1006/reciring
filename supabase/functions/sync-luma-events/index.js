// ============================================================
// sync-luma-events — import/update events from the Mutu Luma calendar.
//
//   GET https://public-api.luma.com/v1/calendars/events/list  (cursor-paged)
//   → upsert into public.events keyed on luma_event_id (source='luma')
//
// Invoke on a schedule (Supabase cron / external) or manually. Requires the
// LUMA_API_KEY secret. Uses the service-role key so it can write events the
// client can't. Never returns guest emails.
// ============================================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { CORS, lumaFetch, lumaEventToRow } from '../_shared/luma.ts'

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const db = admin()
  const started = Date.now()
  let imported = 0, updated = 0, seen = 0

  try {
    let cursor = null
    do {
      const qs = new URLSearchParams()
      if (cursor) qs.set('pagination_cursor', cursor)
      const page = await lumaFetch(`/calendars/events/list${qs.toString() ? `?${qs}` : ''}`)
      const entries = page?.entries || page?.events || []

      for (const entry of entries) {
        // List responses nest the event under `event`; be tolerant of shapes.
        const ev = entry.event || entry
        const row = lumaEventToRow(ev)
        if (!row.luma_event_id || !row.start_at) continue
        seen++

        // Preserve a Mutu host label; Luma events have no Mutu host user.
        const hostName = ev.host?.name || ev.calendar?.name || 'Luma'
        const patch = {
          ...row,
          host_user_id: null,
          host_display_name: hostName,
          host_type: 'individual',
          // events.max_attendees is 1..500 NOT NULL; capacity is not enforced
          // for Luma events (trigger skips them), so this is display-only.
          max_attendees: Math.max(1, Math.min(500, ev.capacity || row.attendee_count || 500)),
          luma_access: (ev.can_manage_guests || ev.managed) ? 'managed' : 'external',
          last_synced_at: new Date().toISOString(),
        }

        const { data: existing } = await db
          .from('events').select('id').eq('luma_event_id', row.luma_event_id).maybeSingle()

        if (existing) {
          await db.from('events').update(patch).eq('id', existing.id)
          updated++
        } else {
          await db.from('events').insert(patch)
          imported++
        }
      }
      cursor = page?.has_more ? page?.next_cursor : null
    } while (cursor)

    await db.from('luma_sync_log').insert({ kind: 'calendar_sync', ok: true, detail: `seen=${seen} imported=${imported} updated=${updated}` })
    return json({ ok: true, seen, imported, updated, ms: Date.now() - started })
  } catch (e) {
    await db.from('luma_sync_log').insert({ kind: 'calendar_sync', ok: false, detail: String(e?.message || e) })
    return json({ ok: false, error: String(e?.message || e) }, 500)
  }
})

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
