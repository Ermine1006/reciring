import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

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
      className="rounded-3xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      style={{ padding: 0, border: '1px solid #E8D9A7', width: 'min(560px, calc(100vw - 24px))', maxWidth: 'none', maxHeight: 'calc(100dvh - 32px)', background: '#FFFCF5', color: '#111', overflow: 'hidden' }}>
      <div className="flex flex-col" style={{ maxHeight: 'calc(100dvh - 34px)' }}>
        <header className="flex items-center justify-between px-5 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #E8D9A7' }}>
          <h2 id="my-post-preview-title" className="text-lg font-semibold">Post preview</h2>
          <button autoFocus type="button" onClick={onClose} aria-label="Close post preview" style={{ minHeight: 44, minWidth: 44, fontSize: 24 }}>×</button>
        </header>
        <div className="px-5 py-5" style={{ overflowY: 'auto', minHeight: 0, overscrollBehavior: 'contain', overflowWrap: 'anywhere' }}>
          <div className="flex flex-wrap gap-2 text-xs mb-5" style={{ color: '#826820' }}>
            <span>{post.category || 'Other'}</span>
            {post.time && <span>· {post.time}</span>}
            {post.urgency && <span>· {post.urgency === 'urgent' ? 'Urgent' : post.urgency === 'soon' ? 'This week' : post.urgency}</span>}
            {post.createdAt && <span style={{ color: '#6B7280' }}>· {post.createdAt}</span>}
          </div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#826820' }}>Looking for</h3>
          <p className="text-base font-semibold leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>{post.needs}</p>
          {Boolean(post.offers?.trim()) && <section className="mt-6 pt-5" style={{ borderTop: '1px solid #E8D9A7' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#66513A' }}>Also happy to help with</h3>
            <p className="text-sm leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>{post.offers}</p>
          </section>}
          {post.tags?.length > 0 && <div className="flex flex-wrap gap-2 mt-5">{post.tags.map((tag, index) => <span key={`${tag}-${index}`} className="rounded-full px-3 py-1 text-xs" style={{ background: '#F2EEE5', color: '#4B5563' }}>{tag}</span>)}</div>}
        </div>
      </div>
    </dialog>, document.body
  )
}
