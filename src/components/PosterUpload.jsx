import { useRef, useState } from 'react'
import { uploadEventPoster } from '../lib/storage'

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  text: '#111111', textSub: '#6B7280', white: '#FFFFFF', border: '#E5E7EB', danger: '#DC2626',
}

/**
 * Event poster picker. Lets the host choose an image from their device; it's
 * compressed and uploaded to Supabase Storage, and the resulting public URL
 * is handed back via onChange. Shows a live preview with Replace / Remove.
 *
 * Props:
 *   value    — current poster URL ('' when none)
 *   onChange — (url: string) => void
 *   userId   — used for the per-user storage path (RLS-scoped)
 */
export default function PosterUpload({ value, onChange, userId }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handlePick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return
    setError(null)
    setBusy(true)
    const { url, error: upErr } = await uploadEventPoster(file, userId)
    setBusy(false)
    if (upErr || !url) {
      setError(upErr?.message || 'Upload failed — try again.')
      return
    }
    onChange(url)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handlePick}
        style={{ display: 'none' }}
      />

      {value ? (
        <div style={{
          borderRadius: 14, overflow: 'hidden', position: 'relative',
          border: `1px solid ${C.goldLight}`, background: C.goldBg,
        }}>
          <img
            src={value}
            alt="Event poster preview"
            style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }}
          />
          <div style={{ display: 'flex', gap: 8, padding: 10, background: C.white }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              style={secondaryBtn(busy)}
            >
              {busy ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); onChange('') }}
              disabled={busy}
              style={{ ...secondaryBtn(busy), color: C.danger, borderColor: '#FECACA' }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            width: '100%', padding: '22px 14px', borderRadius: 14,
            border: `1.5px dashed ${C.goldLight}`, background: C.goldBg,
            color: C.goldDark, fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>🖼️</span>
          {busy ? 'Uploading…' : 'Upload a poster'}
          <span style={{ fontSize: 11, fontWeight: 500, color: C.textSub }}>
            JPG or PNG · shown on the board & shared as your poster
          </span>
        </button>
      )}

      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: C.danger }}>{error}</p>
      )}
    </div>
  )
}

function secondaryBtn(busy) {
  return {
    flex: 1, padding: '9px', borderRadius: 10,
    background: '#FFFFFF', border: '1.5px solid #E5E7EB',
    color: '#111111', fontSize: 13, fontWeight: 600,
    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
    fontFamily: 'Inter, system-ui, sans-serif',
  }
}
