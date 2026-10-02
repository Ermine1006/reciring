// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const { rewrite } = vi.hoisted(() => ({ rewrite: vi.fn() }))
vi.mock('../../lib/aiRewrite', () => ({ rewriteText: rewrite }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ profile: null }) }))
import SubmitRequest from '../SubmitRequest'
const original = 'I am happy to share my VC experience'
const improved = 'Happy to share lessons from my experience in VC.'
const setup = () => render(<SubmitRequest prefill={{ title: 'Interview help', details: 'Need interview advice', offers: original }} onSubmit={vi.fn()} onClose={vi.fn()} />)
const offerButton = () => screen.getAllByRole('button', { name: /Increase My Response Rate/ })[1]
beforeEach(() => { rewrite.mockReset() })
afterEach(cleanup)
it('updates the offer in place, shows nearby feedback, and lets the user undo', async () => {
  rewrite.mockResolvedValue({ text: improved, error: null })
  setup()
  fireEvent.click(offerButton())
  await screen.findByText('Wording updated. Review it before posting.')
  expect(screen.getByLabelText(/What would you be happy/).value).toBe(improved)
  expect(rewrite).toHaveBeenCalledWith(expect.objectContaining({ kind: 'post_offer', text: original, maxChars: 200 }))
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByLabelText(/What would you be happy/).value).toBe(original)
})
it('keeps the draft and displays a retryable error next to the failed button', async () => {
  rewrite.mockRejectedValue(new Error('Unavailable'))
  setup()
  fireEvent.click(offerButton())
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Try again or keep editing')
  expect(alert.previousElementSibling).toBe(offerButton())
  expect(offerButton().disabled).toBe(false)
  expect(screen.getByLabelText(/What would you be happy/).value).toBe(original)
})
it('does not overwrite edits made while waiting for AI', async () => {
  let resolve
  rewrite.mockReturnValue(new Promise(r => { resolve = r }))
  setup()
  fireEvent.click(offerButton())
  fireEvent.change(screen.getByLabelText(/What would you be happy/), { target: { value: 'My new draft' } })
  await act(async () => resolve({ text: improved, error: null }))
  expect(screen.getByLabelText(/What would you be happy/).value).toBe('My new draft')
  expect(screen.getByText(/Your edits were kept/)).toBeTruthy()
})
it('rewrites the request independently of the offer', async () => {
  rewrite.mockResolvedValue({ text: 'Could someone help me prepare for an interview?', error: null })
  setup()
  fireEvent.click(screen.getAllByRole('button', { name: /Increase My Response Rate/ })[0])
  await waitFor(() => expect(screen.getByLabelText(/Details/).value).toBe('Could someone help me prepare for an interview?'))
  expect(screen.getByLabelText(/What would you be happy/).value).toBe(original)
})
it('explains when the model returns the same wording', async () => {
  rewrite.mockResolvedValue({ text: original, error: null })
  setup()
  fireEvent.click(offerButton())
  expect(await screen.findByText(/AI kept your wording/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
})
