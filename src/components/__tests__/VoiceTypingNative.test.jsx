// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const listeners = {}
const plugin = {
  available: vi.fn().mockResolvedValue({ available: true }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn(async (name, fn) => { listeners[name] = fn; return { remove: () => { delete listeners[name] } } }),
}
vi.mock('../../lib/platform', () => ({ isNativeApp: true }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios' }, registerPlugin: () => plugin }))
const { default: VoiceTyping } = await import('../VoiceTyping')

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('listens in the iOS app and turns speech into an editable draft', async () => {
  const onTranscript = vi.fn()
  render(<VoiceTyping inputRef={{ current: null }} onTranscript={onTranscript} onActiveChange={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Start voice typing' }))
  await vi.waitFor(() => expect(plugin.start).toHaveBeenCalledWith({ language: expect.any(String) }))
  act(() => listeners.result({ text: 'Happy to help with your case', isFinal: false }))
  expect(screen.getByRole('status').textContent).toContain('Happy to help with your case')
  fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }))
  expect(plugin.stop).toHaveBeenCalled()
  act(() => listeners.end())
  expect(onTranscript).toHaveBeenCalledWith('Happy to help with your case')
  expect(onTranscript).toHaveBeenCalledTimes(1)
})

it('explains how to allow access when the permission is off', async () => {
  plugin.start.mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'not-allowed' }))
  render(<VoiceTyping inputRef={{ current: null }} onTranscript={() => {}} onActiveChange={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Start voice typing' }))
  expect(await screen.findByText(/turn both on in Settings/)).toBeTruthy()
})
