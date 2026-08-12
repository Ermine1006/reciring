import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { rewriteText } from '../lib/aiRewrite'
import { matchaCta } from '../lib/matchaCta'

const C = {
  gold: '#C9A33B', goldDark: '#A6822A', goldLight: '#E8D9A7', goldBg: '#F8F3E5',
  ink: '#1A1712', textSub: '#6B6152', white: '#FFFFFF', border: '#E5E7EB',
  green: '#2E6B4F', greenBg: '#EDF3EE', greenBorder: '#CBDBCF', danger: '#DC2626',
}

const URGENCY_CHIPS = ['This week', 'This month', 'No rush']
const DESC_MAX = 600

/**
 * Bottom-sheet composer for one marketplace post (a "need" or an "offer").
 * Used for both create and edit. Type is fixed once chosen (a user has at most
 * one need + one offer per event).
 */
export default function MarketplacePostComposer({ open, mode = 'create', type = 'need', initial = null, busy = false, error = null, allowPromotion = false, onSubmit, onClose }) {
  // Unified with Discover: a short title (headline) + a description, plus the
  // same "Increase My Response Rate" AI on the description.
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [urgency, setUrgency] = useState('')
  const [promoteToDiscover, setPromoteToDiscover] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '')
      setDescription(initial?.description || '')
      setTagsText((initial?.tags || []).join(', '))
      setUrgency(initial?.urgency || '')
      setPromoteToDiscover(Boolean(initial?.promote_to_discover))
      setImproving(false); setUndo(null)
    }
  }, [open, initial])

  const need = type === 'need'
  const accent = need ? C.goldDark : C.green

  // ── "Increase My Response Rate" — same AI rewrite as Join / Discover ──
  // Rewrites the description (expanding the title if the description is empty).
  const [improving, setImproving] = useState(false)
  const [undo, setUndo] = useState(null) // { prev }

  const improve = async () => {
    const source = (description.trim() || title.trim())
    if (!source || improving || busy) return
    setImproving(true)
    const { text: out, error: err } = await rewriteText({
      kind: need ? 'event_need' : 'event_offer',
      text: source,
      maxChars: DESC_MAX,
      context: { title: title.trim() },
    })
    setImproving(false)
    if (err || !out) return
    setUndo({ prev: description })
    setDescription(out)
  }

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  if (!open) return null

  const submit = () => {
    if (!title.trim() || busy) return
    const tags = tagsText.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8)
    // Only allow opting in when the host enabled promotion for this event.
    onSubmit?.({ type, title: title.trim(), description: description.trim(), tags, urgency, promoteToDiscover: allowPromotion && promoteToDiscover })
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: 'rgba(17,17,17,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: '#F9F7F4',
          borderRadius: '24px 24px 0 0',
          padding: '10px 22px calc(20px + env(safe-area-inset-bottom))',
          maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#D1D5DB' }} />
        </div>

        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {need ? 'Looking for' : 'Offering'}
        </p>
        <h2 style={{ margin: '4px 0 16px', fontSize: 20, fontWeight: 700, color: C.ink, fontFamily: 'Fraunces, Georgia, serif' }}>
          {mode === 'edit' ? 'Edit your post' : need ? 'What are you looking for?' : 'What can you offer?'}
        </h2>

        <label style={labelStyle}>{need ? 'Looking for' : 'Offering'} <span style={{ color: C.danger }}>*</span></label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, 120))}
          placeholder={need ? 'e.g. Technical co-founder' : 'e.g. VC interview coaching'}
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, DESC_MAX))}
          placeholder={need
            ? 'Building an AI networking platform, looking for a full-stack engineer interested in startups.'
            : 'Happy to review resumes or run mock interviews for VC recruiting.'}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 92 }}
        />

        {/* Same AI helper as Join / Discover */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 26, marginTop: 8 }}>
          <button
            type="button"
            onClick={improve}
            disabled={(!description.trim() && !title.trim()) || improving || busy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 2px', background: 'transparent', border: 'none',
              cursor: ((description.trim() || title.trim()) && !improving && !busy) ? 'pointer' : 'default',
              color: ((description.trim() || title.trim()) && !improving && !busy) ? C.goldDark : '#B8B0A2',
              fontSize: 12, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            {improving ? (
              <>
                <span className="inline-block animate-spin" style={{ width: 11, height: 11, border: `1.5px solid ${C.goldLight}`, borderTopColor: C.goldDark, borderRadius: '50%' }} />
                Improving…
              </>
            ) : (<>✨ Increase My Response Rate</>)}
          </button>
          {undo && (
            <span style={{ fontSize: 11, color: C.textSub, fontFamily: 'Inter, system-ui, sans-serif' }}>
              ✓ Clearer now ·{' '}
              <button type="button" onClick={() => { setText(undo.prev); setUndo(null) }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.goldDark, fontWeight: 700, fontSize: 11 }}>
                Undo
              </button>
            </span>
          )}
        </div>

        <label style={{ ...labelStyle, marginTop: 14 }}>Skills / tags <span style={{ color: C.textSub, fontWeight: 400 }}>· optional, comma-separated</span></label>
        <input
          value={tagsText}
          onChange={e => setTagsText(e.target.value)}
          placeholder="e.g. Python, fundraising, healthcare"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>Urgency <span style={{ color: C.textSub, fontWeight: 400 }}>· optional</span></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {URGENCY_CHIPS.map(u => {
            const on = urgency === u
            return (
              <button key={u} type="button" onClick={() => setUrgency(on ? '' : u)}
                style={{
                  padding: '8px 14px', borderRadius: 999,
                  border: `1.5px solid ${on ? accent : C.border}`,
                  background: on ? (need ? C.goldBg : C.greenBg) : C.white,
                  color: on ? accent : C.textSub, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                {u}
              </button>
            )
          })}
        </div>

        {/* Author consent to show this post on the home page (Discover).
            Always visible so posters see the option; disabled (with a hint)
            until the event host turns on home-page promotion. Default OFF. */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, cursor: allowPromotion ? 'pointer' : 'default', opacity: allowPromotion ? 1 : 0.55 }}>
          <input
            type="checkbox"
            checked={allowPromotion && promoteToDiscover}
            disabled={!allowPromotion}
            onChange={e => setPromoteToDiscover(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, accentColor: C.goldDark, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            <b>Show this post on the home page</b>
            <br />
            <span style={{ fontSize: 12, color: C.textSub }}>
              {allowPromotion
                ? "Your post appears as an anonymous preview on Mutu's home page (Discover) to bring more people to this event. Your name stays hidden until someone joins and you connect. Off by default."
                : "The event host hasn't turned on home-page promotion for this event yet. Once they do, you can show this post on the home page."}
            </span>
          </span>
        </label>

        {error && (
          <div style={{ marginTop: 14, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.danger }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || busy}
          style={{
            width: '100%', marginTop: 18, padding: '15px', borderRadius: 14, border: 'none',
            fontSize: 15, fontWeight: 700, cursor: !title.trim() || busy ? 'default' : 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
            ...(!title.trim() || busy
              ? { background: '#E5E1D8', color: '#9B9384' }
              : matchaCta),
          }}
        >
          {busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Post to marketplace'}
        </button>

        <button type="button" onClick={onClose}
          style={{ width: '100%', marginTop: 8, padding: '12px', borderRadius: 14, background: 'transparent', border: 'none', color: C.textSub, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Cancel
        </button>
      </div>
    </div>,
    document.body
  )
}

const labelStyle = {
  display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4B4437',
  margin: '0 0 6px', fontFamily: 'Inter, system-ui, sans-serif',
}
const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: `1.5px solid ${C.border}`, background: C.white,
  fontSize: 14.5, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif',
  outline: 'none', boxSizing: 'border-box',
}
