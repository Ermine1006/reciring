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

async function ready() {
  // the mic listens only once the in-app plugin reports it is available
  await vi.waitFor(() => expect(plugin.available).toHaveBeenCalled())
  await act(async () => {})
}

it('listens on one tap in the iOS app and streams words into the box', async () => {
  const onDraft = vi.fn(), onActive = vi.fn()
  render(<VoiceTyping inputRef={{ current: null }} onDraft={onDraft} onActiveChange={onActive} />)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  await vi.waitFor(() => expect(plugin.start).toHaveBeenCalledWith({ language: expect.any(String) }))
  expect(onActive).toHaveBeenLastCalledWith(true)
  act(() => listeners.result({ text: 'Happy to help', isFinal: false }))
  expect(onDraft).toHaveBeenLastCalledWith('Happy to help')
  act(() => listeners.result({ text: 'Happy to help with your case', isFinal: false }))
  expect(onDraft).toHaveBeenLastCalledWith('Happy to help with your case')
  fireEvent.click(screen.getByRole('button', { name: 'Stop voice typing' }))
  expect(plugin.stop).toHaveBeenCalled()
  act(() => listeners.end())
  expect(onActive).toHaveBeenLastCalledWith(false)
  expect(screen.getByRole('button', { name: 'Voice typing' })).toBeTruthy()
})

it('switches language while listening and remembers it', async () => {
  render(<VoiceTyping inputRef={{ current: null }} onDraft={() => {}} onActiveChange={() => {}} />)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  await vi.waitFor(() => expect(plugin.start).toHaveBeenCalledTimes(1))
  const first = plugin.start.mock.calls[0][0].language
  fireEvent.click(screen.getByRole('button', { name: /Voice language/ }))
  act(() => listeners.end())
  await vi.waitFor(() => expect(plugin.start).toHaveBeenCalledTimes(2))
  const second = plugin.start.mock.calls[1][0].language
  expect(second).not.toBe(first)
  expect(localStorage.getItem('mutu:voiceLanguage')).toBe(second)
})

it('explains how to allow access when the permission is off', async () => {
  plugin.start.mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'not-allowed' }))
  render(<VoiceTyping inputRef={{ current: null }} onDraft={() => {}} onActiveChange={() => {}} />)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  expect(await screen.findByText(/turn both on in Settings/)).toBeTruthy()
})
