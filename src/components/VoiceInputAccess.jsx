import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import VoiceTyping from './VoiceTyping'
import { isVoiceField, writeVoiceDraft } from '../lib/voiceFields'

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
  const selection = useRef({ start: target.selectionStart, end: target.selectionEnd })
  const live = useRef(null)   // { before, after, caret } while voice typing
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
    const remember = () => { if (!live.current) selection.current = { start: target.selectionStart, end: target.selectionEnd } }
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
    <VoiceTyping inputRef={{ current: target }}
      onActiveChange={on => {
        if (on) {
          const value = target.value
          const from = Math.min(selection.current.start ?? value.length, value.length)
          const to = Math.min(selection.current.end ?? from, value.length)
          live.current = { before: value.slice(0, from), after: value.slice(to), caret: from }
        } else if (live.current) {
          const { caret } = live.current
          live.current = null
          if (target.isConnected) { target.focus(); target.setSelectionRange(caret, caret) }
          selection.current = { start: caret, end: caret }
        }
      }}
      onDraft={text => { if (live.current && target.isConnected) live.current.caret = writeVoiceDraft(target, live.current, text) }} />
  </div>, target.closest('dialog[open]') || document.body)
}
