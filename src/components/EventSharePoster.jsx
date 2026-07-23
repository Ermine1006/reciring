import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toPng } from 'html-to-image'
import { categoryEmoji } from '../data/eventCategories'
import { WEB_ORIGIN } from '../lib/platform'
import ReciRingLogo from './ReciRingLogo'

const C = {
  gold: '#C8A96A', goldDark: '#A88245', goldLight: '#E6D3A3',
  cream: '#FBF6EC', ink: '#1A1712', textSub: '#6B6152', white: '#FFFFFF',
}

function posterDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

/**
 * Bottom-sheet that turns an event into a shareable image and hands it to the
 * OS share sheet. Sharing an IMAGE (not a link) is deliberate: on iOS, picking
 * Instagram from the share sheet lets the user post the poster to their Story,
 * which a link can't do. Falls back to downloading the PNG, and offers a
 * plain copy-link for text-based channels.
 *
 * The poster itself is rendered off-screen at 1080x1920 (Story aspect) and
 * rasterised with html-to-image, the same toPng path the Certificate uses.
 */
export default function EventSharePoster({ event, open, onClose }) {
  const posterRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  if (!open || !event) return null

  const link = `${WEB_ORIGIN}/?event=${event.id}`

  async function buildPng() {
    // 2x of the 540x960 DOM poster → 1080x1920, Instagram Story native size.
    return toPng(posterRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: C.cream })
  }

  async function dataUrlToFile(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob()
    return new File([blob], `mutu-${event.id}.png`, { type: 'image/png' })
  }

  async function handleShareImage() {
    if (busy) return
    setBusy(true); setToast(null)
    try {
      const dataUrl = await buildPng()
      const file = await dataUrlToFile(dataUrl)
      // Web Share Level 2 (files) — supported in the iOS WKWebview and mobile
      // Safari. canShare gates it so we don't call a share that will throw.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: event.title,
          text: `${event.title} — join me on Mutu\n${link}`,
        })
      } else {
        // Desktop / unsupported: download the poster so it can be posted manually.
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `mutu-${event.id}.png`
        a.click()
        setToast('Poster saved — post it to your story')
      }
    } catch (e) {
      // AbortError = user closed the sheet; anything else is a real failure.
      if (e?.name !== 'AbortError') setToast('Could not create the poster')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopyLink() {
    try { await navigator.clipboard.writeText(link); setToast('Link copied') }
    catch { setToast(link) }
  }

  const emoji = categoryEmoji(event.category)

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      {/* Off-screen poster that gets rasterised. Kept in the DOM (not display:
          none) so html-to-image can measure it; parked far off-screen. */}
      <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }}>
        <div
          ref={posterRef}
          style={{
            width: 540, height: 960,
            background: `linear-gradient(160deg, ${C.cream} 0%, #F3E7CE 100%)`,
            padding: '56px 44px',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'Inter, system-ui, sans-serif',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ReciRingLogo size={34} />
          </div>

          <div style={{ marginTop: 54, fontSize: 96, lineHeight: 1 }}>{emoji}</div>

          <p style={{
            marginTop: 22, fontSize: 15, fontWeight: 700, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: C.goldDark,
          }}>
            {event.category || 'Event'}
          </p>

          <h1 style={{
            margin: '10px 0 0', fontSize: 46, lineHeight: 1.12, fontWeight: 800,
            color: C.ink, fontFamily: 'Fraunces, Georgia, serif',
          }}>
            {event.title}
          </h1>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Row label="WHEN" value={posterDate(event.start_at)} />
            {event.location && <Row label="WHERE" value={event.location} />}
            {event.host_display_name && <Row label="HOST" value={event.host_display_name} />}
          </div>

          <div style={{
            marginTop: 30, paddingTop: 22, borderTop: `1.5px solid ${C.goldLight}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>Join me on Mutu</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.goldDark }}>reciring.com</span>
          </div>
        </div>
      </div>

      {/* The actual sheet the user sees */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, background: C.white,
          borderRadius: '24px 24px 0 0', padding: '10px 24px calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 14px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>

        <h2 style={{
          textAlign: 'center', fontSize: 19, fontWeight: 700, color: C.ink,
          fontFamily: 'Fraunces, Georgia, serif', margin: '0 0 6px',
        }}>
          Share this event
        </h2>
        <p style={{ textAlign: 'center', fontSize: 13, color: C.textSub, margin: '0 0 20px', lineHeight: 1.5 }}>
          Share the poster to your Instagram story, or send the link to a friend.
        </p>

        <button
          type="button"
          onClick={handleShareImage}
          disabled={busy}
          className="active:scale-[0.98]"
          style={{
            width: '100%', padding: '15px', borderRadius: 14, border: 'none',
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
            color: C.white, fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1, fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}
        >
          {busy ? 'Creating poster…' : '📸  Share event poster'}
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          className="active:scale-[0.98]"
          style={{
            width: '100%', marginTop: 10, padding: '14px', borderRadius: 14,
            background: C.white, border: '1.5px solid #E5E7EB',
            color: C.ink, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          🔗  Copy link
        </button>

        {toast && (
          <p style={{ textAlign: 'center', fontSize: 12, color: C.goldDark, margin: '12px 0 0' }}>
            {toast}
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}

function Row({ label, value }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: C.goldDark }}>
        {label}
      </p>
      <p style={{ margin: '3px 0 0', fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>
        {value}
      </p>
    </div>
  )
}
