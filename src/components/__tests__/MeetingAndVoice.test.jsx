// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CoffeeChatModal from '../CoffeeChatModal'
import VoiceTyping from '../VoiceTyping'
import { meetingLink } from '../../lib/meetingLink'
vi.mock('../../lib/platform', () => ({ isNativeApp: false }))
afterEach(() => { cleanup(); delete window.SpeechRecognition })
it('allows real meeting providers and rejects executable or misleading URLs', () => {
  expect(meetingLink(' https://rotman.zoom.us/j/123?pwd=abc ').provider).toBe('Zoom')
  expect(meetingLink('https://meet.google.com/abc-defg-hij').provider).toBe('Google Meet')
  expect(meetingLink('https://teams.microsoft.com/l/meetup-join/example').provider).toBe('Teams')
  for (const url of ['javascript:alert(1)', 'http://zoom.us/j/123', 'https://zoom.us.evil.com/j/123', 'https://user:pw@zoom.us/j/123', 'https://zoom.us']) expect(meetingLink(url)).toBeNull()
})
it('sends an online invitation and retains its link when rescheduling', async () => {
  const onConfirm = vi.fn()
  const link = 'https://zoom.us/j/123?pwd=abc'
  render(<CoffeeChatModal onConfirm={onConfirm} onClose={() => {}} initialValues={{ datetime: '2099-01-01T18:00:00Z', location: link, format: 'online', meetingUrl: link }} />)
  expect(screen.getByLabelText('Meeting link').value).toBe(link)
  fireEvent.click(screen.getByRole('button', { name: 'Send Suggestion' }))
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ format: 'online', meetingUrl: link, location: link })))
})
it('does not send an invalid link and preserves input after a save failure', async () => {
  const onConfirm = vi.fn().mockRejectedValue(new Error('offline'))
  render(<CoffeeChatModal onConfirm={onConfirm} onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Online' }))
  fireEvent.change(screen.getByLabelText('Meeting link'), { target: { value: 'https://evil.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send Suggestion' }))
  expect(onConfirm).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Meeting link'), { target: { value: 'https://zoom.us/j/123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send Suggestion' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be sent'))
  expect(screen.getByLabelText('Meeting link').value).toBe('https://zoom.us/j/123')
})
it('requires starting recognition, appends only final text, and releases it on close', () => {
  let recognition
  window.SpeechRecognition = class { constructor() { recognition = this } start = vi.fn(); abort = vi.fn(); stop = vi.fn() }
  const append = vi.fn(), active = vi.fn()
  render(<VoiceTyping onTranscript={append} onActiveChange={active} inputRef={{ current: null }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  expect(recognition).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Start voice typing' }))
  expect(active).toHaveBeenLastCalledWith(true)
  const provisional = Object.assign([{ transcript: 'Hello' }], { isFinal: false })
  act(() => recognition.onresult({ resultIndex: 0, results: [provisional] }))
  expect(append).not.toHaveBeenCalled()
  const final = Object.assign([{ transcript: 'Hello there' }], { isFinal: true })
  act(() => recognition.onresult({ resultIndex: 0, results: [final] }))
  expect(append).toHaveBeenCalledExactlyOnceWith('Hello there')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(recognition.abort).toHaveBeenCalledOnce()
  expect(recognition.onresult).toBeNull()
  expect(active).toHaveBeenLastCalledWith(false)
})
it('offers keyboard dictation on unsupported devices', () => {
  const focus = vi.fn()
  render(<VoiceTyping onTranscript={vi.fn()} onActiveChange={vi.fn()} inputRef={{ current: { focus } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open keyboard' }))
  expect(focus).toHaveBeenCalledOnce()
})
it('shows permission errors and aborts recognition when unmounted', () => {
  let recognition
  window.SpeechRecognition = class { constructor() { recognition = this } start = vi.fn(); abort = vi.fn() }
  const { unmount } = render(<VoiceTyping onTranscript={vi.fn()} onActiveChange={vi.fn()} inputRef={{ current: null }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start voice typing' }))
  act(() => recognition.onerror({ error: 'not-allowed' }))
  expect(screen.getByRole('status').textContent).toContain('not allowed')
  unmount()
  expect(recognition.abort).toHaveBeenCalledOnce()
})
