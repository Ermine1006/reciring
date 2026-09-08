import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Flower2, Heart, Leaf, NotebookPen } from 'lucide-react'
import AppScreen from '../AppScreen'
import * as storyApi from '../../lib/stories'
import { newStoryDraft, newStoryReply, storyReplySnapshot, storyDraftSnapshot, storyErrorMessage, STORY_TOPICS,
  STORY_TOPIC_LABELS, STORY_REACTIONS, STORY_REPORT_REASONS, STORY_LIMITS } from '../../data/storiesContent'
import { STORY_EXAMPLES } from '../../data/storyExamples'
import StoryGardenArt from './StoryGardenArt'
import StoryExampleReader from './StoryExampleReader'
import StoryEditor from './StoryEditor'
import StoryNotebookCover, { DEFAULT_COVER } from './StoryNotebookCover'
import StoryWarmth from './StoryWarmth'
import StoryReplies from './StoryReplies'
import StoryDialog from './StoryDialog'
import './StoryGarden.css'

const emptyPage = () => ({ items: [], next_cursor: null })
const pageTitle = s => s.title || s.excerpt || 'A little piece of my story'
const privateLabel = s => ({ draft: 'Private draft', withdrawn: 'Back in your notebook', removed: 'Removed by the community team', published: 'In the garden' }[s.status])

export default function StoriesHub({ community, onBack, registerNavigationGuard, api = storyApi }) {
  const [cover, setCover] = useState(DEFAULT_COVER)
  const [coverSnapshot, setCoverSnapshot] = useState(JSON.stringify(DEFAULT_COVER))
  const [coverReady, setCoverReady] = useState(false)
  const [coverError, setCoverError] = useState('')
  const [screen, setScreen] = useState('garden')
  const coverDirty = screen === 'notebook' && JSON.stringify(cover) !== coverSnapshot
  const coverDirtyRef = useRef(false)
  coverDirtyRef.current = coverDirty
  const [access, setAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [topic, setTopic] = useState('')
  const [cursors, setCursors] = useState([null])
  const [page, setPage] = useState(emptyPage)
  const [gardenSource, setGardenSource] = useState('auto')
  const [exampleId, setExampleId] = useState(null)
  const [notebookView, setNotebookView] = useState('mine')
  const [readerId, setReaderId] = useState(null)
  const [story, setStory] = useState(null)
  const [replies, setReplies] = useState(emptyPage)
  const [reports, setReports] = useState([])
  const [draft, setDraft] = useState(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [savedLabel, setSavedLabel] = useState('')
  const [replyDraft, setReplyDraft] = useState(newStoryReply)
  const [replyOriginal, setReplyOriginal] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [report, setReport] = useState(null)
  const root = useRef(null)
  const heading = useRef(null)
  const lastFocused = useRef('')
  const alive = useRef(true)
  const operation = useRef(false)
  const readingEpoch = useRef(0)
  const editing = screen === 'write' || screen === 'review'
  const replyDirty = screen === 'read' && storyReplySnapshot(replyDraft) !== replyOriginal
  const dirty = (editing && draft && storyDraftSnapshot(draft) !== savedSnapshot) || replyDirty || coverDirty
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const refresh = useCallback(() => setReload(n => n + 1), [])
  // Only a successfully loaded, empty first page suggests examples. Loading
  // and access failures remain visible instead of being filled with fixtures.
  const showingExamples = gardenSource === 'examples' ||
    (gardenSource === 'auto' && cursors.length === 1 && page.items.length === 0 && !page.next_cursor)
  const examplesInCorner = STORY_EXAMPLES.filter(s => !topic || s.topic === topic)
  const gardenPages = showingExamples ? examplesInCorner : page.items
  const example = STORY_EXAMPLES.find(s => s.id === exampleId)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; readingEpoch.current++ }
  }, [])

  // Revalidate on each screen and on return to the app. Never display a cached
  // reader, bookmark list, or moderation queue while access is uncertain.
  // An editor keeps its unsaved text in memory even when the network fails.
  useEffect(() => {
    const epoch = ++readingEpoch.current
    let cancelled = false
    const current = () => !cancelled && alive.current && epoch === readingEpoch.current
    setLoading(true); setAccess(null); setError('')
    if (screen !== 'moderate') setReports([])
    async function load() {
      try {
        const permission = await api.fetchStoryAccess(community.id)
        if (!current()) return
        if (permission.error) throw permission.error
        if (permission.data?.schema_version !== 1) throw { code: 'PGRST202' }
        setAccess(permission.data)
        if (screen === 'garden' || screen === 'notebook') {
          const result = await api.fetchStories({ communityId: community.id,
            view: screen === 'garden' ? 'garden' : notebookView,
            topic: screen === 'garden' ? topic || null : null, cursor: cursors[cursors.length - 1],
            limit: screen === 'garden' ? 4 : 12 })
          if (!current()) return
          if (result.error) throw result.error
          setPage(result.data)
          if (screen === 'notebook' && !coverDirtyRef.current) {
            setCoverReady(false)
            const settings = await api.fetchStoryNotebook(community.id)
            if (!current()) return
            if (settings.error) {
              setCoverError('Your cover settings could not be loaded. Your pages are still available.')
            } else {
              setCover(settings.data); setCoverSnapshot(JSON.stringify(settings.data))
              setCoverReady(true); setCoverError('')
            }
          }
        } else if (screen === 'read') {
          const result = await api.fetchStory(readerId)
          if (!current()) return
          if (result.error) throw result.error
          const replyResult = await api.fetchStoryReplies(readerId)
          if (!current()) return
          if (replyResult.error) throw replyResult.error
          setStory(result.data); setReplies(replyResult.data)
        } else if (screen === 'moderate') {
          const result = await api.fetchStoryReports(community.id)
          if (!current()) return
          if (result.error) throw result.error
          setReports(result.data)
        }
      } catch (e) {
        if (current()) {
          setError(storyErrorMessage(e)); setAccess(null)
          setStory(null); setReplies(emptyPage()); setPage(emptyPage()); setReports([])
        }
      } finally { if (current()) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [api, community.id, screen, readerId, topic, cursors, notebookView, reload])

  useEffect(() => {
    // Authored text lives above the reader, so access checks can hide a stale
    // page without discarding a reply the reader is still writing.
    const returnToApp = () => { if (!document.hidden && !operation.current) refresh() }
    window.addEventListener('focus', returnToApp)
    document.addEventListener('visibilitychange', returnToApp)
    return () => { window.removeEventListener('focus', returnToApp); document.removeEventListener('visibilitychange', returnToApp) }
  }, [refresh])

  const requestLeave = useCallback(action => {
    if (operation.current) return
    const leave = () => { setReplyDraft(newStoryReply()); setReplyOriginal(''); action() }
    if (!dirtyRef.current) { leave(); return }
    setConfirm({ type: 'leave', action: leave })
  }, [])

  useEffect(() => registerNavigationGuard?.(requestLeave), [registerNavigationGuard, requestLeave])

  useEffect(() => {
    const unload = e => {
      if (dirtyRef.current || operation.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', unload)
    return () => window.removeEventListener('beforeunload', unload)
  }, [])

  const focusKey = `${screen}:${readerId}:${exampleId}:${topic}:${notebookView}:${cursors[cursors.length - 1]?.id || ''}`
  useEffect(() => {
    if (loading || lastFocused.current === focusKey) return
    lastFocused.current = focusKey
    const scroller = root.current?.closest('.phone-scroll')
    if (scroller) scroller.scrollTop = 0
    const target = heading.current || root.current
    target?.focus({ preventScroll: true })
  }, [focusKey, loading])

  const perform = async (task, success) => {
    if (operation.current) return false
    operation.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = await task()
      if (!alive.current) return false
      if (result.error) throw result.error
      await success?.(result.data)
      return true
    } catch (e) {
      if (alive.current) {
        setError(e.code === 'CLIENT_INPUT' ? e.message : storyErrorMessage(e))
        // Keep authored text for recovery; stop rendering other people's words
        // after an access denial. Rechecking is an explicit, safe next step.
        if (e.code === '42501' && !String(e.message).includes('STORY_REPLIES_CLOSED')) {
          setAccess(null); setPage(emptyPage()); setReports([])
          setStory(null); setReplies(emptyPage())
        }
      }
      return false
    } finally { operation.current = false; if (alive.current) setBusy(false) }
  }

  const navigate = next => requestLeave(() => {
    setConfirm(null); setReport(null); setNotice(''); setError(''); setCursors([null]); setScreen(next)
  })
  const garden = () => navigate('garden')
  const openStory = id => requestLeave(() => { setReaderId(id); setScreen('read'); setNotice(''); setReport(null) })
  const openExample = id => requestLeave(() => { setExampleId(id); setScreen('example'); setNotice(''); setReport(null) })
  const chooseGardenSource = source => { setGardenSource(source); setCursors([null]) }
  const startWriting = source => requestLeave(() => {
    const next = source || newStoryDraft()
    setDraft(next); setSavedSnapshot(storyDraftSnapshot(next)); setSavedLabel(next.version ? 'Saved in your private notebook.' : '')
    setNotice(''); setScreen('write')
  })
  const saveCover = () => perform(() => api.saveStoryNotebook(community.id, cover), data => {
    setCover(data); setCoverSnapshot(JSON.stringify(data)); setCoverError('')
    setNotice('Your private cover is saved.')
  })
  const saveDraft = () => perform(() => api.saveStory({ communityId: community.id, draft }), data => {
    setDraft(data); setSavedSnapshot(storyDraftSnapshot(data)); setSavedLabel('Saved in your private notebook.')
    setNotice('Your private draft is saved.')
  })
  const publish = pledge => perform(() => api.saveStory({ communityId: community.id, draft, publish: true, pledge }), data => {
    setDraft(data); setSavedSnapshot(storyDraftSnapshot(data)); setReaderId(data.id)
    setGardenSource('community'); setScreen('finished'); setSavedLabel('')
  })
  const takeBack = () => setConfirm({ title: 'Take your page back?', text: 'It will leave the garden and stay in your private notebook. Readers will no longer see the page or its replies.', label: 'Take back to my notebook', action: () => perform(() => api.withdrawStory(story), data => {
    setConfirm(null); setDraft(data); setSavedSnapshot(storyDraftSnapshot(data)); setSavedLabel('Saved in your private notebook.'); setScreen('write')
  }) })
  const toggleBookmark = () => perform(() => api.setStoryBookmark(story.id, !story.bookmarked), data => {
    setStory(s => ({ ...s, bookmarked: data.bookmarked })); setNotice(data.bookmarked ? 'Kept in your private notebook.' : 'Removed from your saved pages.')
  })
  const react = kind => {
    const selected = story.my_reactions.includes(kind)
    return perform(() => api.setStoryReaction(story.id, kind, !selected), () => {
      setStory(s => ({ ...s, my_reactions: selected ? s.my_reactions.filter(k => k !== kind) : [...s.my_reactions, kind] }))
      setNotice(selected ? 'Your response has been taken back.' : 'A little warmth, left in the margins.')
    })
  }
  const hideWriter = replyId => setConfirm({ title: 'Make a little space?', text: 'You and this writer will no longer see each other’s pages and replies in the garden. Their identity stays private. You can clear your hidden writers from My notebook.', label: 'Hide this writer', action: () => perform(() => api.muteStoryWriter(story.id, replyId), () => {
    setConfirm(null); setReplyDraft(newStoryReply()); setReplyOriginal(''); setScreen('garden'); setCursors([null]); setNotice('This writer is hidden from your garden.')
  }) })
  const beginReport = replyId => setReport({ replyId, reason: 'privacy', details: '' })

  const renderReader = () => story && <section className="g-page">
    <button type="button" className="g-back" onClick={garden}>← Back to the garden</button>
    <div className="g-paper">
      <div className="g-eyebrow">{STORY_TOPIC_LABELS[story.topic]}</div>
      <h1 ref={heading} tabIndex={-1}>{story.title || 'A little piece of my story'}</h1>
      <p className="g-small">{story.author_name}{story.is_mine ? ' · Your page' : ''}</p>
      {story.status && story.status !== 'published' && <p className="g-notice">{privateLabel(story)}</p>}
      <div className="g-body">{story.body}</div>
      <div className="g-margin-note">
        <p>{story.response_mode === 'sharing' ? 'Just sharing. A little warmth is welcome.' : 'Open to conversation. Read with curiosity.'}</p>
        {!story.is_mine && <div className="g-reactions">{STORY_REACTIONS.map((r, i) => <button type="button" key={r.id} disabled={busy}
          aria-pressed={story.my_reactions.includes(r.id)} onClick={() => react(r.id)}>
          {i ? <Heart aria-hidden="true" /> : <Flower2 aria-hidden="true" />}{r.label}</button>)}</div>}
        <StoryWarmth key={story.id} story={story} />
        {(!story.is_mine || story.status === 'published') && <button type="button" className="g-link g-bookmark" disabled={busy}
          aria-pressed={story.bookmarked} onClick={toggleBookmark}><Bookmark size={16} aria-hidden="true" />{story.bookmarked ? 'Kept in my notebook' : 'Keep this page'}</button>}
      </div>
      <div className="g-botanical"><Leaf aria-hidden="true" /></div>
    </div>
    {story.is_mine ? <div className="g-line">
      {story.status !== 'removed' && <button type="button" className="g-outline" disabled={busy} onClick={() => startWriting(story)}>Edit my page</button>}
      {story.status === 'published' && <button type="button" className="g-link" disabled={busy} onClick={() => requestLeave(takeBack)}>Take my page back</button>}
    </div> : <details><summary>Care for this space</summary><div className="g-line">
      <button type="button" className="g-link" disabled={busy} onClick={() => beginReport(null)}>Report page</button>
      <button type="button" className="g-link" disabled={busy} onClick={() => requestLeave(() => hideWriter(null))}>Hide this writer</button>
    </div></details>}
    {!story.is_mine && <aside className="g-reading-invitation"><p>There’s a version of this only you can tell.</p>
      <button type="button" className="g-link" onClick={() => startWriting()}>Begin my own page</button></aside>}
    <StoryReplies key={story.id} story={story} replies={replies.items} cursor={replies.next_cursor} busy={busy}
      draft={replyDraft} setDraft={setReplyDraft} original={replyOriginal} setOriginal={setReplyOriginal}
      onMore={() => perform(() => api.fetchStoryReplies(story.id, replies.next_cursor), data => setReplies(p => ({ ...data, items: [...p.items, ...data.items.filter(r => !p.items.some(old => old.id === r.id))] })))}
      onSave={reply => perform(() => api.saveStoryReply(story.id, reply), data => {
        setReplies(p => ({ ...p, items: p.items.some(r => r.id === data.id) ? p.items.map(r => r.id === data.id ? data : r) : [data, ...p.items] })); setNotice('Your reply is saved.')
      })}
      onDelete={reply => setConfirm({ title: 'Delete your reply?', text: 'Your words will be removed from this page.', label: 'Delete my reply', action: () => perform(() => api.deleteStoryReply(reply), () => { setReplies(p => ({ ...p, items: p.items.filter(r => r.id !== reply.id) })); setConfirm(null); setNotice('Your reply has been deleted.') }) })}
      onReport={beginReport} onMute={id => requestLeave(() => hideWriter(id))} />
  </section>

  return <AppScreen background="#FBFAF6"><div className="mutu-story-garden" ref={root} tabIndex={-1} aria-label="The Story Garden" aria-busy={loading || busy}>
    <div className="g-top"><button type="button" onClick={() => requestLeave(onBack)}>← Together</button>
      <button type="button" className="g-bookmark" onClick={() => navigate('notebook')}><NotebookPen size={16} aria-hidden="true" />My notebook</button></div>
    {error && <div className="g-error-box"><p role="alert" className="g-error">{error}</p>
      {!access && !busy && <button type="button" className="g-link" onClick={refresh}>Check again</button>}</div>}
    <p className="g-status" role="status" aria-live="polite">{notice}</p>
    {editing && draft ? <StoryEditor key={`${draft.id}:${screen}`} draft={draft} stage={screen} onChange={next => { setDraft(next); setSavedLabel('Changes are not saved yet.'); setNotice('') }}
      onSave={saveDraft} onPreview={() => { setError(''); setScreen('review') }} onPublish={publish}
      onBack={screen === 'review' ? () => setScreen('write') : garden} busy={busy}
      canSave={Boolean(access) && !loading} myName={access?.my_name || 'Your name'} communityName={community.name} savedLabel={savedLabel} />
      : loading ? <p className="g-loading" role="status">Opening the garden…</p>
      : access && <>
        {screen === 'garden' && <>
          <header className="g-intro"><div className="g-eyebrow">Together, as we are</div><h1 tabIndex={-1} ref={heading}>The Story Garden</h1>
            <p>A quiet place to be a work in progress.</p><p className="g-small">Your words. Your pace. Typos welcome.</p></header>
          <div className="g-source-switch" role="group" aria-label="Choose pages to read">
            <button type="button" aria-pressed={!showingExamples} onClick={() => chooseGardenSource('community')}>Community pages</button>
            <button type="button" aria-pressed={showingExamples} onClick={() => chooseGardenSource('examples')}>Example pages</button>
          </div>
          <div className="g-filter"><label htmlFor="garden-topic">Wander through</label><select id="garden-topic" value={topic} onChange={e => { setTopic(e.target.value); setCursors([null]) }}>
            <option value="">Every corner</option>{STORY_TOPICS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          {showingExamples && <p className="g-example-intro">Made up writers and stories. A few ways to find your own beginning.</p>}
          <section className={`g-scene${showingExamples ? ' g-scene-examples' : ''}`} aria-label={showingExamples ? 'Fictional example pages' : 'Pages in the garden'}><StoryGardenArt />
            {gardenPages.map(s => <button type="button" key={s.id} className="g-note" onClick={() => showingExamples ? openExample(s.id) : openStory(s.id)} aria-label={`${showingExamples ? 'Open example' : 'Open page'}: ${pageTitle(s)}`}>
              {showingExamples && <span className="g-example-stamp">Fictional example</span>}
              <span className="g-note-topic">{STORY_TOPIC_LABELS[s.topic]}</span><span className="g-note-words">{pageTitle(s)}</span><span className="g-note-open">Unfold page ↗</span></button>)}
            {gardenPages.length ? <div className="g-scene-caption">Nothing here needs to bloom on schedule.</div> : <div className="g-empty-garden"><Leaf size={28} aria-hidden="true" />
              <h2>There is room for your story.</h2><p>{topic ? 'This corner is quiet for now.' : 'A small moment, an unfinished thought, a lesson learned along the way.'}</p></div>}
          </section>
          <div className="g-garden-actions"><div className="g-line">
            {!showingExamples && cursors.length > 1 && <button type="button" className="g-link" onClick={() => setCursors(c => c.slice(0, -1))}>A few steps back</button>}
            {!showingExamples && page.next_cursor && <button type="button" className="g-link" onClick={() => setCursors(c => [...c, page.next_cursor])}>Wander a little further →</button>}</div>
            <button type="button" className="g-primary" onClick={() => startWriting()}>Leave a little of your story</button>
            <p className="g-small">Write a few lines or take a whole page.</p>
            {access.can_moderate && <button type="button" className="g-link" onClick={() => navigate('moderate')}>Community care</button>}
          </div>
        </>}
        {screen === 'notebook' && <section className="g-page"><button type="button" className="g-back" onClick={garden}>← Back to the garden</button>
          <h1 tabIndex={-1} ref={heading}>My notebook</h1><p>A place for your drafts and pages you want to keep.</p>
          <StoryNotebookCover cover={cover} name={access.my_name} onChange={setCover} onSave={saveCover}
            busy={busy} ready={coverReady} dirty={coverDirty} error={coverError} onRetry={refresh} />
          <div className="g-line"><button type="button" className="g-outline" aria-pressed={notebookView === 'mine'} onClick={() => { setNotebookView('mine'); setCursors([null]) }}>My pages</button>
            <button type="button" className="g-outline" aria-pressed={notebookView === 'bookmarks'} onClick={() => { setNotebookView('bookmarks'); setCursors([null]) }}>Kept pages</button></div>
          <p className="g-small">{notebookView === 'mine' ? 'Only pages marked In the garden are shared.' : 'Your saved pages are private. A page may disappear if it is taken back or no longer available to you.'}</p>
          <div className="g-saved-pages">{page.items.map(s => <button type="button" className="g-saved-page" key={s.id}
            onClick={() => s.is_mine && ['draft', 'withdrawn'].includes(s.status) ? startWriting(s) : openStory(s.id)}>
            <small>{notebookView === 'mine' ? privateLabel(s) : STORY_TOPIC_LABELS[s.topic]}</small><span>{pageTitle(s)}</span></button>)}</div>
          {!page.items.length && <p className="g-empty">{notebookView === 'mine' ? 'Your next page can begin anywhere.' : 'A page that stays with you can stay here.'}</p>}
          <div className="g-line">{cursors.length > 1 && <button type="button" className="g-link" onClick={() => setCursors(c => c.slice(0, -1))}>Previous pages</button>}
            {page.next_cursor && <button type="button" className="g-link" onClick={() => setCursors(c => [...c, page.next_cursor])}>More pages</button>}</div>
          <button type="button" className="g-primary" onClick={() => startWriting()}>Begin a page</button>
          <details><summary>Your garden preferences</summary><p className="g-small">Clear the writers you have hidden in the garden. Account blocks set elsewhere stay in place.</p>
            <button type="button" className="g-link" disabled={busy} onClick={() => setConfirm({ title: 'Clear your hidden writers?', text: 'Their available pages and replies can appear in your garden again.', label: 'Clear hidden writers', action: () => perform(api.clearStoryMutes, () => { setConfirm(null); setNotice('Your hidden writers have been cleared.') }) })}>Clear hidden writers</button></details>
        </section>}
        {screen === 'read' && renderReader()}
        {screen === 'example' && example && <StoryExampleReader example={example} headingRef={heading} onBack={garden}
          onWrite={() => startWriting()}
          onNext={examplesInCorner.length > 1 ? () => openExample(examplesInCorner[(examplesInCorner.findIndex(s => s.id === exampleId) + 1) % examplesInCorner.length].id) : undefined} />}
        {screen === 'finished' && <section className="g-finished"><div className="g-envelope" aria-hidden="true" /><div className="g-eyebrow">A page, gently placed</div>
          <h1 tabIndex={-1} ref={heading}>Your words have a place here.</h1>
          <div className="g-author-page"><Leaf size={28} aria-hidden="true" /><h2>{pageTitle(draft)}</h2>
            <p>{draft.identity_mode === 'named' ? (draft.author_name || access.my_name) : 'A community member'}</p>
            <span className="g-small">{draft.identity_mode === 'named' ? 'Shared with your chosen name' : 'Shared anonymously'}</span></div>
          <p>There’s a little more you in the garden now.</p><p>You can come back and change them.<br />Growing is allowed.</p>
          <button type="button" className="g-primary" onClick={garden}>Back to the garden</button><br />
          <button type="button" className="g-link" onClick={() => openStory(readerId)}>Read my page</button></section>}
        {screen === 'moderate' && <section className="g-page"><button type="button" className="g-back" onClick={garden}>← Back to the garden</button>
          <h1 tabIndex={-1} ref={heading}>Community care</h1><p>Reports are private. Read for context before making a decision. An own words concern is not proof of AI use.</p>
          {!reports.length && <p>No open reports right now.</p>}{reports.map(r => <article key={r.id} className="g-report-form">
            <p className="g-eyebrow">{r.reply_id ? 'Reply report' : 'Page report'} · {STORY_REPORT_REASONS.find(x => x.id === r.reason)?.label}</p>
            <h2>{r.title_snapshot || 'Untitled page'}</h2><p className="g-small">Private author details: {r.writer_name} · {r.writer_email}</p>
            <p className="g-body">{r.body_snapshot}</p><p className="g-body">Reporter’s note: {r.details || 'No added note.'}</p>
            <p className="g-small">This is a snapshot from the report. Removal also hides the current version.</p>
            <div className="g-line"><button type="button" className="g-outline" disabled={busy} onClick={() => perform(() => api.reviewStoryReport(r.id, 'dismiss'), refresh)}>Dismiss report</button>
              <button type="button" className="g-link" disabled={busy} onClick={() => setConfirm({ title: 'Remove this content?', text: 'The current page or reply will leave the community. Its author cannot publish it again.', label: 'Remove content', action: () => perform(() => api.reviewStoryReport(r.id, 'remove'), () => { setConfirm(null); refresh() }) })}>Remove content</button></div>
          </article>)}</section>}
      </>}
    {!loading && !access && replyDirty && <section className="g-page">
      <h2>Your unsent words</h2><p>You can copy these while your access is checked again.</p>
      <label htmlFor="reply-recovery">Your own words</label><textarea id="reply-recovery" value={replyDraft.body} maxLength={STORY_LIMITS.reply}
        onChange={e => setReplyDraft(p => ({ ...p, body: e.target.value }))} />
    </section>}
    {confirm && <StoryDialog title={confirm.type === 'leave' ? 'Keep your words safe?' : confirm.title} onClose={() => !busy && setConfirm(null)}>
      <p>{confirm.type === 'leave' ? 'You have changes that are not saved yet.' : confirm.text}</p>
      <div className="g-dialog-actions"><button type="button" className="g-outline" disabled={busy} onClick={() => setConfirm(null)}>{confirm.type === 'leave' ? 'Keep writing' : 'Cancel'}</button>
        {confirm.type === 'leave' && coverDirty && <button type="button" className="g-primary" disabled={busy || !access || !coverReady} onClick={async () => {
          if (await saveCover()) { dirtyRef.current = false; setConfirm(null); confirm.action() }
        }}>Save cover and leave</button>}
        {confirm.type === 'leave' && editing && draft?.status !== 'published' && <button type="button" className="g-primary" disabled={busy || !access} onClick={async () => {
          if (await saveDraft()) { dirtyRef.current = false; setConfirm(null); confirm.action() }
        }}>Save privately and leave</button>}
        <button type="button" className="g-link" disabled={busy} onClick={() => {
          if (confirm.type === 'leave') { setCover(JSON.parse(coverSnapshot)); dirtyRef.current = false; setSavedSnapshot(draft ? storyDraftSnapshot(draft) : ''); setConfirm(null); confirm.action() }
          else confirm.action()
        }}>{busy ? 'Saving…' : confirm.type === 'leave' ? 'Discard changes and leave' : confirm.label}</button>
      </div>
      {busy && <p role="status">Saving your choice…</p>}
      {error && <p className="g-error" role="alert">{error}</p>}
    </StoryDialog>}
    {report && <StoryDialog title="Care for this space" onClose={() => !busy && setReport(null)}><form onSubmit={e => { e.preventDefault(); perform(() => api.reportStory({ storyId: story.id, ...report }), () => { setReport(null); setNotice('Your report is with the community team. Thank you for caring for this space.') }) }}>
      <p>The community team can identify the author to review this report. Reports are private.</p>
      <label htmlFor="report-reason">What concerns you?</label><select id="report-reason" value={report.reason} disabled={busy} onChange={e => setReport(p => ({ ...p, reason: e.target.value }))}>
        {STORY_REPORT_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      <label htmlFor="report-details">A little context, if you want</label><textarea id="report-details" maxLength={STORY_LIMITS.report} value={report.details} disabled={busy} onChange={e => setReport(p => ({ ...p, details: e.target.value }))} />
      <div className="g-line"><button type="button" className="g-outline" disabled={busy} onClick={() => setReport(null)}>Cancel</button><button type="submit" className="g-primary" disabled={busy || !access}>{busy ? 'Sending…' : 'Send private report'}</button></div>
      {error && <p className="g-error" role="alert">{error}</p>}
    </form></StoryDialog>}
  </div></AppScreen>
}
