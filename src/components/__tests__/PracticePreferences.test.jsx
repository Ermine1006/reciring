// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import RecommendationPreferences from '../practice/RecommendationPreferences'
import QuickSetupCard from '../practice/QuickSetupCard'
import { practicePreferenceDraft } from '../practice/PracticePreferenceFields'

afterEach(cleanup)
const value = { support_skills: [], focus_skills: [], share_response: false, prior_practice_supported: true, prior_practice: {} }
const request = { want_types: ['case', 'behavioural'], help_types: ['case'] }
function focusButton(name) {
  return within(screen.getByRole('group', { name: 'What would you like to work on?' })).getByRole('button', { name })
}
it('caps focus at three, lets users deselect, and saves baseline separately with sharing off', async () => {
  const save = vi.fn().mockResolvedValue({})
  render(<RecommendationPreferences value={value} request={request} onSave={save} />)
  fireEvent.click(screen.getByText('Personalise my practice'))
  for (const name of ['Structuring', 'Synthesis', 'Communication']) fireEvent.click(focusButton(name))
  expect(focusButton('Problem clarification').disabled).toBe(true)
  fireEvent.click(focusButton('✓ Communication'))
  fireEvent.click(focusButton('Story selection'))
  fireEvent.change(screen.getByRole('combobox', { name: 'Case interview' }), { target: { value: '5_to_10' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save & refresh recommendations' }))
  expect(save).toHaveBeenCalledWith({ ...value, focus_skills: ['structuring', 'synthesis', 'story_selection'], prior_practice: { case: '5_to_10' } })
  await screen.findByText('Preferences saved.')
})
it('preserves unsaved choices during polling and a failed save, then allows retry', async () => {
  const save = vi.fn().mockResolvedValue({ error: new Error('offline') })
  const { rerender } = render(<RecommendationPreferences value={value} request={request} onSave={save} />)
  fireEvent.click(screen.getByText('Personalise my practice'))
  fireEvent.click(focusButton('Synthesis'))
  rerender(<RecommendationPreferences value={{ ...value }} request={{ ...request }} onSave={save} />)
  expect(focusButton('✓ Synthesis').getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Save & refresh recommendations' }))
  await screen.findByText('Could not save. Your choices are still here. Please try again.')
  expect(focusButton('✓ Synthesis').getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Save & refresh recommendations' }).disabled).toBe(false)
})
it('filters out obsolete skills but never treats self reported volume as verified', () => {
  expect(practicePreferenceDraft({ ...value, support_skills: ['concision', 'synthesis'], focus_skills: ['concision'] }, { want_types: ['case'], help_types: ['case'] }))
    .toEqual({ ...value, support_skills: ['synthesis'] })
})
it('only offers starting experience on supported servers and permits clearing it', () => {
  const { rerender } = render(<RecommendationPreferences value={{ ...value, prior_practice_supported: false }} request={request} />)
  fireEvent.click(screen.getByText('Personalise my practice'))
  expect(screen.queryByRole('combobox')).toBeNull()
  rerender(<RecommendationPreferences value={{ ...value, prior_practice: { case: '5_to_10' } }} request={request} />)
  expect(screen.getByRole('combobox', { name: 'Case interview' }).value).toBe('5_to_10')
  fireEvent.change(screen.getByRole('combobox', { name: 'Case interview' }), { target: { value: '' } })
  expect(screen.getByRole('combobox', { name: 'Case interview' }).value).toBe('')
})
it('provides direct links for types and times', () => {
  const types = vi.fn(), times = vi.fn()
  render(<RecommendationPreferences value={value} request={request} onEditTypes={types} onTimes={times} />)
  fireEvent.click(screen.getByText('Personalise my practice'))
  fireEvent.click(screen.getByRole('button', { name: 'Change practice types' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit available times' }))
  expect(types).toHaveBeenCalledOnce(); expect(times).toHaveBeenCalledOnce()
})
it('allows optional skills and starting experience before the first request', () => {
  const publish = vi.fn()
  render(<QuickSetupCard preferenceValue={value} onPublish={publish} />)
  const cases = screen.getAllByRole('button', { name: 'Case' })
  cases.forEach(button => fireEvent.click(button))
  fireEvent.click(screen.getByText('Personalise my practice · Optional'))
  fireEvent.click(focusButton('Synthesis'))
  fireEvent.change(screen.getByRole('combobox', { name: 'Case interview' }), { target: { value: '11_to_20' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find my teammate →' }))
  expect(publish).toHaveBeenCalledWith({ wantTypes: ['case'], helpTypes: ['case'], windows: [],
    preferences: { ...value, focus_skills: ['synthesis'], prior_practice: { case: '11_to_20' } } })
})
