// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const auth = vi.hoisted(() => ({ profile: { name: 'Sample', program: 'MBA', industry_interests: ['Finance'], can_help_with: ['Advice'], skills_to_learn: ['Coffee Chat'], avatar_url: null }, user: {} }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../lib/featureFlags', () => ({ isProfileV3Enabled: () => false, isLinkedInEnabled: () => false }))
vi.mock('../profile/useProfileV3', () => ({ useProfileV3: () => ({}) }))
vi.mock('../profile/useLinkedInProfileLink', () => ({ useLinkedInProfileLink: () => ({}) }))
vi.mock('../SettingsPage', () => ({ default: ({ section }) => <div>Editor: {section}</div>, resolveAvatarSeed: value => value?.startsWith('preset:') ? value : null }))
import ProfilePage from '../ProfilePage'
afterEach(cleanup)
it('explains the missing sixth item at 83% and opens its editor', () => {
  render(<ProfilePage />)
  fireEvent.click(screen.getByRole('button', { name: 'Profile 83% complete. View checklist' }))
  const checklist = screen.getByRole('region', { name: 'Profile completion checklist' })
  expect(checklist.textContent).toContain('5 of 6 items complete.')
  expect(checklist.querySelectorAll('button')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: /Choose an avatar.*Add/ }))
  expect(screen.getByText('Editor: basic')).toBeTruthy()
})
it('recalculates to 100% when the saved profile updates', () => {
  const { rerender } = render(<ProfilePage />)
  fireEvent.click(screen.getByRole('button', { name: /Profile 83%/ }))
  const previous = auth.profile
  auth.profile = { ...previous, avatar_url: 'preset:test' }
  rerender(<ProfilePage />)
  expect(screen.getByRole('button', { name: /Profile 100%/ })).toBeTruthy()
  expect(screen.getByText('Your profile is complete')).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Profile completion checklist' }).querySelectorAll('button')).toHaveLength(0)
  auth.profile = previous
})
