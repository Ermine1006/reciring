// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ fetchPublic: vi.fn(), fetchChat: vi.fn() }))
vi.mock('../../lib/askMutuSharedProfiles', () => ({ fetchPublicProfile: mocks.fetchPublic, fetchChatProfile: mocks.fetchChat }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
import { PeerProfileProvider } from '../../context/PeerProfileContext'
import PeerNameLink from '../PeerNameLink'
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('slides out a Public member profile when their name is tapped, without triggering the card', async () => {
  mocks.fetchPublic.mockResolvedValue({ profile: { name: 'Sarah Chen', title: 'Founder' }, access: 'public' })
  const cardClick = vi.fn()
  render(<PeerProfileProvider><div onClick={cardClick}><PeerNameLink peerId="peer">Sarah</PeerNameLink></div></PeerProfileProvider>)
  fireEvent.click(screen.getByRole('button', { name: "View Sarah's profile" }))
  expect(await screen.findByRole('heading', { name: 'Sarah Chen' })).toBeTruthy()
  expect(screen.getByText('Public profile')).toBeTruthy()
  expect(mocks.fetchPublic).toHaveBeenCalledWith('peer', 'me')
  expect(cardClick).not.toHaveBeenCalled()
})
it('keeps anonymous names and your own name as plain text', () => {
  render(<PeerProfileProvider><PeerNameLink peerId={null}>Anonymous peer</PeerNameLink><PeerNameLink peerId="me">Serine</PeerNameLink></PeerProfileProvider>)
  expect(screen.queryByRole('button')).toBeNull()
  expect(mocks.fetchPublic).not.toHaveBeenCalled()
})
