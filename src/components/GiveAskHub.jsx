import { useState } from 'react'
import SubmitRequest from './SubmitRequest'
import MyPostsPage from './MyPostsPage'
import { matchaCta } from '../lib/matchaCta'

export default function GiveAskHub({ view, onViewChange, children, myPosts, onCreatePost, onEditPost, onDeletePost, isSupabaseConfigured, prefill }) {
  const [justPosted, setJustPosted] = useState(false)
  const navigate = (next) => {
    setJustPosted(false)
    onViewChange(next)
  }
  const submit = async (fields) => {
    const result = await onCreatePost(fields)
    if (result?.error) return result
    setJustPosted(true)
    onViewChange('manage')
    return {}
  }

  const actions = (
    <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
      {view === 'browse' && <button type="button" onClick={() => navigate('manage')} className="text-xs font-semibold whitespace-nowrap" style={{ minHeight: 44, padding: '0 8px', color: '#68764A' }}>My posts</button>}
      {view !== 'create' && <button data-mutu-glass="" type="button" onClick={() => navigate('create')} title="Publish a post" className="rounded-xl px-3 text-xs font-semibold whitespace-nowrap" style={{ ...matchaCta, minHeight: 44 }}><span aria-hidden="true">+ </span>New post</button>}
    </div>
  )
  return (
    <section className="flex-1 flex flex-col min-h-0" aria-label="Give & Ask">
      {view !== 'browse' && <div className="flex items-center gap-2 px-4 py-1 flex-shrink-0">
        <button type="button" onClick={() => navigate('browse')} className="text-xs" style={{ minHeight: 44, color: '#68764A' }}>← Back to posts</button>
        {view === 'manage' && <h1 className="text-sm font-semibold">My posts</h1>}
        {actions}
      </div>}
      {justPosted && view === 'manage' && <p role="status" className="px-5 py-2 text-sm" style={{ color: '#68764A' }}>Your post is published. You can edit it below.</p>}
      {view === 'browse' && children(actions)}
      {view === 'create' && <div className="flex-1 phone-scroll min-h-0"><SubmitRequest key={prefill?.sourceIds?.join(',') || 'blank'} onSubmitted={submit} prefill={prefill} /></div>}
      {view === 'manage' && <MyPostsPage posts={myPosts} onEditPost={onEditPost} onDeletePost={onDeletePost} onClose={() => navigate('browse')} onCreatePost={() => navigate('create')} embedded isSupabaseConfigured={isSupabaseConfigured} />}
    </section>
  )
}
