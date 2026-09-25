// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import QuickSetupCard from '../practice/QuickSetupCard'

// Finance practice is gated behind a support probe; these tests are
// about what happens to the SELECTIONS, so the gate is simply open.
vi.mock('../../lib/practiceFinance', () => ({
  fetchFinancePracticeSupport: () => Promise.resolve({ supported: true }),
}))

afterEach(cleanup)

const group = (label) => within(screen.getByRole('group', { name: label }))
const direction = (name) =>
  fireEvent.click(within(screen.getByRole('region', { name: 'Career direction' })).getByRole('button', { name }))

/** Finance chips stay disabled until the support probe answers. */
async function pickFinance(label) {
  const chip = () => group(label).getAllByRole('button')[0]
  await waitFor(() => expect(chip().disabled).toBe(false))
  fireEvent.click(chip())
}

// Practising across both directions is deliberate: someone recruiting
// for consulting AND finance keeps both. What was wrong is that the
// direction you switched away from went INVISIBLE while still being
// saved, so it silently drove the skills shown on later screens and
// could not be undone.
describe('a type picked under the other direction', () => {
  it('stays visible after switching, labelled with where it came from', async () => {
    render(<QuickSetupCard onPublish={vi.fn()} />)
    direction('Finance')
    await pickFinance('I want to practise')

    direction('Consulting')
    const kept = group('I want to practise').getByRole('button', { name: /Finance ✕/ })
    expect(kept).toBeTruthy()
    expect(kept.getAttribute('aria-pressed')).toBe('true')
  })

  it('can be removed in one tap from the other direction', async () => {
    const onPublish = vi.fn()
    render(<QuickSetupCard onPublish={onPublish} />)
    direction('Finance')
    await pickFinance('I want to practise')
    await pickFinance('I can help with')

    direction('Consulting')
    fireEvent.click(group('I want to practise').getByRole('button', { name: /Finance ✕/ }))
    fireEvent.click(group('I can help with').getByRole('button', { name: /Finance ✕/ }))
    fireEvent.click(group('I want to practise').getByRole('button', { name: 'Case' }))
    fireEvent.click(group('I can help with').getByRole('button', { name: 'Behavioural' }))
    fireEvent.click(screen.getByRole('button', { name: /Find my teammate/ }))

    const { wantTypes, helpTypes } = onPublish.mock.calls[0][0]
    expect(wantTypes).toEqual(['case'])
    expect(helpTypes).toEqual(['behavioural'])
  })

  it('still publishes both directions when the member keeps both', async () => {
    const onPublish = vi.fn()
    render(<QuickSetupCard onPublish={onPublish} />)
    direction('Finance')
    await pickFinance('I want to practise')
    await pickFinance('I can help with')

    direction('Consulting')
    fireEvent.click(group('I want to practise').getByRole('button', { name: 'Case' }))
    fireEvent.click(group('I can help with').getByRole('button', { name: 'Behavioural' }))
    fireEvent.click(screen.getByRole('button', { name: /Find my teammate/ }))

    expect(onPublish.mock.calls[0][0].wantTypes).toContain('case')
    expect(onPublish.mock.calls[0][0].wantTypes).toHaveLength(2)
  })

  it('shows nothing extra when only one direction was ever used', () => {
    render(<QuickSetupCard onPublish={vi.fn()} />)
    fireEvent.click(group('I want to practise').getByRole('button', { name: 'Case' }))
    expect(group('I want to practise').queryByRole('button', { name: /✕/ })).toBeNull()
  })
})
