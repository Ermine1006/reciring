// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import RecommendationPreferences from '../practice/RecommendationPreferences'
import QuickSetupCard from '../practice/QuickSetupCard'
import { practicePreferenceDraft } from '../practice/PracticePreferenceFields'

afterEach(cleanup)
it('publishes future weekday evenings and lets users clear availability', () => {
  const publish = vi.fn()
  render(<QuickSetupCard onPublish={publish} />)
  screen.getAllByRole('button', { name: 'Case' }).forEach(button => fireEvent.click(button))
  fireEvent.click(screen.getByRole('button', { name: /Add preferred times/ }))
  expect(document.querySelector('input[type="date"]')).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: /Weekday evenings/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Find my teammate →' }))
  expect(publish.mock.calls[0][0].windows).toHaveLength(3)
  for (const window of publish.mock.calls[0][0].windows) {
    expect(new Date(window.starts_at).getTime()).toBeGreaterThan(Date.now())
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hour: 'numeric', hour12: false }).format(new Date(window.starts_at))).toBe('18')
  }
  fireEvent.click(screen.getByRole('radio', { name: /Pick exact times/ }))
  expect(document.querySelector('input[type="date"]')).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: /Decide together/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Find my teammate →' }))
  expect(publish.mock.calls[1][0].windows).toEqual([])
})
it('returns focus and preserves a draft when the preferences sheet closes', () => {
  render(<RecommendationPreferences value={{ focus_skills: [], support_skills: [] }} request={{want_types:['case'],help_types:['case']}} />)
  const trigger = screen.getByRole('button', { name: /Personalise my practice/ })
  trigger.focus()
  fireEvent.click(trigger)
  fireEvent.click(within(screen.getByRole('group', {name: 'What would you like to work on?'})).getByRole('button', {name: 'Structuring'}))
  fireEvent.click(screen.getByRole('button', {name: 'Close preferences'}))
  expect(document.activeElement).toBe(trigger)
  expect(document.body.style.overflow).not.toBe('hidden')
  fireEvent.click(trigger)
  expect(screen.getByRole('button', {name: '✓ Structuring'}).getAttribute('aria-pressed')).toBe('true')
})
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
it('lets users choose missing types inside personalisation and immediately shows skills', () => {
  const publish = vi.fn()
  render(<QuickSetupCard preferenceValue={value} onPublish={publish} />)
  fireEvent.click(screen.getByText('Personalise my practice · Optional'))
  expect(document.querySelector('fieldset')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Confirm choices' })).toBeNull()
  const panel = within(screen.getByText('Personalise my practice · Optional').closest('details'))
  fireEvent.click(panel.getAllByRole('button', { name: 'Case' })[0])
  expect(screen.getByRole('button', { name: '✓ Case' }).getAttribute('aria-pressed')).toBe('true')
  expect(document.querySelector('fieldset')).toBeNull()
  fireEvent.click(panel.getByRole('button', { name: 'Behavioural' }))
  expect(screen.getByRole('group', { name: 'What would you like to work on?' })).toBeTruthy()
  expect(screen.getByRole('combobox', { name: 'Case interview' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Choose practice types' })).toBeNull()
  fireEvent.click(focusButton('Synthesis'))
  fireEvent.click(screen.getByRole('button', { name: 'Story selection' }))
  fireEvent.click(screen.getByRole('button', { name: 'Find my teammate →' }))
  expect(publish).toHaveBeenCalledWith(expect.objectContaining({
    wantTypes: ['case'], helpTypes: ['behavioural'],
    preferences: expect.objectContaining({ focus_skills: ['synthesis'], support_skills: ['story_selection'] }),
  }))
})
it('confirms optional choices locally and cancels later edits without publishing', () => {
  const publish = vi.fn()
  render(<QuickSetupCard preferenceValue={value} onPublish={publish} />)
  screen.getAllByRole('button', { name: 'Case' }).forEach(button => fireEvent.click(button))
  const summary = screen.getByText('Personalise my practice · Optional')
  fireEvent.click(summary)
  fireEvent.click(focusButton('Synthesis'))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm choices' }))
  expect(publish).not.toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toContain('Saved when you select Find my teammate')
  expect(summary.closest('details').open).toBe(false)
  fireEvent.click(summary)
  fireEvent.click(focusButton('Communication'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('status').textContent).toContain('Changes cancelled')
  fireEvent.click(screen.getByRole('button', { name: 'Find my teammate →' }))
  expect(publish.mock.calls[0][0].preferences.focus_skills).toEqual(['synthesis'])
})

it('saves Leadership in both case preference fields and excludes it from behavioural', async () => {
 const save = vi.fn().mockResolvedValue({})
 const { rerender } = render(<RecommendationPreferences value={value} request={{want_types:['case'],help_types:['case']}} onSave={save} />)
 fireEvent.click(screen.getByText('Personalise my practice'))
 for (const group of ['What would you like to work on?', 'What can you help a partner with?']) {
   fireEvent.click(within(screen.getByRole('group', {name:group})).getByRole('button', {name:'Leadership'}))
 }
 fireEvent.click(screen.getByRole('button', {name:'Save & refresh recommendations'}))
 expect(save).toHaveBeenCalledWith(expect.objectContaining({focus_skills:['leadership'],support_skills:['leadership']}))
 await screen.findByText('Preferences saved.')
 rerender(<RecommendationPreferences value={value} request={{want_types:['behavioural'],help_types:['behavioural']}} onSave={save} />)
 expect(screen.queryByRole('button', {name:/Leadership/})).toBeNull()
})
