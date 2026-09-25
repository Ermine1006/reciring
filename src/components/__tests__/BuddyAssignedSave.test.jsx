// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/buddy/api', () => ({ buddyRpc: rpc, analyzeBuddyPost: vi.fn() }))

import BuddyAssigned from '../buddy/BuddyAssigned'

afterEach(cleanup)
beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ pairs: [] })
})

const roster = 'Milan Patel <milank.patel@mail.utoronto.ca>\nThomas Peng <thomas.peng@mail.utoronto.ca>'

async function reachReviewScreen() {
  render(<BuddyAssigned program="p" role="upper" upper onDirtyChange={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: /Add my Buddies/ }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: roster } })
  fireEvent.click(screen.getByRole('button', { name: /Review my Buddies/ }))
  return await screen.findByRole('heading', { name: 'Your Buddy crew' })
}

// The review screen warned about leaving "without sending your
// changes" while no button said send, and the screen itself promises
// no email is sent. The button that keeps the work is "Add N Buddies".
describe('the Buddy crew review screen', () => {
  it('says which button saves, so the save is findable', async () => {
    await reachReviewScreen()
    expect(screen.getByRole('button', { name: 'Add 2 Buddies' })).toBeTruthy()
    expect(screen.getByText(/Nothing is saved until you tap Add 2 Buddies/)).toBeTruthy()
  })

  it('saves the reviewed list when that button is tapped', async () => {
    await reachReviewScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 Buddies' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('buddy_assigned_add', expect.objectContaining({
      p_program: 'p',
      p_students: expect.arrayContaining([expect.objectContaining({ email: 'milank.patel@mail.utoronto.ca' })]),
    })))
  })

  it('warns about saving, not about sending, when leaving with work in progress', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await reachReviewScreen()
    fireEvent.click(screen.getByRole('button', { name: /My Buddies/ }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Leave without saving/))
    expect(confirmSpy).not.toHaveBeenCalledWith(expect.stringMatching(/sending/))
    // Declining the prompt keeps them on the screen with the list intact.
    expect(screen.getByRole('heading', { name: 'Your Buddy crew' })).toBeTruthy()
    confirmSpy.mockRestore()
  })
})
