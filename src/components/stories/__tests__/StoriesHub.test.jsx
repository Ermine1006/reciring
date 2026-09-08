// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import StoriesHub from '../StoriesHub'
import StoryDialog from '../StoryDialog'
import useGuardedTab from '../../../lib/useGuardedTab'
import { STORY_PLEDGE, STORY_TOPICS } from '../../../data/storiesContent'
import { STORY_EXAMPLES, STORY_EXAMPLE_WRITERS } from '../../../data/storyExamples'

const community = { id: 'community-test', name: 'Rotman' }
const page = {
  id: 'page-test', title: 'The question I was afraid to ask', body: 'I asked it anyway.\n  This is my real spacing.',
  excerpt: 'I asked it anyway.', topic: 'mba', identity_mode: 'anonymous', response_mode: 'sharing',
  author_name: 'A community member', is_mine: false, bookmarked: false, my_reactions: [],
}
const ok = data => ({ data, error: null })
const error = (message = 'Connection failed', code = 'NETWORK') => ({ data: null, error: { message, code } })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function NavigationHarness({ api, onDismiss }) {
  const [tab, setTab, registerNavigationGuard] = useGuardedTab('practice')
  return <><button onClick={() => setTab('profile')}>Profile tab</button><button onClick={onDismiss}>Dismiss notification</button>
    {tab === 'practice' ? <StoriesHub api={api} community={community} onBack={() => {}} registerNavigationGuard={registerNavigationGuard} /> : <h1>Profile</h1>}</>
}
function mockApi(items = []) {
  return {
    fetchStoryNotebook: vi.fn().mockResolvedValue(ok({ color: 'matcha', stamp: 'leaf', pen_name: '', version: 0 })),
    saveStoryNotebook: vi.fn((id, cover) => Promise.resolve(ok({ ...cover, version: cover.version + 1 }))),
    fetchStoryAccess: vi.fn().mockResolvedValue(ok({ schema_version: 1, can_moderate: false, my_name: 'My name' })),
    fetchStories: vi.fn().mockResolvedValue(ok({ items, next_cursor: null })),
    fetchStory: vi.fn().mockResolvedValue(ok(page)),
    fetchStoryReplies: vi.fn().mockResolvedValue(ok({ items: [], next_cursor: null })),
    saveStory: vi.fn(({ draft, publish = false }) => Promise.resolve(ok({ ...draft, version: (draft.version || 0) + 1, status: publish ? 'published' : 'draft' }))),
    setStoryBookmark: vi.fn().mockResolvedValue(ok({ bookmarked: true })),
    setStoryReaction: vi.fn().mockResolvedValue(ok({ selected: true })),
    saveStoryReply: vi.fn().mockResolvedValue(error('STORY_REPLIES_CLOSED', '42501')),
    reportStory: vi.fn().mockResolvedValue(ok({ submitted: true })),
    muteStoryWriter: vi.fn().mockResolvedValue(ok({ muted: true })),
    clearStoryMutes: vi.fn().mockResolvedValue(ok({ cleared: true })),
  }
}
beforeAll(() => {
  // jsdom has no top-layer layout; emulate the modal DOM state for interaction
  // tests. These assertions do not claim to verify native focus or appearance.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)
async function openGarden(api = mockApi(), props = {}) {
  const result = render(<StoriesHub api={api} community={community} onBack={vi.fn()} {...props} />)
  await screen.findByRole('heading', { name: 'The Story Garden' })
  return { ...result, api }
}
async function write(api = mockApi()) {
  const result = await openGarden(api)
  fireEvent.click(screen.getByRole('button', { name: 'Leave a little of your story' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save for later' }).disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Your page'), { target: { value: '  My imperfect words.\nStill learning.  ' } })
  return result
}
async function openReader(api = mockApi([page])) {
  const result = await openGarden(api)
  fireEvent.click(screen.getByRole('button', { name: `Open page: ${page.title}` }))
  await screen.findByRole('heading', { name: page.title })
  return result
}

describe('Real garden states and privacy', () => {
  it('labels the four examples and lets readers choose the actual empty community', async () => {
    const { container } = await openGarden()
    expect(container.querySelectorAll('.g-note')).toHaveLength(4)
    expect(screen.getAllByText('Fictional example')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Example pages' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Community care' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Community pages' }))
    await screen.findByText('There is room for your story.')
    expect(container.querySelectorAll('.g-note')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Community pages' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('fails closed when the migration is unavailable', async () => {
    const api = mockApi([page])
    api.fetchStoryAccess.mockResolvedValue(error('RPC missing', 'PGRST202'))
    render(<StoriesHub community={community} api={api} onBack={vi.fn()} />)
    await screen.findByText('The Story Garden is not ready yet. Please check back soon.')
    expect(api.fetchStories).not.toHaveBeenCalled()
    expect(screen.queryByText(page.title)).toBeNull()
    expect(screen.queryByText('Fictional example')).toBeNull()
  })
  it('renders story text literally and only shows a bookmark after server confirmation', async () => {
    const api = mockApi([page])
    api.fetchStory.mockResolvedValue(ok({ ...page, body: '<img src=x onerror=alert(1)>\n  My spacing.' }))
    const { container } = await openReader(api)
    expect(container.querySelector('.g-body').textContent).toBe('<img src=x onerror=alert(1)>\n  My spacing.')
    expect(container.querySelector('.g-body img')).toBeNull()
    const pending = deferred()
    api.setStoryBookmark.mockReturnValue(pending.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Keep this page' }))
    expect(screen.getByRole('button', { name: 'Keep this page' }).getAttribute('aria-pressed')).toBe('false')
    await act(async () => { pending.resolve(ok({ bookmarked: true })) })
    expect(screen.getByRole('button', { name: 'Kept in my notebook' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('does not mark a failed reaction as successful', async () => {
    const api = mockApi([page])
    api.setStoryReaction.mockResolvedValue(error())
    await openReader(api)
    fireEvent.click(screen.getByRole('button', { name: 'This stayed with me' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'This stayed with me' }).getAttribute('aria-pressed')).toBe('false')
  })
  it('refreshes and hides a reader after community access is revoked', async () => {
    const { api } = await openReader()
    api.fetchStoryAccess.mockResolvedValue(error('STORY_ACCESS', '42501'))
    fireEvent.focus(window)
    await screen.findByRole('alert')
    expect(screen.queryByText(page.body)).toBeNull()
    expect(screen.queryByRole('heading', { name: page.title })).toBeNull()
  })
})

describe('Fictional examples and member writing stay separate', () => {
  it('opens one fictional writer per corner without calling real story or mutation APIs', async () => {
    const { api, container } = await openGarden()
    for (const topic of STORY_TOPICS) {
      fireEvent.change(screen.getByLabelText('Wander through'), { target: { value: topic.id } })
      const examples = STORY_EXAMPLES.filter(s => s.topic === topic.id)
      expect(examples).toHaveLength(1)
      const example = examples[0]
      fireEvent.click(await screen.findByRole('button', { name: `Open example: ${example.title}` }))
      await screen.findByRole('heading', { name: example.title })
      expect(screen.getByText(STORY_EXAMPLE_WRITERS[example.writer].name)).toBeTruthy()
      expect(screen.getByText('Fictional example')).toBeTruthy()
      expect(container.querySelector('.g-body').textContent).toBe(example.body)
      for (const name of ['Keep this page', 'This stayed with me', 'Report page', 'Hide this writer', 'Edit my page']) {
        expect(screen.queryByRole('button', { name })).toBeNull()
      }
      fireEvent.click(screen.getByRole('button', { name: /Back to the garden/ }))
      await screen.findByRole('heading', { name: 'The Story Garden' })
    }
    for (const method of ['fetchStory', 'fetchStoryReplies', 'saveStory', 'saveStoryReply', 'setStoryBookmark', 'setStoryReaction', 'reportStory', 'muteStoryWriter']) {
      expect(api[method]).not.toHaveBeenCalled()
    }
  })
  it('keeps real pages first, retains community pagination, and never puts examples in a notebook', async () => {
    const api = mockApi([page])
    api.fetchStories.mockImplementation(({ view }) => Promise.resolve(ok(view === 'garden'
      ? { items: [page], next_cursor: { id: 'next-page' } }
      : { items: [], next_cursor: null })))
    const { container } = await openGarden(api)
    expect(screen.getByRole('button', { name: `Open page: ${page.title}` })).toBeTruthy()
    expect(screen.queryByText('Fictional example')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Example pages' }))
    await screen.findByRole('region', { name: 'Fictional example pages' })
    expect(container.querySelectorAll('.g-note')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /Wander a little further/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Community pages' }))
    await screen.findByRole('button', { name: `Open page: ${page.title}` })
    expect(screen.getByRole('button', { name: /Wander a little further/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'My notebook' }))
    await screen.findByRole('heading', { name: 'My notebook' })
    expect(container.querySelectorAll('.g-saved-page')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Kept pages' }))
    await screen.findByText('A page that stays with you can stay here.')
    expect(container.querySelectorAll('.g-saved-page')).toHaveLength(0)
    expect(screen.queryByText('Fictional example')).toBeNull()
  })
  it('starts an empty draft from an example and shows community pages after a real publish', async () => {
    const { api } = await openGarden()
    fireEvent.click(screen.getByRole('button', { name: `Open example: ${STORY_EXAMPLES[0].title}` }))
    await screen.findByRole('heading', { name: STORY_EXAMPLES[0].title })
    fireEvent.click(screen.getByRole('button', { name: 'Another example →' }))
    expect(screen.getByRole('heading', { name: STORY_EXAMPLES[1].title })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Begin my own page' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save for later' }).disabled).toBe(false))
    expect(screen.getByLabelText('Your page').value).toBe('')
    fireEvent.change(screen.getByLabelText('Your page'), { target: { value: 'My own words.\n  My own beginning.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fold & preview my page' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Place in the garden' }).disabled).toBe(false))
    expect(screen.getByLabelText(STORY_PLEDGE).checked).toBe(false)
    fireEvent.click(screen.getByLabelText(STORY_PLEDGE))
    fireEvent.click(screen.getByRole('button', { name: 'Place in the garden' }))
    await screen.findByRole('heading', { name: 'Your words have a place here.' })
    const published = { ...api.saveStory.mock.calls[0][0].draft, status: 'published', is_mine: true }
    expect(published.body).toBe('My own words.\n  My own beginning.')
    expect(published.id.startsWith('example-')).toBe(false)
    api.fetchStories.mockResolvedValue(ok({ items: [published], next_cursor: null }))
    fireEvent.click(screen.getByRole('button', { name: /Back to the garden/ }))
    await screen.findByRole('heading', { name: 'The Story Garden' })
    expect(screen.getByRole('button', { name: 'Community pages' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Fictional example')).toBeNull()
  })
  it('does not turn a failed community read into a demo or retain examples after access is lost', async () => {
    const api = mockApi()
    api.fetchStories.mockResolvedValueOnce(error())
    render(<StoriesHub api={api} community={community} onBack={vi.fn()} />)
    await screen.findByRole('alert')
    expect(screen.queryByText('Fictional example')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    fireEvent.click(await screen.findByRole('button', { name: `Open example: ${STORY_EXAMPLES[0].title}` }))
    await screen.findByRole('heading', { name: STORY_EXAMPLES[0].title })
    api.fetchStoryAccess.mockResolvedValue(error('STORY_ACCESS', '42501'))
    fireEvent.focus(window)
    await screen.findByRole('alert')
    expect(screen.queryByRole('heading', { name: STORY_EXAMPLES[0].title })).toBeNull()
  })
})

describe('Own words and draft recovery', () => {
  it('defaults to anonymous sharing and requires an unchecked pledge without rewriting text', async () => {
    const { api } = await write()
    fireEvent.click(screen.getByRole('button', { name: 'Fold & preview my page' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Place in the garden' }).disabled).toBe(false))
    expect(screen.getByLabelText('Sign your page').value).toBe('anonymous')
    expect(screen.getByLabelText('What would feel helpful?').value).toBe('sharing')
    expect(screen.getByLabelText(STORY_PLEDGE).checked).toBe(false)
    fireEvent.click(screen.getByLabelText(STORY_PLEDGE))
    fireEvent.change(screen.getByLabelText('Sign your page'), { target: { value: 'named' } })
    expect(screen.getByLabelText(STORY_PLEDGE).checked).toBe(false)
    fireEvent.click(screen.getByLabelText(STORY_PLEDGE))
    fireEvent.click(screen.getByRole('button', { name: 'Place in the garden' }))
    await screen.findByRole('heading', { name: 'Your words have a place here.' })
    expect(api.saveStory.mock.calls[0][0]).toMatchObject({ publish: true, pledge: true,
      draft: { body: '  My imperfect words.\nStill learning.  ', identity_mode: 'named', response_mode: 'sharing' } })
  })
  it('keeps exact draft text on network failure and never claims it was saved', async () => {
    const api = mockApi()
    api.saveStory.mockResolvedValue(error())
    await write(api)
    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Your page').value).toBe('  My imperfect words.\nStill learning.  ')
    expect(screen.queryByText('Your private draft is saved.')).toBeNull()
    expect(localStorage.length).toBe(0)
  })
  it('protects navigation and leaves only after a private save succeeds', async () => {
    const api = mockApi()
    const pending = deferred()
    api.saveStory.mockReturnValue(pending.promise)
    await write(api)
    fireEvent.click(screen.getByRole('button', { name: /Back to the garden/ }))
    const dialog = screen.getByRole('dialog', { name: 'Keep your words safe?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save privately and leave' }))
    expect(screen.getByLabelText('Your page').value).toContain('My imperfect words.')
    const saved = api.saveStory.mock.calls[0][0].draft
    await act(async () => { pending.resolve(ok({ ...saved, version: 1, status: 'draft' })) })
    await screen.findByRole('heading', { name: 'The Story Garden' })
    expect(api.saveStory.mock.calls[0][0].publish).toBeUndefined()
  })
  it('guards real app navigation, with no interruption when dismissing a notification', async () => {
    const api = mockApi()
    const dismiss = vi.fn()
    render(<NavigationHarness api={api} onDismiss={dismiss} />)
    await screen.findByRole('heading', { name: 'The Story Garden' })
    fireEvent.click(screen.getByRole('button', { name: 'Leave a little of your story' }))
    fireEvent.change(screen.getByLabelText('Your page'), { target: { value: 'Unsent.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Profile tab' }))
    expect(screen.queryByRole('heading', { name: 'Profile' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes and leave' }))
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy()
  })
  it('keeps unsaved writing available when a focus check loses access', async () => {
    const { api } = await write()
    api.fetchStoryAccess.mockResolvedValue(error('STORY_ACCESS', '42501'))
    fireEvent.focus(window)
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Your page').value).toContain('My imperfect words.')
    expect(screen.getByRole('button', { name: 'Save for later' }).disabled).toBe(true)
    api.fetchStoryAccess.mockResolvedValue(ok({ schema_version: 1, my_name: 'Me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save for later' }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Back to the garden/ }))
    expect(screen.getByRole('dialog', { name: 'Keep your words safe?' })).toBeTruthy()
  })
  it('does not apply a previous account’s delayed read after remount', async () => {
    const api = mockApi([page])
    const pending = deferred()
    api.fetchStories.mockReturnValue(pending.promise)
    const result = render(<StoriesHub key="first-account" community={community} api={api} onBack={vi.fn()} />)
    await waitFor(() => expect(api.fetchStories).toHaveBeenCalled())
    const second = mockApi([])
    result.rerender(<StoriesHub key="second-account" community={community} api={second} onBack={vi.fn()} />)
    await screen.findByRole('heading', { name: 'The Story Garden' })
    await act(async () => { pending.resolve(ok({ items: [page], next_cursor: null })) })
    expect(screen.queryByText(page.title)).toBeNull()
  })
})

describe('Replies and care controls', () => {
  it('keeps a usable, focus-contained confirmation when native dialog is unavailable', () => {
    const native = HTMLDialogElement.prototype.showModal
    HTMLDialogElement.prototype.showModal = undefined
    const close = vi.fn()
    try {
      const { unmount } = render(<StoryDialog title="Keep your words safe?" onClose={close}>
        <button>Keep writing</button><button>Discard changes</button>
      </StoryDialog>)
      const first = screen.getByRole('button', { name: 'Keep writing' })
      const last = screen.getByRole('button', { name: 'Discard changes' })
      expect(document.activeElement).toBe(first)
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last)
      fireEvent.keyDown(document, { key: 'Tab' })
      expect(document.activeElement).toBe(first)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(close).toHaveBeenCalledOnce()
      unmount()
      expect(document.body.querySelector('[aria-hidden="true"]')).toBeNull()
    } finally { HTMLDialogElement.prototype.showModal = native }
  })
  it('keeps written replies off for Just sharing', async () => {
    await openReader()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Just sharing. A little warmth is welcome.')).toBeTruthy()
  })
  it('retains unsent replies after server closure and access loss', async () => {
    const api = mockApi([page])
    api.fetchStory.mockResolvedValue(ok({ ...page, response_mode: 'conversation' }))
    await openReader(api)
    fireEvent.change(screen.getByLabelText('Your own words'), { target: { value: 'My unfinished reply.' } })
    fireEvent.click(screen.getByLabelText(STORY_PLEDGE))
    fireEvent.click(screen.getByRole('button', { name: 'Leave my reply' }))
    await screen.findByText('The author has closed written replies. Your words are still here.')
    expect(screen.getByLabelText('Your own words').value).toBe('My unfinished reply.')
    api.fetchStoryAccess.mockResolvedValue(error('STORY_ACCESS', '42501'))
    fireEvent.focus(window)
    await screen.findByRole('heading', { name: 'Your unsent words' })
    expect(screen.getByLabelText('Your own words').value).toBe('My unfinished reply.')
    expect(screen.queryByRole('heading', { name: page.title })).toBeNull()
  })
  it('reports by story ID and confirms hiding without receiving an author ID', async () => {
    const { api } = await openReader()
    fireEvent.click(screen.getByRole('button', { name: 'Report page' }))
    fireEvent.change(screen.getByLabelText('A little context, if you want'), { target: { value: 'A privacy concern.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send private report' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.reportStory.mock.calls[0][0]).toEqual({ storyId: page.id, replyId: null, reason: 'privacy', details: 'A privacy concern.' })
    fireEvent.click(screen.getByRole('button', { name: 'Hide this writer' }))
    const dialog = screen.getByRole('dialog', { name: 'Make a little space?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide this writer' }))
    await screen.findByRole('heading', { name: 'The Story Garden' })
    expect(api.muteStoryWriter).toHaveBeenCalledWith(page.id, null)
  })
})


describe('Private author pride nudges', () => {
  it('shows a flower only to the author and unfolds the server count', async () => {
    const api = mockApi([page])
    api.fetchStory.mockResolvedValue(ok({ ...page, is_mine: true, received_reactions: ['warmth'], received_reader_count: 2 }))
    await openReader(api)
    const summary = screen.getByText('Your words stayed with someone.')
    fireEvent.click(summary)
    expect(screen.getByText('2 readers left a little warmth.')).toBeTruthy()
    expect(screen.getByText('Only you can see this note.')).toBeTruthy()
    cleanup()
    api.fetchStory.mockResolvedValue(ok({ ...page, received_reactions: ['warmth'], received_reader_count: 2 }))
    await openReader(api)
    expect(screen.queryByText('Your words stayed with someone.')).toBeNull()
  })
  it('does not invent warmth when an author has no responses', async () => {
    const api = mockApi([page])
    api.fetchStory.mockResolvedValue(ok({ ...page, is_mine: true, received_reactions: [], received_reader_count: 0 }))
    await openReader(api)
    expect(screen.queryByText('Your words stayed with someone.')).toBeNull()
  })
  it('keeps a failed cover save editable and guards leaving', async () => {
    const api = mockApi()
    await openGarden(api)
    fireEvent.click(screen.getByRole('button', { name: 'My notebook' }))
    await screen.findByRole('heading', { name: 'Pages by My name' })
    fireEvent.click(screen.getByText('Make this cover yours'))
    fireEvent.change(screen.getByLabelText('Private cover pen name'), { target: { value: 'Quiet gardener' } })
    api.saveStoryNotebook.mockResolvedValueOnce(error())
    fireEvent.click(screen.getByRole('button', { name: 'Save my cover' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Private cover pen name').value).toBe('Quiet gardener')
    expect(screen.queryByText('Your private cover is saved.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Back to the garden/ }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Save cover and leave' }))
    await screen.findByRole('heading', { name: 'The Story Garden' })
    expect(api.saveStoryNotebook).toHaveBeenLastCalledWith(community.id, expect.objectContaining({ pen_name: 'Quiet gardener' }))
    expect(api.saveStory).not.toHaveBeenCalled()
  })
  it('keeps notebook pages available when the cover migration is missing', async () => {
    const api = mockApi()
    api.fetchStoryNotebook.mockResolvedValue(error('Missing function', 'PGRST202'))
    await openGarden(api)
    fireEvent.click(screen.getByRole('button', { name: 'My notebook' }))
    await screen.findByRole('heading', { name: 'My notebook' })
    expect(screen.getByRole('button', { name: 'Begin a page' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save my cover' })).toBeNull()
  })
})
