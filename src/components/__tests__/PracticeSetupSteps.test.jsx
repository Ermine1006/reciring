// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import PracticeSetupFlow from '../practice/PracticeSetupFlow'

afterEach(cleanup)

const noop = () => {}

function openFlow(props = {}) {
  const onSave = vi.fn()
  render(<PracticeSetupFlow onSave={onSave} onCancel={noop} {...props} />)
  return onSave
}

/** Pick both practice questions on step 1 and continue to step 2. */
function chip(groupLabel, chipName) {
  return within(screen.getByRole('group', { name: groupLabel }))
    .getByRole('button', { name: chipName })
}

function completeStepOne() {
  fireEvent.click(chip('You want to practise', /Case interview/))
  fireEvent.click(chip('You can run a round on', /Behavioural/))
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
}

describe('practice setup, two steps', () => {
  it('asks both practice questions on one screen', () => {
    openFlow()
    expect(screen.getByText('Step 1 of 2')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'You want to practise' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'You can run a round on' })).toBeTruthy()
  })

  it('will not continue until the member can also give a round', () => {
    openFlow()
    fireEvent.click(chip('You want to practise', /Case interview/))
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    expect(screen.getByRole('alert').textContent).toContain('Both people practise, both people help!')
    expect(screen.getByText('Step 1 of 2')).toBeTruthy()
  })

  it('offers availability as one tap, with typing kept as a choice', () => {
    openFlow()
    completeStepOne()
    expect(screen.getByText('Step 2 of 2')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Weekday evenings this week/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Pick exact times/ })).toBeTruthy()
    // The typed date fields stay out of the way until asked for.
    expect(document.querySelector('input[type="date"]')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Pick exact times/ }))
    expect(document.querySelector('input[type="date"]')).toBeTruthy()
  })

  it('publishes real windows from the chosen preset', () => {
    const onSave = openFlow()
    completeStepOne()
    fireEvent.click(screen.getByRole('button', { name: /Publish and find partners/ }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0]
    expect(payload.wantTypes).toEqual(['case'])
    expect(payload.helpTypes).toEqual(['behavioural'])
    expect(payload.windows.length).toBeGreaterThan(0)
    for (const w of payload.windows) {
      expect(new Date(w.starts_at).getTime()).toBeGreaterThan(Date.now())
      expect(new Date(w.ends_at).getTime()).toBeGreaterThan(new Date(w.starts_at).getTime())
    }
  })

  it('lets someone publish without naming any time at all', () => {
    const onSave = openFlow()
    completeStepOne()
    fireEvent.click(screen.getByRole('radio', { name: /Pick exact times/ }))
    fireEvent.click(screen.getByRole('button', { name: /Publish and find partners/ }))
    expect(onSave.mock.calls[0][0].windows).toEqual([])
  })

  it('sends a member who came to fix their times straight to that step', () => {
    // Callers still deep-link with the old step-3 id for availability.
    openFlow({ existing: { want_types: ['case'], help_types: ['behavioural'], timezone: 'America/Toronto' }, initialStep: 3 })
    expect(screen.getByText('Step 2 of 2')).toBeTruthy()
  })
})
