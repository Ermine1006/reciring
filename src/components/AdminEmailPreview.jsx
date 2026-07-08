import { useMemo, useState } from 'react'
import { renderBlocksEmail } from '../lib/emailBlocks'

const C = {
  gold:     '#C8A96A',
  goldDark: '#A88245',
  goldBg:   '#FBF6EC',
  text:     '#111111',
  textSub:  '#6B7280',
  textMuted:'#9CA3AF',
  border:   '#E5E7EB',
}

// Live preview of the compiled email. The iframe uses `srcDoc` so the
// document is fully sandboxed from the parent — no cookies, no window
// access, no way for a paste of raw HTML in a paragraph field to reach
// out. Two viewport sizes toggle to catch responsive issues before
// send: mobile ~ Gmail app on iPhone, desktop ~ Gmail web.
const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', width: 620 },
  { id: 'mobile',  label: 'Mobile',  width: 380 },
]

export default function AdminEmailPreview({ subject, eyebrow, blocks }) {
  const [viewport, setViewport] = useState('desktop')

  // Renderer runs on every keystroke — cheap because it's just string
  // concat + escape. Memoize on the raw inputs so React doesn't
  // reconcile a fresh <iframe srcDoc> when nothing changed.
  const html = useMemo(
    () => renderBlocksEmail({
      subject,
      eyebrow,
      blocks,
      appUrl:         'https://muturing.com',
      unsubscribeUrl: 'https://muturing.com/api/unsubscribe?token=preview',
    }),
    [subject, eyebrow, blocks]
  )

  const vp = VIEWPORTS.find(v => v.id === viewport) || VIEWPORTS[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Viewport toggle */}
      <div style={{ display: 'flex', gap: 4 }}>
        {VIEWPORTS.map(v => {
          const active = viewport === v.id
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewport(v.id)}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                background: active
                  ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                  : '#FAFAFA',
                border: `1px solid ${active ? C.gold : C.border}`,
                color: active ? '#fff' : C.textSub,
                fontSize: 11, fontWeight: 600,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {v.label}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 10, color: C.textMuted, alignSelf: 'center',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>
          {vp.width}px
        </span>
      </div>

      {/* Subject preview strip — email clients show this above the body */}
      <div style={{
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        background: '#FAFAFA',
        fontSize: 12,
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: C.textMuted, flexShrink: 0,
        }}>
          Subject
        </span>
        <span style={{
          color: subject ? C.text : C.textMuted,
          fontStyle: subject ? 'normal' : 'italic',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {subject || '(subject empty)'}
        </span>
      </div>

      {/* Iframe frame — subtle gradient border to feel like a device */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: 8,
        borderRadius: 14,
        background: '#EEE9E0',
        border: `1px solid ${C.border}`,
      }}>
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox=""
          style={{
            width: vp.width,
            maxWidth: '100%',
            height: 620,
            border: 'none',
            borderRadius: 8,
            background: '#FFFFFF',
            display: 'block',
          }}
        />
      </div>

      <p style={{
        fontSize: 10, color: C.textMuted, margin: 0,
        fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center',
      }}>
        Preview runs the same renderer used server-side. What you see is what recipients get.
      </p>
    </div>
  )
}
