// @vitest-environment jsdom
import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DisplayModeSwitcher, { DISPLAY_MODE_KEY, DisplayModeProvider } from '../DisplayMode'
const resize = width => act(() => { window.innerWidth = width; window.dispatchEvent(new Event('resize')) })
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
function Draft() { const [text,setText] = useState(''); return <input aria-label="Draft" value={text} onChange={e=>setText(e.target.value)} /> }
function Page() { return <DisplayModeProvider><DisplayModeSwitcher /><Draft /></DisplayModeProvider> }
it('switches without remounting a draft and remembers the preference after reopening', () => {
  resize(1440)
  const page=render(<Page />)
  fireEvent.change(screen.getByLabelText('Draft'),{target:{value:'Unsent message'}})
  fireEvent.change(screen.getByLabelText('Website view'),{target:{value:'mobile'}})
  expect(document.documentElement.dataset.mutuLayout).toBe('mobile')
  expect(screen.getByLabelText('Draft').value).toBe('Unsent message')
  expect(localStorage.getItem(DISPLAY_MODE_KEY)).toBe('mobile')
  page.unmount(); render(<Page />)
  expect(screen.getByLabelText('Website view').value).toBe('mobile')
  expect(document.documentElement.dataset.mutuLayout).toBe('mobile')
})
it('honors PC on a phone and resumes responsive sizing when Auto is chosen', () => {
  resize(390); render(<Page />)
  expect(document.documentElement.dataset.mutuLayout).toBe('mobile')
  fireEvent.change(screen.getByLabelText('Website view'),{target:{value:'desktop'}})
  expect(document.documentElement.dataset.mutuLayout).toBe('desktop')
  fireEvent.change(screen.getByLabelText('Website view'),{target:{value:'auto'}})
  resize(768); expect(document.documentElement.dataset.mutuLayout).toBe('tablet')
  resize(1440); expect(document.documentElement.dataset.mutuWide).toBe('true')
})
it('falls back from an invalid preference and still switches if storage is blocked', () => {
  localStorage.setItem(DISPLAY_MODE_KEY,'invalid')
  resize(1440); render(<Page />)
  expect(screen.getByLabelText('Website view').value).toBe('auto')
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{ throw new Error('Blocked') })
  fireEvent.change(screen.getByLabelText('Website view'),{target:{value:'mobile'}})
  expect(document.documentElement.dataset.mutuLayout).toBe('mobile')
})
