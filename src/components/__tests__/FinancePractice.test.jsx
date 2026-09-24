// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import QuickSetupCard from '../practice/QuickSetupCard'
import SessionSetupFields from '../practice/SessionSetupFields'
import FinanceObservations from '../practice/FinanceObservations'
import { fetchFinancePracticeSupport } from '../../lib/practiceFinance'
import { SKILLS_BY_CATEGORY, validateSessionSetup } from '../../data/practiceModes'
import { resolveGuide } from '../../lib/guidedPractice'

vi.mock('../../lib/practiceFinance', () => ({ fetchFinancePracticeSupport: vi.fn() }))
beforeEach(() => fetchFinancePracticeSupport.mockResolvedValue({ supported: true }))
afterEach(cleanup)

it('groups types under career direction and preserves consulting choices', async () => {
  const publish = vi.fn()
  render(<QuickSetupCard onPublish={publish} />)
  expect(screen.queryByRole('button', { name: 'Core technical' })).toBeNull()
  screen.getAllByRole('button', { name: 'Case' }).forEach(button => fireEvent.click(button))
  fireEvent.click(screen.getByRole('button', { name: 'Finance' }))
  await vi.waitFor(() => expect(screen.getAllByRole('button', { name: 'Core technical' })[0].disabled).toBe(false))
  expect(screen.queryByRole('button', { name: 'Case' })).toBeNull()
  screen.getAllByRole('button', { name: 'Core technical' }).forEach(button => fireEvent.click(button))
  fireEvent.click(screen.getByRole('button', { name: 'Find my teammate →' }))
  expect(publish.mock.calls[0][0].wantTypes).toEqual(['case','finance'])
  fireEvent.click(screen.getByRole('button', { name: 'Consulting' }))
  expect(screen.getAllByRole('button', { name: '✓ Case' })).toHaveLength(2)
})

it('does not let the member choose finance on a server without the migration', async () => {
  fetchFinancePracticeSupport.mockResolvedValue({ supported: false })
  render(<QuickSetupCard onPublish={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Finance' }))
  await screen.findByText(/Finance practice is not enabled yet/)
  expect(screen.getAllByRole('button', { name: 'Core technical' }).every(b => b.disabled)).toBe(true)
  expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
})

it('schedules a finance drill with only the selected category skills', async () => {
  function Form() {
    const [value, setValue] = useState({ mode: 'quick_skill_drill', category: 'case', skillFocus: 'structuring' })
    return <><SessionSetupFields value={value} onChange={setValue} /><output>{JSON.stringify(value)}</output></>
  }
  render(<Form />)
  fireEvent.click(screen.getByRole('button', { name: 'Finance' }))
  await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Debt & lending' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Debt & lending' }))
  expect(screen.queryByRole('button', { name: 'Structuring' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Underwriting' }))
  expect(document.querySelector('output').textContent).toContain('finance_underwriting')
})

it('records only explicit observations for rated finance topics', () => {
  const change = vi.fn()
  render(<FinanceObservations category="finance" ratings={{finance_dcf:4}} value={{}} onChange={change} />)
  const group = screen.getByRole('group', {name:'DCF'})
  expect(within(group).getAllByRole('checkbox').every(b => !b.checked)).toBe(true)
  fireEvent.click(within(group).getByRole('checkbox', {name:/WHY/}))
  expect(change).toHaveBeenCalledWith({finance_dcf:['why']})
})

it('has valid session agreements and guides for every finance skill', () => {
  for (const [category, skills] of Object.entries(SKILLS_BY_CATEGORY).filter(([key]) => key.startsWith('finance'))) {
    for (const skill of skills) {
      expect(validateSessionSetup({mode:'quick_skill_drill',category,skillFocus:skill.key}).ok).toBe(true)
      expect(resolveGuide({session_mode:'quick_skill_drill',interview_category:category,skill_focus:skill.key})).toBeTruthy()
    }
    expect(resolveGuide({session_mode:'full_mock_swap',interview_category:category})).toBeTruthy()
  }
  expect(validateSessionSetup({mode:'quick_skill_drill',category:'finance',skillFocus:'leadership'}).ok).toBe(false)
})
