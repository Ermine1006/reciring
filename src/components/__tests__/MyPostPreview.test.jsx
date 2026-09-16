// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MyPostPreview from '../MyPostPreview'
vi.mock('../../lib/recognition', () => ({ fetchTrustSignal: vi.fn(async () => null) }))
vi.mock('../SettingsPage', () => ({ resolveAvatarSeed: () => null }))
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)
const post = { id: 'sample', needs: 'Full request\nSecond paragraph with all the details.', offers: 'Nutrition and running tips', category: 'Advice', time: '15 min', tags: ['Advice', 'Other'], createdAt: '6w ago', isAnonymous: false, creator: { name: 'Sample Student', program: 'MBA' } }
it('shows the shared full card with identity, tags and no swipe actions, then closes', () => {
  const onClose = vi.fn()
  render(<MyPostPreview post={post} onClose={onClose} />)
  const dialog = screen.getByRole('dialog', { name: 'Post preview' })
  const card = dialog.querySelector('.mutu-swipe-card')
  expect(card).toBeTruthy()
  expect(card.style.height).toBe('auto')
  expect(card.style.maxHeight).toBe('calc(100dvh - 92px)')
  const identity = screen.getByText('Sample')
  expect(identity.style.whiteSpace).toBe('normal')
  expect(identity.style.textOverflow).not.toBe('ellipsis')
  expect(screen.getByText('Full request Second paragraph with all the details.').textContent).toBe(post.needs)
  expect(screen.getByText(post.offers)).toBeTruthy()
  expect(screen.getByText('Sample')).toBeTruthy()
  expect(screen.getByText('Other')).toBeTruthy()
  expect(screen.queryByText('CONNECT')).toBeNull()
  expect(screen.queryByText('Details')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Close post preview' }))
  expect(onClose).toHaveBeenCalledOnce()
})
it('respects anonymous posting and closes on Escape', () => {
  const onClose = vi.fn()
  render(<MyPostPreview post={{ ...post, isAnonymous: true, offers: '' }} onClose={onClose} />)
  expect(screen.queryByText('Sample')).toBeNull()
  expect(screen.queryByText('Also happy to help with')).toBeNull()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(onClose).toHaveBeenCalledOnce()
})
