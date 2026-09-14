// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import GiveAskHub from '../GiveAskHub'

vi.mock('../SubmitRequest', () => ({ default: ({ onSubmitted }) => <button onClick={() => onSubmitted({ title: 'Coffee chat' })}>Publish post</button> }))
afterEach(() => { cleanup(); localStorage.clear() })
function Harness({ save = async () => ({}) }) {
  const [view, setView] = useState('browse')
  return <GiveAskHub view={view} onViewChange={setView} myPosts={[{ id: 'mine', needs: 'Coffee chat', offers: 'Design experience' }]} onCreatePost={save} onEditPost={async () => ({})} onDeletePost={async () => ({})}><div>Swipe cards</div></GiveAskHub>
}
it('opens My posts directly and exposes the existing edit form', async () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'My posts', exact: true }))
  expect(screen.queryByText('Swipe cards')).toBeNull()
  expect(screen.getByText('Coffee chat')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
  expect(await screen.findByText('Edit post')).toBeTruthy()
})
it('keeps the composer on failure and opens management only after publishing succeeds', async () => {
  const save = vi.fn().mockResolvedValueOnce({ error: new Error('Offline') }).mockResolvedValueOnce({})
  render(<Harness save={save} />)
  fireEvent.click(screen.getByRole('button', { name: /New post/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Publish post' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Publish post' }))
  expect(await screen.findByRole('status')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Edit', exact: true })).toBeTruthy()
})
it('remembers dismissal of the optional tip', () => {
  const first = render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss posting tip' }))
  first.unmount()
  render(<Harness />)
  expect(screen.queryByRole('button', { name: 'Dismiss posting tip' })).toBeNull()
})
