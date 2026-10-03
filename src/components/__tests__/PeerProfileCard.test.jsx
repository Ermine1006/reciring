// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), fetchPublic: vi.fn() }))
vi.mock('../../lib/askMutuSharedProfiles', () => ({ fetchChatProfile: mocks.fetch, fetchPublicProfile: mocks.fetchPublic }))
vi.mock('../VoiceTyping', () => ({ default: () => null }))
import PeerProfileCard from '../PeerProfileCard'
import ChatView from '../ChatView'
const match = { id: 'chat', peerId: 'peer', status: 'active', peerName: 'Serine', peerNamePublic: true, peerProfilePublic: true, reveal: { status: 'none' }, request: {} }
const profile = { name: 'Serine Lyu', program: 'MBA', location: 'Toronto', graduation_year: 2027, title: 'Founder', company: 'Mutu', personal_interests: ['yoga'], expertise_offered: ['product-strategy'], prompt_weekend: 'Yoga with friends.', prompt_ask_me: 'Building a community.', prompt_seeking: 'Study partners.' }
beforeEach(() => { vi.clearAllMocks(); mocks.fetch.mockResolvedValue({ profile, access: 'public' }) })
afterEach(cleanup)
it('opens the full profile by clicking the public chat header and closes back to chat', async () => {
  render(<ChatView match={match} messages={[]} currentUserId="me" onSend={vi.fn()} />)
  const opener = screen.getByRole('button', { name: 'View peer profile' })
  opener.focus()
  fireEvent.click(opener)
  await screen.findByRole('heading', { name: 'Serine Lyu' })
  for (const text of ['Yoga', 'Product strategy', 'Yoga with friends.', 'Building a community.', 'Study partners.', 'Toronto', '2027', 'Founder', 'Mutu']) expect(screen.getByText(text)).toBeTruthy()
  expect(mocks.fetch).toHaveBeenCalledWith('chat', 'me')
  fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
  expect(screen.queryByRole('dialog', { name: 'Member profile' })).toBeNull()
  expect(document.activeElement).toBe(opener)
})
it('keeps anonymous headers non-clickable until sharing is accepted', () => {
  render(<ChatView match={{ ...match, peerNamePublic: false }} messages={[]} currentUserId="me" onSend={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'View peer profile' })).toBeNull()
  expect(mocks.fetch).not.toHaveBeenCalled()
})
it('offers the existing consent flow for a named but private profile', async () => {
  mocks.fetch.mockResolvedValue({ error: 'Their full profile has not been shared yet.', code: 'profile_sharing_required' })
  const request = vi.fn(), close = vi.fn()
  render(<PeerProfileCard open match={match} currentUserId="me" onClose={close} onRequestReveal={request} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Request profile sharing' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  expect(screen.queryByText('Yoga')).toBeNull()
})
it('shows a retryable error rather than stale profile data', async () => {
  mocks.fetch.mockResolvedValueOnce({ error: 'Could not load.' })
  render(<PeerProfileCard open match={match} currentUserId="me" onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  await screen.findByRole('heading', { name: 'Serine Lyu' })
})
it('ignores a previous conversation’s late profile response', async () => {
  let resolve
  mocks.fetch.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const view = render(<PeerProfileCard open match={match} currentUserId="me" onClose={vi.fn()} />)
  mocks.fetch.mockResolvedValue({ profile: { name: 'New peer' }, access: 'shared' })
  view.rerender(<PeerProfileCard open match={{ ...match, id: 'second' }} currentUserId="me" onClose={vi.fn()} />)
  await screen.findByRole('heading', { name: 'New peer' })
  expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Member profile' }))
  await act(async () => resolve({ profile, access: 'public' }))
  expect(screen.queryByRole('heading', { name: 'Serine Lyu' })).toBeNull()
})
