import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import RequestCard from './RequestCard'

export default function MyPostPreview({ post, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => {
      node.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return createPortal(
    <dialog ref={dialog} aria-labelledby="my-post-preview-title" onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      }}
      className="backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      style={{ padding: 4, border: 'none', width: 'min(420px, calc(100vw - 24px))', maxWidth: 'none', maxHeight: 'calc(100dvh - 24px)', background: 'transparent', overflow: 'visible' }}>
      <h2 id="my-post-preview-title" className="sr-only">Post preview</h2>
      <div className="flex justify-end" style={{ marginBottom: 8 }}>
        <button autoFocus type="button" onClick={onClose} aria-label="Close post preview"
          style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#FFFCF5', border: '1px solid #E8D9A7', color: '#3D3020', cursor: 'pointer' }}>
          <X size={22} />
        </button>
      </div>
      <div style={{ height: 'min(720px, calc(100dvh - 92px))' }}>
        <RequestCard request={post} preview />
      </div>
    </dialog>, document.body
  )
}
