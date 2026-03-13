import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

const GOLD = '#C8A96A'
const GOLD_DARK = '#A88245'
const GOLD_LIGHT = '#E6D3A3'
const CREAM = '#FFFBF4'

// Small interlocking-rings SVG inline (same concept as ReciRingLogo)
function RingsIcon({ size = 28 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 30 18" fill="none" aria-hidden="true">
      <circle cx="9"  cy="9" r="7.5" stroke={GOLD} strokeWidth="1.8" />
      <circle cx="21" cy="9" r="7.5" stroke={GOLD} strokeWidth="1.8" />
    </svg>
  )
}

export default function Certificate({ points, onClose }) {
  const certRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const [done, setDone] = useState(false)

  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const handleDownload = async () => {
    if (!certRef.current || downloading) return
    setDownloading(true)
    try {
      const dataUrl = await toPng(certRef.current, {
        pixelRatio: 3,
        backgroundColor: CREAM,
      })
      const link = document.createElement('a')
      link.download = 'reciring-community-connector.png'
      link.href = dataUrl
      link.click()
      setDone(true)
    } catch (e) {
      console.error('Certificate export failed', e)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560, width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Certificate card ── */}
        <div
          ref={certRef}
          style={{
            background: CREAM,
            border: `2px solid ${GOLD}`,
            borderRadius: 16,
            padding: '36px 40px',
            boxShadow: `inset 0 0 0 6px ${CREAM}, inset 0 0 0 8px ${GOLD_LIGHT}`,
            fontFamily: 'Georgia, "Times New Roman", serif',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {/* Corner ornaments */}
          {[
            { top: 12, left: 12 },
            { top: 12, right: 12 },
            { bottom: 12, left: 12 },
            { bottom: 12, right: 12 },
          ].map((pos, i) => (
            <div key={i} style={{ position: 'absolute', ...pos, color: GOLD_LIGHT, fontSize: 18, lineHeight: 1 }}>✦</div>
          ))}

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
            <RingsIcon size={30} />
            <span style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 600, color: '#111', letterSpacing: '-0.02em' }}>
              ReciRing
            </span>
          </div>

          {/* Top rule */}
          <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, marginBottom: 20 }} />

          {/* Title */}
          <p style={{ fontSize: 10, fontFamily: 'Georgia, serif', letterSpacing: '0.28em', textTransform: 'uppercase', color: GOLD_DARK, marginBottom: 6 }}>
            Certificate of Achievement
          </p>

          <p style={{ fontSize: 13, color: '#555', marginBottom: 20, lineHeight: 1.6 }}>
            This certifies that a member of the<br />
            <strong style={{ color: '#222' }}>Rotman MBA Community</strong> has earned the rank of
          </p>

          {/* Badge title */}
          <div style={{ margin: '0 auto 20px', padding: '10px 32px', background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})`, borderRadius: 99, display: 'inline-block' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
              Community Connector
            </span>
          </div>

          <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
            with <strong style={{ color: '#111' }}>{points} verified connection points</strong>
          </p>

          {/* Bottom rule */}
          <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, marginBottom: 14 }} />

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 11, color: '#999', letterSpacing: '0.08em' }}>RECIRING</span>
            <span style={{ color: GOLD_LIGHT }}>✦</span>
            <span style={{ fontSize: 11, color: '#999', letterSpacing: '0.08em' }}>ROTMAN MBA</span>
            <span style={{ color: GOLD_LIGHT }}>✦</span>
            <span style={{ fontSize: 11, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{month}</span>
          </div>
        </div>

        {/* ── Actions ── */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            padding: '14px 0',
            borderRadius: 14,
            background: done
              ? '#E8F5EE'
              : `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})`,
            color: done ? '#22AA66' : '#fff',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.06em',
            border: 'none',
            cursor: downloading ? 'wait' : 'pointer',
            boxShadow: done ? 'none' : '0 8px 24px rgba(200,169,106,0.4)',
          }}
        >
          {done ? '✓  Saved — Share on LinkedIn' : downloading ? 'Exporting…' : '⬇  Download for LinkedIn'}
        </button>

        <button
          onClick={onClose}
          style={{
            padding: '10px 0',
            borderRadius: 14,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'rgba(255,255,255,0.8)',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
