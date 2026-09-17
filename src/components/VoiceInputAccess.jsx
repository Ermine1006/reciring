import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import VoiceTyping from './VoiceTyping'
import { isVoiceField, insertVoiceText } from '../lib/voiceFields'

// One focus-aware entry point covers native text inputs, shared UI fields,
// lazy-loaded pages and modal portals without altering their form layout.
export default function VoiceInputAccess() {
  const [target, setTarget] = useState(null)
  useEffect(() => {
    const focus = event => {
      if (event.target.closest?.('[data-voice-ui]')) return
      setTarget(isVoiceField(event.target) ? event.target : null)
    }
    const outside = event => {
      if (event.target.closest?.('[data-voice-ui]')) return
      if (!isVoiceField(event.target)) setTarget(null)
    }
    document.addEventListener('focusin', focus)
    document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('focusin', focus); document.removeEventListener('pointerdown', outside) }
  }, [])
  return target ? <FieldVoice key={targetKey(target)} target={target} onDismiss={() => setTarget(null)} /> : null
}
const keys = new WeakMap()
let key = 0
function targetKey(target) {
  if (!keys.has(target)) keys.set(target, ++key)
  return keys.get(target)
}

function FieldVoice({ target, onDismiss }) {
  const [position, setPosition] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [active, setActive] = useState(false)
  const selection = useRef({ start: target.selectionStart, end: target.selectionEnd })
  const baseline = useRef(target.value)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    const update = () => {
      const rect = target.getBoundingClientRect()
      const viewport = window.visualViewport
      const top = viewport?.offsetTop || 0, left = viewport?.offsetLeft || 0
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight
      if (!target.isConnected || !isVoiceField(target) || !rect.width || !rect.height || rect.bottom < top || rect.top > top + height) {
        dismiss.current(); return
      }
      setPosition({ top: Math.max(top + 8, rect.top - 46), left: Math.max(left + 8, Math.min(rect.right - 44, left + width - 52)),
        panelTop: Math.max(top + 8, Math.min(rect.top - 360, top + height - 370)),
        panelLeft: Math.max(left + 8, Math.min(rect.right - 320, left + width - 328)), panelHeight: height - 24 })
    }
    const remember = () => { selection.current = { start: target.selectionStart, end: target.selectionEnd }; baseline.current = target.value }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'readonly', 'hidden', 'class', 'open'] })
    target.addEventListener('select', remember)
    target.addEventListener('input', remember)
    target.addEventListener('keyup', remember)
    target.addEventListener('pointerup', remember)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      target.removeEventListener('select', remember); target.removeEventListener('input', remember)
      target.removeEventListener('keyup', remember); target.removeEventListener('pointerup', remember)
      window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [target])
  if (!position) return null
  return createPortal(<div data-voice-ui="" style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 2147483647 }}>
    <VoiceTyping inputRef={{ current: target }} onActiveChange={setActive}
      onTranscript={text => setDraft(previous => previous + (previous ? ' ' : '') + text)}
      panelStyle={{ position: 'fixed', top: position.panelTop, left: position.panelLeft, bottom: 'auto', width: 'min(320px, calc(100vw - 24px))', maxHeight: position.panelHeight, overflowY: 'auto', boxSizing: 'border-box' }}>
      {draft && <div style={{ margin: '12px 0' }}>
        <label style={{ display: 'block', fontSize: 13 }}>Review your words
          <textarea aria-label="Voice draft" value={draft} onChange={e => { setDraft(e.target.value); setError('') }} rows={3}
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 8, fontSize: 16, borderRadius: 8, border: '1px solid #CBDBCF' }} />
        </label>
        {error && <p role="alert" style={{ fontSize: 12, color: '#B42318' }}>{error}</p>}
        <button type="button" disabled={active || !draft.trim()} onClick={() => {
          if (target.value !== baseline.current) { setError('The field changed. Close and try again to use its latest text.'); return }
          const issue = insertVoiceText(target, draft, selection.current)
          if (issue) setError(issue)
          else { setDraft(''); dismiss.current() }
        }} style={{ minHeight: 44, padding: '8px 12px', borderRadius: 12, background: '#49603B', color: '#fff', border: 0, marginTop: 8 }}>Insert text</button>
      </div>}
    </VoiceTyping>
  </div>, target.closest('dialog[open]') || document.body)
}
