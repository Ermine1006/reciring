// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ extras: vi.fn(), ask: vi.fn(), encounters: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../../lib/featureFlags', () => ({ isPracticeEnabled: () => false }))
vi.mock('../../lib/askMutuContextExtras', () => ({ loadAskMutuContextExtras: mocks.extras }))
vi.mock('../../lib/eventMemory', async importOriginal => ({
  ...await importOriginal(), fetchEncounters: mocks.encounters,
  fetchAskHistory: vi.fn(async () => ({ data: [] })), saveAskMessage: vi.fn(), clearAskHistory: vi.fn(), askMutu: mocks.ask,
}))
vi.mock('../../lib/relationships', () => ({ fetchConnections: async () => ({ data: [] }) }))
vi.mock('../../lib/events', () => ({ fetchMyEvents: async () => ({ data: [] }), fetchUpcomingEvents: async () => ({ data: [] }) }))
vi.mock('../../lib/eventMatch', () => ({ fetchEventPrepCandidates: vi.fn() }))
vi.mock('../../lib/posts', () => ({ fetchPosts: async () => ({ data: [] }) }))
vi.mock('../../lib/matches', () => ({ fetchMatchedPostIds: async () => ({ data: [] }) }))
import AskMutuSheet from '../AskMutuSheet'
HTMLElement.prototype.scrollIntoView = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.encounters.mockResolvedValue({ data: [] })
  mocks.ask.mockResolvedValue({ answer: 'Ready to help.' })
  mocks.extras.mockResolvedValue({ buddy: { programs: [{ name: 'Rotman' }] }, stories: [{ title: 'My page' }], circle: [{ name: 'Maya', practices_together: 4 }] })
})
afterEach(cleanup)
const summary = () => screen.getByRole('button', { name: 'Summary', exact: true })
it('waits for the context, then sends Buddy, stories and relationships to the assistant', async () => {
  let resolve
  mocks.extras.mockReturnValue(new Promise(r => { resolve = r }))
  render(<AskMutuSheet open userId="me" onClose={() => {}} />)
  expect(summary().disabled).toBe(true)
  fireEvent.click(summary())
  expect(mocks.ask).not.toHaveBeenCalled()
  await waitFor(() => expect(mocks.extras).toHaveBeenCalledWith('me'))
  await act(async () => resolve({ buddy: { programs: [{ name: 'Rotman' }] }, stories: [{ title: 'My page' }], circle: [{ name: 'Maya', practices_together: 4 }] }))
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[0][1]).toMatchObject({ buddy: { programs: [{ name: 'Rotman' }] }, my_stories: [{ title: 'My page' }], strongest_relationships: [{ name: 'Maya', practices_together: 4 }] })
})
it('does not reuse another account’s context while the new account loads', async () => {
  const view = render(<AskMutuSheet open userId="first" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  let resolve
  mocks.extras.mockReturnValue(new Promise(r => { resolve = r }))
  view.rerender(<AskMutuSheet open userId="second" onClose={() => {}} />)
  expect(summary().disabled).toBe(true)
  fireEvent.click(summary())
  expect(mocks.ask).not.toHaveBeenCalled()
  await waitFor(() => expect(mocks.extras).toHaveBeenCalledWith('second'))
  await act(async () => resolve({ buddy: null, stories: null, circle: null }))
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[0][1].buddy).toBeUndefined()
  expect(mocks.ask.mock.calls[0][1].my_stories).toBeUndefined()
})
it('offers retry after loading fails instead of asking with an empty context', async () => {
  mocks.encounters.mockRejectedValueOnce(new Error('Offline'))
  render(<AskMutuSheet open userId="me" onClose={() => {}} />)
  await screen.findByRole('alert')
  expect(summary().disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(summary().disabled).toBe(false))
})
