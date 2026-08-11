// Shared Luma API client for the Edge Functions.
// The key lives ONLY in the function env (Deno.env → Supabase secret).
// Never import this from the React client.

export const LUMA_BASE = 'https://public-api.luma.com/v1'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function lumaKey(): string {
  const k = Deno.env.get('LUMA_API_KEY')
  if (!k) throw new Error('LUMA_API_KEY is not configured in Edge Function secrets')
  return k
}

// One thin fetch wrapper. Luma authenticates with the `x-luma-api-key` header.
export async function lumaFetch(path: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${LUMA_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'x-luma-api-key': lumaKey(),
      'accept': 'application/json',
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON error body */ }
  if (!res.ok) {
    throw new Error(`Luma ${path} → ${res.status}: ${json?.message || text || res.statusText}`)
  }
  return json
}

// Normalized email for matching a Luma guest to a Mutu user. Never logged raw.
export function normalizeEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase()
}

// Luma's category strings → Mutu's fixed category enum (events.category CHECK).
const MUTU_CATEGORIES = ['Sports', 'Career', 'Networking', 'Wellness', 'Social', 'Study Group', 'Startup', 'Other']
export function mapCategory(raw?: string | null): string {
  const s = String(raw || '').toLowerCase()
  if (!s) return 'Networking'
  if (MUTU_CATEGORIES.map(c => c.toLowerCase()).includes(s)) {
    return MUTU_CATEGORIES.find(c => c.toLowerCase() === s)!
  }
  if (/career|job|recruit/.test(s)) return 'Career'
  if (/network|mixer|meet/.test(s)) return 'Networking'
  if (/health|well|yoga|run|fitness/.test(s)) return 'Wellness'
  if (/sport|game|match/.test(s)) return 'Sports'
  if (/startup|founder|pitch|venture/.test(s)) return 'Startup'
  if (/study|class|learn|workshop/.test(s)) return 'Study Group'
  if (/party|social|drinks|dinner/.test(s)) return 'Social'
  return 'Other'
}

// Map a Luma event object → the columns of public.events. Luma's shape nests
// the event under `event` in list responses; callers pass the inner object.
export function lumaEventToRow(e: any) {
  return {
    source: 'luma',
    luma_event_id: e.api_id || e.event_api_id || e.id,
    title: e.name || 'Untitled event',
    description: e.description || e.description_md || '',
    start_at: e.start_at || e.start_at_utc || null,
    location: e.geo_address_json?.full_address || e.location || e.timezone || '',
    category: mapCategory(e.category || e.event_type),
    luma_event_url: e.url ? (e.url.startsWith('http') ? e.url : `https://lu.ma/${e.url}`) : null,
    image_url: e.cover_url || null,
    attendee_count: typeof e.guest_count === 'number' ? e.guest_count : null,
  }
}
