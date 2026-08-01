import { supabase, isSupabaseConfigured } from './supabase'

const BUCKET = 'event-posters'

// Downscale + re-encode a chosen image before upload so posters shot on a
// phone (often 3–8 MB) become a lean ~200–500 KB JPEG. Keeps aspect ratio,
// caps the long edge at MAX_EDGE. Returns a Blob (image/jpeg).
const MAX_EDGE = 1440
const JPEG_QUALITY = 0.85

async function compressImage(file) {
  // Not an image (shouldn't happen — input is accept="image/*") → send as-is.
  if (!file.type?.startsWith('image/')) return file

  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })

  const img = await new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = dataUrl
  })

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY)
  )
  // Fall back to the original file if the canvas couldn't encode.
  return blob || file
}

/**
 * Upload an event poster and return its public URL.
 * Path: event-posters/<uid>/<timestamp>-<rand>.jpg — the per-user folder
 * matches the storage RLS policy in migration-event-posters-storage.sql.
 *
 * Returns { url, error }. url is null on failure.
 */
export async function uploadEventPoster(file, userId) {
  if (!isSupabaseConfigured) return { url: null, error: new Error('Supabase not configured') }
  if (!file)   return { url: null, error: new Error('No file selected') }
  if (!userId) return { url: null, error: new Error('Not signed in') }

  let blob
  try {
    blob = await compressImage(file)
  } catch {
    blob = file // if anything in the resize path throws, upload the original
  }

  // A stable-ish unique name without Date.now() collisions mattering much;
  // performance.now + a random suffix keeps two quick uploads distinct.
  const rand = Math.random().toString(36).slice(2, 8)
  const stamp = Math.floor(performance.now())
  const path = `${userId}/${stamp}-${rand}.jpg`

  const { error: upErr } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })

  if (upErr) return { url: null, error: upErr }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data?.publicUrl || null, error: null }
}
