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
it('starts listening on one tap, streams the words live, and stops on a second tap', () => {
  let recognition
  window.SpeechRecognition = class { constructor() { recognition = this } start = vi.fn(); abort = vi.fn(); stop = vi.fn() }
  const draft = vi.fn(), active = vi.fn()
  render(<VoiceTyping onDraft={draft} onActiveChange={active} inputRef={{ current: null }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  expect(recognition.start).toHaveBeenCalledOnce()
  expect(recognition.continuous).toBe(true)
  expect(active).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('status').textContent).toContain('Listening')
  const provisional = Object.assign([{ transcript: 'Hello' }], { isFinal: false })
  act(() => recognition.onresult({ resultIndex: 0, results: [provisional] }))
  expect(draft).toHaveBeenLastCalledWith('Hello')
  const final = Object.assign([{ transcript: 'Hello there' }], { isFinal: true })
  const more = Object.assign([{ transcript: ' friend' }], { isFinal: false })
  act(() => recognition.onresult({ resultIndex: 1, results: [final, more] }))
  expect(draft).toHaveBeenLastCalledWith('Hello there friend')
  fireEvent.click(screen.getByRole('button', { name: 'Stop voice typing' }))
  expect(recognition.stop).toHaveBeenCalledOnce()
  act(() => recognition.onend())
  expect(active).toHaveBeenLastCalledWith(false)
  expect(screen.getByRole('button', { name: 'Voice typing' })).toBeTruthy()
})
it('opens the keyboard on devices without speech recognition', () => {
  const focus = vi.fn()
  render(<VoiceTyping onDraft={vi.fn()} onActiveChange={vi.fn()} inputRef={{ current: { focus } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  expect(focus).toHaveBeenCalledOnce()
  expect(screen.getByRole('status').textContent).toContain('microphone on your keyboard')
})
it('shows permission errors and aborts recognition when unmounted', () => {
  let recognition
  window.SpeechRecognition = class { constructor() { recognition = this } start = vi.fn(); abort = vi.fn(); stop = vi.fn() }
  const { unmount } = render(<VoiceTyping onDraft={vi.fn()} onActiveChange={vi.fn()} inputRef={{ current: null }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  act(() => recognition.onerror({ error: 'not-allowed' }))
  expect(screen.getByRole('status').textContent).toContain('not allowed')
  unmount()
  expect(recognition.abort).toHaveBeenCalledOnce()
})
