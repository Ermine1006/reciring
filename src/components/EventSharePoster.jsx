import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { toPng } from 'html-to-image'
import QRCode from 'qrcode'
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
  const [qrUrl, setQrUrl] = useState(null)

  // Generate a QR of the event deep link so people can scan to join. New
  // users land on the signup page; existing users open the event directly.
  useEffect(() => {
    if (!open || !event?.id) { setQrUrl(null); return }
    let alive = true
    QRCode.toDataURL(`${WEB_ORIGIN}/?event=${event.id}`, {
      margin: 1, width: 300, errorCorrectionLevel: 'M',
      color: { dark: '#1A1712', light: '#FFFFFF' },
    })
      .then(u => { if (alive) setQrUrl(u) })
      .catch(() => { if (alive) setQrUrl(null) })
    return () => { alive = false }
  }, [open, event?.id])

  if (!open || !event) return null

  const link = `${WEB_ORIGIN}/?event=${event.id}`
  const hasImage = Boolean(event.image_url)

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
        {hasImage ? (
          // Uploaded poster as the hero, with a dark scrim so the Mutu info
          // bar stays legible over any image.
          <div
            ref={posterRef}
            style={{
              width: 540, height: 960, position: 'relative', overflow: 'hidden',
              fontFamily: 'Inter, system-ui, sans-serif', background: C.ink,
            }}
          >
            <img
              src={event.image_url}
              alt=""
              crossOrigin="anonymous"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Legibility scrim: light at top, heavy at the bottom. */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 66%, rgba(0,0,0,0.88) 100%)',
            }} />

            <div style={{
              position: 'absolute', inset: 0, padding: '48px 44px',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ReciRingLogo size={34} />
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{
                  margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '0.22em',
                  textTransform: 'uppercase', color: C.goldLight,
                }}>
                  {event.category || 'Event'}
                </p>
                <h1 style={{
                  margin: 0, fontSize: 46, lineHeight: 1.12, fontWeight: 800,
                  color: C.white, fontFamily: 'Fraunces, Georgia, serif',
                }}>
                  {event.title}
                </h1>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
                  <Row label="WHEN" value={posterDate(event.start_at)} valueColor={C.white} />
                  {event.location && <Row label="WHERE" value={event.location} valueColor={C.white} />}
                  {event.host_display_name && <Row label="HOST" value={event.host_display_name} valueColor={C.white} />}
                </div>

                <div style={{
                  marginTop: 20, paddingTop: 20, borderTop: '1.5px solid rgba(255,255,255,0.25)',
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.white, lineHeight: 1.2 }}>Scan to join</p>
                    <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600, color: C.goldLight }}>Join me on Mutu · reciring.com</p>
                  </div>
                  {qrUrl && <img src={qrUrl} alt="" width={112} height={112} style={{ display: 'block', borderRadius: 12, background: '#fff', padding: 7 }} />}
                </div>
              </div>
            </div>
          </div>
        ) : (
          // No uploaded image → branded emoji poster (original design).
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
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink, lineHeight: 1.2 }}>Scan to join</p>
                <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600, color: C.goldDark }}>Join me on Mutu · reciring.com</p>
              </div>
              {qrUrl && <img src={qrUrl} alt="" width={112} height={112} style={{ display: 'block', borderRadius: 12, border: `1.5px solid ${C.goldLight}` }} />}
            </div>
          </div>
        )}
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
        <p style={{ textAlign: 'center', fontSize: 13, color: C.textSub, margin: '0 0 18px', lineHeight: 1.5 }}>
          Share the poster, send the link, or let people scan the code to join.
        </p>

        {/* Live QR — hold up your phone so anyone can scan to join in person. */}
        {qrUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: '0 0 20px' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 12, border: `1.5px solid ${C.goldLight}`, boxShadow: '0 6px 18px -8px rgba(200,169,106,0.4)' }}>
              <img src={qrUrl} alt="QR code to join the event" width={168} height={168} style={{ display: 'block' }} />
            </div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>Scan to join · new members sign up first</p>
          </div>
        )}

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

function Row({ label, value, labelColor = C.goldDark, valueColor = C.ink }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: labelColor }}>
        {label}
      </p>
      <p style={{ margin: '3px 0 0', fontSize: 21, fontWeight: 600, color: valueColor, lineHeight: 1.25 }}>
        {value}
      </p>
    </div>
  )
}
