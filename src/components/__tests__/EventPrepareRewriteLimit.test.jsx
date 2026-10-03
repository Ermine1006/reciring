// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const api = vi.hoisted(() => ({ rewrite: vi.fn() }))
vi.mock('../../lib/events', () => ({ fetchEventById: vi.fn().mockResolvedValue({ data: { id: 'e1', title: 'Mutu Appreciation Party' } }) }))
vi.mock('../../lib/eventPrep', () => ({ GOAL_OPTIONS: [], fetchEventGoals: vi.fn().mockResolvedValue({ goals: [] }), saveEventGoals: vi.fn() }))
vi.mock('../../lib/marketplace', () => ({ fetchMyMarketplacePosts: vi.fn().mockResolvedValue({ data: [] }), createMarketplacePost: vi.fn(), updateMarketplacePost: vi.fn(), deleteMarketplacePost: vi.fn() }))
vi.mock('../../lib/aiRewrite', () => ({ rewriteText: api.rewrite }))
import EventPreparePage from '../EventPreparePage'
afterEach(cleanup)
it('asks the AI to stay within the 150 character event post box', async () => {
  api.rewrite.mockResolvedValue({ text: 'Toronto events and winter tips.' })
  render(<EventPreparePage eventId="e1" userId="me" />)
  const [box] = await screen.findAllByRole('textbox')
  fireEvent.change(box, { target: { value: 'looking for toronto events and winter tips' } })
  fireEvent.click(screen.getAllByRole('button', { name: /Increase My Response Rate/ })[0])
  await waitFor(() => expect(api.rewrite).toHaveBeenCalled())
  expect(api.rewrite.mock.calls[0][0].maxChars).toBe(150)
  expect(box.getAttribute('maxlength')).toBe('150')
})
