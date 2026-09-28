// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import PracticeGarden, { gardenCandidates } from '../practice/PracticeGarden'

vi.mock('../practice/PartnerCard', () => ({ default: ({ row, onInvite, heading }) =>
  <div><span>{heading}</span><button type="button" onClick={() => onInvite?.(row, null)}>Invite {row.request_id}</button></div> }))

const request = { want_types: ['case', 'behavioural'], help_types: ['case'] }
const rows = [
  { request_id: 'ranked-first', help_types: ['behavioural'], want_types: ['case'] },
  { request_id: 'ranked-second', help_types: ['case'], want_types: ['case'] },
  { request_id: 'not-reciprocal', help_types: ['case'], want_types: ['behavioural'] },
]

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

const revealTop = () => act(() => vi.advanceTimersByTime(500))

it('preserves server order and filters only real reciprocal candidates', () => {
  expect(gardenCandidates(rows, request, 'all').map(r => r.request_id)).toEqual(['ranked-first', 'ranked-second'])
  expect(gardenCandidates(rows, request, 'case').map(r => r.request_id)).toEqual(['ranked-second'])
  expect(gardenCandidates(rows, { ...request, want_types: ['case'] }, 'behavioural')).toEqual([])
})

it('shows the garden first and automatically surfaces the top real match', () => {
  render(<PracticeGarden rows={rows} request={request} />)
  expect(screen.getByText('Your practice garden')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Open top match' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Open teammate 2' })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  revealTop()
  expect(screen.getByRole('dialog').textContent).toContain('Top match for you')
  expect(screen.getByText('Invite ranked-first')).toBeTruthy()
})

it('lets the user close the recommendation and tap another existing avatar', () => {
  render(<PracticeGarden rows={rows} request={request} />)
  revealTop()
  fireEvent.click(screen.getByRole('button', { name: 'Close teammate card' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open teammate 2' }))
  expect(screen.getByRole('dialog').textContent).toContain('Meet this teammate')
  expect(screen.getByText('Invite ranked-second')).toBeTruthy()
})

it('moves through recommendations without changing invitation payloads', () => {
  const invite = vi.fn()
  render(<PracticeGarden rows={rows} request={request} onInvite={invite} />)
  revealTop()
  fireEvent.click(screen.getByText('Invite ranked-first'))
  expect(invite).toHaveBeenCalledWith(rows[0], null)
  fireEvent.click(screen.getByRole('button', { name: 'See next match' }))
  expect(screen.getByText('Invite ranked-second')).toBeTruthy()
})

it('keeps list view as an efficient alternate view of the same candidates', () => {
  render(<PracticeGarden rows={rows} request={request} />)
  fireEvent.click(screen.getByRole('button', { name: 'List view' }))
  act(() => vi.advanceTimersByTime(500))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getAllByRole('button', { name: /^Invite/ }).map(button => button.textContent))
    .toEqual(['Invite ranked-first', 'Invite ranked-second'])
  fireEvent.click(screen.getByRole('button', { name: 'Garden view' }))
  expect(screen.getByText('Your practice garden')).toBeTruthy()
})

it('updates the real candidates when filters change', () => {
  render(<PracticeGarden rows={rows} request={request} />)
  fireEvent.click(screen.getByRole('button', { name: 'Case' }))
  expect(screen.queryByRole('button', { name: 'Open teammate 2' })).toBeNull()
  revealTop()
  expect(screen.getByText('Invite ranked-second')).toBeTruthy()
})

it('closes a profile if polling removes that candidate', () => {
  const { rerender } = render(<PracticeGarden rows={rows} request={request} />)
  revealTop()
  expect(screen.getByText('Invite ranked-first')).toBeTruthy()
  rerender(<PracticeGarden rows={rows.slice(1)} request={request} />)
  expect(screen.queryByText('Invite ranked-first')).toBeNull()
})

it('resets the top recommendation when saved preferences reorder the pool', () => {
  const { rerender } = render(<PracticeGarden rows={rows} request={request} resetKey="old" />)
  revealTop()
  expect(screen.getByText('Invite ranked-first')).toBeTruthy()
  rerender(<PracticeGarden rows={[rows[1], rows[0]]} request={request} resetKey="new" />)
  revealTop()
  expect(screen.getByText('Invite ranked-second')).toBeTruthy()
})

it('uses the existing AnonymousAvatar component for every visible teammate', () => {
  render(<PracticeGarden rows={rows} request={request} />)
  const avatars = document.querySelectorAll('.garden-avatar-shell svg')
  expect(avatars).toHaveLength(2)
  expect([...avatars].every(svg => svg.getAttribute('viewBox') === '0 0 64 64')).toBe(true)
})

it('falls back gracefully if the garden illustration fails', () => {
  render(<PracticeGarden rows={rows} request={request} />)
  fireEvent.error(document.querySelector('.garden-stage img'))
  expect(document.querySelector('.garden-stage img')).toBeNull()
  expect(screen.getByRole('button', { name: 'Open top match' })).toBeTruthy()
})
