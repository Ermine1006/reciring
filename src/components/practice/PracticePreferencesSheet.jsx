import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function PracticePreferencesSheet({ open, busy, onClose, children }) {
  const ref = useRef(null)
  const title = useId()
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = ref.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [open])
  if (!open) return null
  return createPortal(<dialog ref={ref} className="practice-ui practice-preferences-sheet" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header><div><h2 id={title}>My practice</h2><p>Focus, strengths and experience</p></div>
      <button type="button" disabled={busy} onClick={onClose} aria-label="Close preferences">✕</button>
    </header>
    <div className="practice-preferences-scroll">{children}</div>
  </dialog>, document.body)
}
