import { Leaf } from 'lucide-react'
import { STORY_TOPICS, STORY_LIMITS, STORY_PROMPTS, STORY_PLEDGE } from '../../data/storiesContent'
import { useState } from 'react'

export default function StoryEditor({ draft, onChange, stage, onPreview, onSave, onPublish, onBack, busy, canSave, myName, communityName, savedLabel }) {
  const [prompt, setPrompt] = useState('You can begin in the middle. Your words don’t need to be perfect.')
  const [pledge, setPledge] = useState(false)
  const update = (key, value) => { setPledge(false); onChange({ ...draft, [key]: value }) }
  return (
    <section className="g-page">
      <button type="button" className="g-back" disabled={busy} onClick={onBack}>← {stage === 'review' ? 'Keep writing' : 'Back to the garden'}</button>
      {stage === 'write' ? (
        <>
          <div className="g-line">
            <div className="g-eyebrow">Your writing corner</div>
            {draft.status !== 'published' && <button type="button" className="g-link" disabled={busy || !canSave} onClick={onSave}>{busy ? 'Saving…' : 'Save for later'}</button>}
          </div>
          <form onSubmit={e => { e.preventDefault(); onPreview() }}>
            <div className="g-paper">
              <label htmlFor="story-title">A title, if you like</label>
              <input id="story-title" className="g-title-input" type="text" value={draft.title} onChange={e => update('title', e.target.value)}
                maxLength={STORY_LIMITS.title} placeholder="A little piece of my story…" disabled={busy} />
              <details><summary>A starting point, if you want one</summary>
                <div className="g-prompts">{STORY_PROMPTS.map(p => <button key={p} type="button" onClick={() => setPrompt(p)}>{p}</button>)}</div>
              </details>
              <label htmlFor="story-body">Your page</label>
              <textarea id="story-body" value={draft.body} onChange={e => update('body', e.target.value)}
                maxLength={STORY_LIMITS.body} placeholder={prompt} disabled={busy} />
              <div className="g-botanical"><Leaf aria-hidden="true" /></div>
            </div>
            <label htmlFor="story-topic">Where would you like to leave it?</label>
            <select id="story-topic" value={draft.topic} disabled={busy} onChange={e => update('topic', e.target.value)}>
              {STORY_TOPICS.map(t => <option value={t.id} key={t.id}>{t.label}</option>)}
            </select>
            <p className="g-small">A few lines or a longer story. Both belong here.</p>
            <div className="g-line"><span className="g-small">{draft.status === 'published' ? 'Your shared page changes only when you publish an update.' : savedLabel || 'Nothing is shared yet.'}</span>
              <button type="submit" className="g-primary" disabled={busy}>Fold &amp; preview my page</button></div>
          </form>
        </>
      ) : (
        <>
          <div className="g-eyebrow">Before you leave your page</div><h2>Make yourself comfortable.</h2>
          <div className="g-paper">{draft.title && <h2>{draft.title}</h2>}
            <p className="g-small">{draft.identity_mode === 'named' ? myName : 'A community member'}</p><div className="g-body">{draft.body}</div>
          </div>
          <form onSubmit={e => { e.preventDefault(); onPublish(pledge) }}>
            <div className="g-two">
              <div><label htmlFor="story-identity">Sign your page</label><select id="story-identity" value={draft.identity_mode} disabled={busy} onChange={e => update('identity_mode', e.target.value)}>
                <option value="anonymous">Leave it without my name</option><option value="named">Use my name</option></select></div>
              <div><label htmlFor="story-response">What would feel helpful?</label><select id="story-response" value={draft.response_mode} disabled={busy} onChange={e => update('response_mode', e.target.value)}>
                <option value="sharing">Just sharing</option><option value="conversation">Open to conversation</option></select></div>
            </div>
            <p className="g-small">{draft.identity_mode === 'anonymous' ? 'Your name and profile will not appear on this page.' : 'Your name will appear on this page. This does not open your full profile.'}</p>
            <p className="g-small">{draft.response_mode === 'sharing' ? 'Readers can leave a little warmth. Written replies are off. Existing replies stay visible.' : 'Written replies are welcome. Readers are asked to listen with curiosity and ask before giving advice.'}</p>
            <label className="g-check"><input type="checkbox" checked={pledge} disabled={busy} onChange={e => setPledge(e.target.checked)} /><span>{STORY_PLEDGE}</span></label>
            <p className="g-small">Typos are welcome. Basic spellcheck and verbatim voice input are okay.</p>
            <details><summary>Who can read my page?</summary><p className="g-small">
              Only approved members of {communityName} can read published pages. The team can identify an author when reviewing a report.
              Details in your story may also identify you. Please protect other people’s privacy and any confidential work information.
            </p></details>
            <p className="g-notice">Shared with the {communityName} community.</p>
            <button type="submit" className="g-primary" disabled={busy || !canSave}>{busy ? 'Sharing…' : draft.status === 'published' ? 'Update my shared page' : 'Place in the garden'}</button>
          </form>
        </>
      )}
    </section>
  )
}
