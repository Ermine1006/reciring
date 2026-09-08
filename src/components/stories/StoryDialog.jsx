import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Native modal semantics keep keyboard focus inside the decision and restore
// it to the initiating control when the dialog closes.
export default function StoryDialog({ title, children, onClose }) {
  const ref = useRef(null)
  const host = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const el = ref.current
    const prior = document.activeElement
    if (typeof el.showModal === 'function') {
      el.showModal()
      return () => { el.close(); if (prior?.isConnected) prior.focus?.() }
    }
    // The app supports iOS 15.0; WebKit's native dialog starts at 15.4.
    // A portal, focus containment, and restored ARIA state provide a fallback
    // without changing the app's minimum OS version or installing a polyfill.
    host.current.classList.add('g-dialog-fallback')
    el.setAttribute('open', '')
    const siblings = Array.from(document.body.children).filter(n => n !== host.current)
      .map(n => [n, n.getAttribute('aria-hidden')])
    siblings.forEach(([n]) => n.setAttribute('aria-hidden', 'true'))
    const controls = () => Array.from(el.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]'))
    const focusFirst = () => controls()[0]?.focus()
    const contain = e => { if (!el.contains(e.target)) focusFirst() }
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); return }
      if (e.key !== 'Tab') return
      const fields = controls(), first = fields[0], last = fields[fields.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    const outside = e => { if (!el.contains(e.target)) { e.preventDefault(); e.stopPropagation() } }
    document.addEventListener('focusin', contain, true)
    document.addEventListener('keydown', key, true)
    document.addEventListener('click', outside, true)
    focusFirst()
    return () => {
      document.removeEventListener('focusin', contain, true)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('click', outside, true)
      siblings.forEach(([n, value]) => value === null ? n.removeAttribute('aria-hidden') : n.setAttribute('aria-hidden', value))
      if (prior?.isConnected) prior.focus?.()
    }
  }, [])
  return createPortal(<div className="mutu-story-garden g-dialog-host" ref={host}>
    <dialog ref={ref} className="g-dialog" aria-modal="true" aria-labelledby="story-dialog-title"
    onCancel={e => { e.preventDefault(); close.current() }}>
    <h2 id="story-dialog-title">{title}</h2>{children}
  </dialog></div>, document.body)
}
