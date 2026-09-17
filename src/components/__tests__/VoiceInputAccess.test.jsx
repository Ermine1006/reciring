// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import VoiceInputAccess from '../VoiceInputAccess'
import { isVoiceField, insertVoiceText } from '../../lib/voiceFields'
vi.mock('../../lib/platform', () => ({ isNativeApp: false }))
beforeEach(() => { vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 450, bottom: 500, left: 20, right: 360, width: 340, height: 50 }) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.SpeechRecognition })
function Form() {
  const [value, setValue] = useState('Hello friend')
  return <><textarea aria-label="Ask Mutu" maxLength={60} value={value} onChange={e => setValue(e.target.value)} /><output>{value}</output><input aria-label="Other" /><VoiceInputAccess /></>
}
it('updates controlled React state at the selected range without submitting', () => {
  render(<Form />)
  const field = screen.getByLabelText('Ask Mutu')
  act(() => expect(insertVoiceText(field, 'Serene', { start: 6, end: 12 })).toBe(''))
  expect(screen.getByRole('status').textContent).toBe('Hello Serene')
})
it('rejects over-limit text intact and protects credentials and structured fields', () => {
  render(<Form />)
  const field = screen.getByLabelText('Ask Mutu')
  expect(insertVoiceText(field, 'a'.repeat(70), { start: 12, end: 12 })).toContain('60 characters')
  expect(field.value).toBe('Hello friend')
  for (const type of ['password', 'email', 'number', 'date', 'time', 'url', 'file', 'tel']) {
    const input = document.createElement('input'); input.type = type
    expect(isVoiceField(input)).toBe(false)
  }
  const otp = document.createElement('input'); otp.inputMode = 'numeric'
  expect(isVoiceField(otp)).toBe(false)
  field.readOnly = true
  expect(isVoiceField(field)).toBe(false)
})
it('offers voice typing in a focused field and inserts only after review', () => {
  let recognition
  window.SpeechRecognition = class { constructor() { recognition = this } start = vi.fn(); abort = vi.fn() }
  render(<Form />)
  const field = screen.getByLabelText('Ask Mutu')
  field.setSelectionRange(12, 12)
  fireEvent.focusIn(field)
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start voice typing' }))
  act(() => recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'How are you?' }], { isFinal: true })] }))
  expect(field.value).toBe('Hello friend')
  expect(screen.getByRole('button', { name: 'Insert text' }).disabled).toBe(true)
  act(() => recognition.onend())
  fireEvent.click(screen.getByRole('button', { name: 'Insert text' }))
  expect(field.value).toBe('Hello friend How are you?')
  expect(screen.getByRole('status').textContent).toBe('Hello friend How are you?')
})
it('stops an active microphone when switching fields and discards late events', () => {
  let recognition
  window.SpeechRecognition = class { constructor() { recognition = this } start = vi.fn(); abort = vi.fn() }
  render(<Form />)
  fireEvent.focusIn(screen.getByLabelText('Ask Mutu'))
  fireEvent.click(screen.getByRole('button', { name: 'Voice typing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start voice typing' }))
  fireEvent.focusIn(screen.getByLabelText('Other'))
  expect(recognition.abort).toHaveBeenCalledOnce()
  expect(recognition.onresult).toBeNull()
  expect(screen.getByLabelText('Other').value).toBe('')
})
