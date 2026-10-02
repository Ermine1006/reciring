// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ extras: vi.fn(), ask: vi.fn(), encounters: vi.fn(), shared: vi.fn(), profile: null }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ profile: mocks.profile }) }))
vi.mock('../../lib/askMutuSharedProfiles', async importOriginal => ({ ...await importOriginal(), fetchAskMutuSharedProfiles: mocks.shared }))
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
  mocks.profile = null
  mocks.shared.mockResolvedValue({ data: [], error: null })
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

it('grounds any question in the current user’s full profile and refreshes edits', async () => {
  mocks.profile = { id: 'me', name: 'Sara', personal_interests: ['yoga'], prompt_weekend: 'Yoga on weekends' }
  const view = render(<AskMutuSheet open userId="me" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[0][1].me).toMatchObject({ personal_interests: ['Yoga'], prompt_weekend: 'Yoga on weekends' })
  mocks.profile = { id: 'me', name: 'Sara', personal_interests: ['cooking'], prompt_weekend: 'Cooking with friends' }
  view.rerender(<AskMutuSheet open userId="me" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[1][1].me.personal_interests).toEqual(['Cooking'])
  expect(JSON.stringify(mocks.ask.mock.calls[1][1])).not.toContain('Yoga')
})
it('omits a stale auth profile belonging to a different account', async () => {
  mocks.profile = { id: 'old', name: 'Old user', prompt_weekend: 'Private weekend' }
  render(<AskMutuSheet open userId="new" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[0][1].me).toBeNull()
  expect(mocks.ask.mock.calls[0][1].unavailable_context).toContain('profile')
  expect(JSON.stringify(mocks.ask.mock.calls[0][1])).not.toContain('Private weekend')
})
it('discards an old account’s response that arrives after switching accounts', async () => {
  let resolve
  mocks.ask.mockReturnValueOnce(new Promise(r => { resolve = r }))
  mocks.profile = { id: 'first', personal_interests: ['yoga'] }
  const view = render(<AskMutuSheet open userId="first" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  fireEvent.click(summary())
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(1))
  mocks.profile = { id: 'second', personal_interests: ['cooking'] }
  view.rerender(<AskMutuSheet open userId="second" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  await act(async () => resolve({ answer: 'Old private answer' }))
  expect(screen.queryByText('Old private answer')).toBeNull()
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[1][1].me.personal_interests).toEqual(['Cooking'])
})

it('lets the user read Serine’s shared profile and gives the same fields to Ask Mutu', async () => {
  mocks.shared.mockResolvedValue({ data: [{ peerId: 'serine', name: 'Serine Lyu', profile: { name: 'Serine Lyu', personal_interests: ['Yoga'], prompt_weekend: 'Weekend yoga classes', expertise_offered: ['Product strategy'] } }], error: null })
  render(<AskMutuSheet open userId="me" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Shared profiles', exact: true }))
  await screen.findByText('Serine Lyu')
  fireEvent.click(screen.getByText('Serine Lyu'))
  expect(screen.getByText('Weekend yoga classes')).toBeTruthy()
  expect(screen.getByText('Yoga')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Back to Ask Mutu/ }))
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[0][1].shared_profiles[0].profile.personal_interests).toEqual(['Yoga'])
})
it('rechecks sharing before a question and removes a revoked profile from the AI payload', async () => {
  mocks.shared.mockResolvedValueOnce({ data: [{ peerId: 'serine', name: 'Serine', profile: { prompt_weekend: 'Private weekend' } }], error: null })
  render(<AskMutuSheet open userId="me" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[0][1].shared_profiles).toEqual([])
  expect(JSON.stringify(mocks.ask.mock.calls[0][1])).not.toContain('Private weekend')
})
it('marks failed profile reads unavailable and never sends cached profile content', async () => {
  mocks.shared.mockResolvedValueOnce({ data: [{ peerId: 'serine', name: 'Serine', profile: { prompt_weekend: 'Private weekend' } }], error: null })
  mocks.shared.mockResolvedValue({ data: [], error: new Error('Offline') })
  render(<AskMutuSheet open userId="me" onClose={() => {}} />)
  await waitFor(() => expect(summary().disabled).toBe(false))
  fireEvent.click(summary())
  await screen.findByText('Ready to help.')
  expect(mocks.ask.mock.calls[0][1].shared_profiles).toBeUndefined()
  expect(mocks.ask.mock.calls[0][1].unavailable_context).toContain('shared_profiles')
  expect(JSON.stringify(mocks.ask.mock.calls[0][1])).not.toContain('Private weekend')
})
