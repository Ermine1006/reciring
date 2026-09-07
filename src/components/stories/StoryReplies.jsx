import { useState } from 'react'
import { newStoryReply, storyReplySnapshot, STORY_LIMITS, STORY_PLEDGE } from '../../data/storiesContent'

export default function StoryReplies({ story, replies, cursor, onMore, busy, onSave, onDelete, onReport, onMute, draft, setDraft, original, setOriginal }) {
  const [error, setError] = useState('')
  const [pledge, setPledge] = useState(false)
  const snapshot = storyReplySnapshot(draft)
  const reset = () => { setDraft(newStoryReply()); setOriginal(''); setError(''); setPledge(false) }
  const submit = async e => {
    e.preventDefault()
    if (!draft.body.trim()) { setError('Add a few words when you are ready.'); return }
    if (!pledge) { setError('Please confirm that these are your own words.'); return }
    const ok = await onSave({ ...draft, pledge })
    if (ok) reset()
  }
  return (
    <section aria-label="Written replies">
      {replies.length > 0 && <h2>In the margins</h2>}
      {replies.map(r => (
        <div className="g-reply" key={r.id}>
          <p className="g-small">{r.author_name}{r.is_story_author && r.author_name !== 'Story author' ? ' · Story author' : ''}</p>
          <p>{r.body}</p>
          <div className="g-line">
            {r.is_mine ? <>
              {story.response_mode === 'conversation' && <button type="button" className="g-link" disabled={busy || snapshot !== original} onClick={() => { setDraft(r); setOriginal(JSON.stringify([r.body, r.identity_mode])) }}>Edit my reply</button>}
              <button type="button" className="g-link" disabled={busy || snapshot !== original} onClick={() => onDelete(r)}>Delete my reply</button>
            </> : <details><summary>Care for this reply</summary>
              <button type="button" className="g-link" disabled={busy} onClick={() => onReport(r.id)}>Report reply</button>{' '}
              <button type="button" className="g-link" disabled={busy} onClick={() => onMute(r.id)}>Hide this writer</button>
            </details>}
          </div>
        </div>
      ))}
      {cursor && <button type="button" className="g-link" disabled={busy} onClick={onMore}>Read earlier replies</button>}
      {(story.response_mode === 'conversation' || snapshot !== original) && story.status !== 'removed' && (
        <form className="g-reply-form" onSubmit={submit}>
          <h2>{draft.version ? 'Your reply' : 'Leave a few words'}</h2>
          <p className="g-small">Read with curiosity. Ask before giving advice.</p>
          {story.response_mode !== 'conversation' && <p className="g-notice">Written replies are now closed. Your unsent words are here so you can copy them.</p>}
          <label htmlFor="story-reply">Your own words</label>
          <textarea id="story-reply" value={draft.body} maxLength={STORY_LIMITS.reply} disabled={busy} onChange={e => { setDraft({ ...draft, body: e.target.value }); setPledge(false) }} />
          <label htmlFor="reply-identity">Sign your reply</label>
          <select id="reply-identity" value={draft.identity_mode} disabled={busy} onChange={e => { setDraft({ ...draft, identity_mode: e.target.value }); setPledge(false) }}>
            <option value="anonymous">Leave it without my name</option><option value="named">Use my name</option>
          </select>
          {story.is_mine && story.identity_mode === 'anonymous' && <p className="g-small">Your reply is labelled Story author so your anonymous page stays anonymous.</p>}
          <label className="g-check"><input type="checkbox" checked={pledge} disabled={busy} onChange={e => setPledge(e.target.checked)} /><span>{STORY_PLEDGE}</span></label>
          {error && <p className="g-error" role="alert">{error}</p>}
          <div className="g-line"><button type="submit" className="g-outline" disabled={busy || story.response_mode !== 'conversation'}>{busy ? 'Saving…' : draft.version ? 'Save my reply' : 'Leave my reply'}</button>
            {draft.version > 0 && <button type="button" className="g-link" disabled={busy} onClick={reset}>Discard reply edit</button>}</div>
        </form>
      )}
    </section>
  )
}
