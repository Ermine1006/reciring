// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import NotificationBell from '../NotificationBell'
import { markRead } from '../../lib/notifications'
vi.mock('../../lib/notifications', () => ({
  fetchNotifications: vi.fn().mockResolvedValue({ data:[{ id:'notice', title:'New message', body:'Hello', type:'new_message', read_at:null }] }),
  fetchUnreadCount: vi.fn().mockResolvedValue({ count:1 }),
  markRead: vi.fn().mockResolvedValue({}), markAllRead: vi.fn().mockResolvedValue({}),
  subscribeNotifications: vi.fn(), formatNotificationTime: () => 'Just now',
}))
afterEach(cleanup)
it('opens outside the clipped header and restores focus when dismissed', async () => {
  const {container} = render(<header style={{ overflow:'hidden', backdropFilter:'blur(12px)' }}><NotificationBell userId="test" /></header>)
  const bell = screen.getByRole('button', {name:'Notifications'})
  fireEvent.click(bell)
  const dialog = await screen.findByRole('dialog', {name:'Notifications'})
  expect(container.contains(dialog)).toBe(false)
  expect(document.body.contains(dialog)).toBe(true)
  expect(document.activeElement).toBe(screen.getByRole('button', {name:'Close notifications'}))
  fireEvent.keyDown(document, {key:'Escape'})
  await waitFor(() => expect(screen.queryByRole('dialog')).toBe(null))
  expect(document.activeElement).toBe(bell)
})
it('opens the selected message and marks it read from the overlay', async () => {
  const onOpenNotification = vi.fn()
  render(<NotificationBell userId="test" onOpenNotification={onOpenNotification} />)
  fireEvent.click(screen.getByRole('button', {name:'Notifications'}))
  const message = await screen.findByRole('button', {name:/New message/})
  fireEvent.keyDown(message, {key:'Enter'})
  expect(markRead).toHaveBeenCalledWith('notice')
  expect(onOpenNotification).toHaveBeenCalledWith(expect.objectContaining({id:'notice'}))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBe(null))
})
