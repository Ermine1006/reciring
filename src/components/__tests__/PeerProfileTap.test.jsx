// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ fetchPublic: vi.fn(), fetchChat: vi.fn() }))
vi.mock('../../lib/askMutuSharedProfiles', () => ({ fetchPublicProfile: mocks.fetchPublic, fetchChatProfile: mocks.fetchChat }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
import { PeerProfileProvider } from '../../context/PeerProfileContext'
import PeerProfileTap from '../PeerProfileTap'
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('slides out a Public member profile when their avatar is tapped, without triggering the card', async () => {
  mocks.fetchPublic.mockResolvedValue({ profile: { name: 'Sarah Chen', title: 'Founder' }, access: 'public' })
  const cardClick = vi.fn()
  render(<PeerProfileProvider><div onClick={cardClick}><PeerProfileTap peerId="peer" name="Sarah"><span>avatar</span></PeerProfileTap></div></PeerProfileProvider>)
  fireEvent.click(screen.getByRole('button', { name: "View Sarah's profile" }))
  expect(await screen.findByRole('heading', { name: 'Sarah Chen' })).toBeTruthy()
  expect(screen.getByText('Public profile')).toBeTruthy()
  expect(mocks.fetchPublic).toHaveBeenCalledWith('peer', 'me')
  expect(cardClick).not.toHaveBeenCalled()
})
it('keeps anonymous avatars and your own avatar non-interactive', () => {
  render(<PeerProfileProvider><PeerProfileTap peerId={null}><span>bean</span></PeerProfileTap><PeerProfileTap peerId="me" name="Serine"><span>me</span></PeerProfileTap></PeerProfileProvider>)
  expect(screen.queryByRole('button')).toBeNull()
  expect(mocks.fetchPublic).not.toHaveBeenCalled()
})
