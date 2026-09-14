import { useState } from 'react'
import SubmitRequest from './SubmitRequest'
import MyPostsPage from './MyPostsPage'
import { matchaCta } from '../lib/matchaCta'

const HINT_KEY = 'mutu:new-post-hint-dismissed:v1'

export default function GiveAskHub({ view, onViewChange, children, myPosts, onCreatePost, onEditPost, onDeletePost, isSupabaseConfigured, prefill }) {
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem(HINT_KEY) !== '1' } catch { return true }
  })
  const [justPosted, setJustPosted] = useState(false)
  const dismissHint = () => {
    setShowHint(false)
    try { localStorage.setItem(HINT_KEY, '1') } catch { /* Storage is optional. */ }
  }
  const navigate = (next) => {
    setJustPosted(false)
    if (next === 'create') dismissHint()
    onViewChange(next)
  }
  const submit = async (fields) => {
    const result = await onCreatePost(fields)
    if (result?.error) return result
    setJustPosted(true)
    onViewChange('manage')
    return {}
  }

  return (
    <section className="flex-1 flex flex-col min-h-0" aria-label="Give & Ask">
      <div className="flex-shrink-0 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[24px] font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#111' }}>Give &amp; Ask</h1>
          {view !== 'create' && (
            <button data-mutu-glass="" type="button" onClick={() => navigate('create')}
              className="flex items-center gap-1 rounded-2xl px-3 text-sm font-semibold whitespace-nowrap"
              style={{ ...matchaCta, minHeight: 44 }}>
              <span aria-hidden="true" className="text-xl">+</span> New post
            </button>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: '#6B7280' }}>Ask for help. Offer what you can.</p>
        {showHint && view === 'browse' && (
          <div className="flex items-center justify-end gap-2 mt-2 text-xs" style={{ color: '#826820' }}>
            <span>Post a request or offer here ↑</span>
            <button type="button" onClick={dismissHint} aria-label="Dismiss posting tip" style={{ minWidth: 44, minHeight: 44 }}>×</button>
          </div>
        )}
        {view === 'create' ? (
          <button type="button" onClick={() => navigate('browse')} className="text-sm mt-2" style={{ minHeight: 44, color: '#68764A' }}>← Back to browsing</button>
        ) : (
          <div className="flex gap-1 p-1 rounded-xl mt-3" aria-label="Post views" style={{ background: '#F2EEE5', border: '1px solid #E5E7EB' }}>
            {[['browse', 'Browse'], ['manage', 'My posts']].map(([id, label]) => (
              <button data-mutu-glass="" key={id} type="button" aria-pressed={view === id} onClick={() => navigate(id)}
                className="flex-1 rounded-lg text-sm font-semibold" style={{ minHeight: 44, ...(view === id ? matchaCta : { background: 'transparent', color: '#6B7280' }) }}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {justPosted && view === 'manage' && <p role="status" className="px-5 py-2 text-sm" style={{ color: '#68764A' }}>Your post is published. You can edit it below.</p>}
      {view === 'browse' && children}
      {view === 'create' && <div className="flex-1 phone-scroll min-h-0"><SubmitRequest key={prefill?.sourceIds?.join(',') || 'blank'} onSubmitted={submit} prefill={prefill} /></div>}
      {view === 'manage' && <MyPostsPage posts={myPosts} onEditPost={onEditPost} onDeletePost={onDeletePost} onClose={() => navigate('browse')} onCreatePost={() => navigate('create')} embedded isSupabaseConfigured={isSupabaseConfigured} />}
    </section>
  )
}
