// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { suggestedRequestTitle } from '../../lib/requestWording'
import { HELP_TYPES, INDUSTRIES } from '../../data/requestOptions'
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ profile: null }) }))
import SubmitRequest from '../SubmitRequest'
afterEach(cleanup)
it('provides complete titles under the 60 character limit for all selections', () => {
  for (const help of HELP_TYPES) for (const focus of ['', ...INDUSTRIES]) {
    const title = suggestedRequestTitle([help], focus ? [focus] : [])
    expect(title.length).toBeGreaterThan(0)
    expect(title.length).toBeLessThanOrEqual(60)
    expect(title).not.toContain('—')
  }
  expect(suggestedRequestTitle()).toBe('')
})
it('fills an empty title in one tap and supports undo without touching details', () => {
  render(<SubmitRequest demoMode prefill={{ helpType: ['Coffee Chat'], industry: ['Finance'], details: 'My specific question' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Use suggested wording' }))
  expect(screen.getByLabelText(/What would you like help with/).value).toBe('Coffee chat about Finance')
  expect(screen.getByDisplayValue('My specific question')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByLabelText(/What would you like help with/).value).toBe('')
})
it('requires choosing Replace title before replacing user text', () => {
  render(<SubmitRequest demoMode prefill={{ helpType: ['Advice'], title: 'My own request' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Use suggested wording' }))
  expect(screen.getByDisplayValue('My own request')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Replace title' }))
  expect(screen.getByLabelText(/What would you like help with/).value).toBe('Looking for advice and a fresh perspective')
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByDisplayValue('My own request')).toBeTruthy()
})
it('marks offer presets selected and removes only the selected wording on a second tap', () => {
  render(<SubmitRequest demoMode prefill={{ offers: 'My own offer.' }} />)
  const referral = screen.getByRole('button', { name: /Referrals/ })
  fireEvent.click(referral)
  expect(referral.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByLabelText(/What would you be happy to help someone with/).value).toContain('Happy to refer people where relevant.')
  fireEvent.click(referral)
  expect(referral.getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByDisplayValue('My own offer.')).toBeTruthy()
})
it('does not truncate a long offer when a preset cannot fit', () => {
  const offer = 'a'.repeat(195)
  render(<SubmitRequest demoMode prefill={{ offers: offer }} />)
  const referral = screen.getByRole('button', { name: /Referrals/ })
  expect(referral.disabled).toBe(true)
  fireEvent.click(referral)
  expect(screen.getByDisplayValue(offer)).toBeTruthy()
})
