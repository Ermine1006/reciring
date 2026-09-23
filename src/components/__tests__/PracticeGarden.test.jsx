// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import PracticeGarden, { gardenCandidates } from '../practice/PracticeGarden'
import { avatarAppearance } from '../AnonymousAvatar'
import PRESET_AVATARS from '../../data/presetAvatars'

vi.mock('../practice/PartnerCard', () => ({ default: ({ row, onInvite }) =>
  <button type="button" onClick={() => onInvite(row, null)}>Invite {row.request_id}</button> }))
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
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
const walk = name => {
  fireEvent.click(screen.getByRole('button', { name }))
  act(() => vi.advanceTimersByTime(1000))
}

it('filters by what the user wants to practise without reranking or inventing peers', () => {
  expect(gardenCandidates(rows, request, 'all').map(r => r.request_id)).toEqual(['ranked-first', 'ranked-second'])
  expect(gardenCandidates(rows, request, 'case').map(r => r.request_id)).toEqual(['ranked-second'])
  expect(gardenCandidates(rows, { ...request, want_types: ['case'] }, 'behavioural')).toEqual([])
})
it('walks through the server order once and sends the existing invitation payload', () => {
  const invite = vi.fn()
  render(<PracticeGarden rows={rows} request={request} onInvite={invite} />)
  expect(screen.queryByText('Invite ranked-first')).toBeNull()
  walk('Explore the garden')
  fireEvent.click(screen.getByRole('button', { name: 'Invite ranked-first' }))
  expect(invite).toHaveBeenCalledWith(rows[0], null)
  walk('Continue exploring')
  expect(screen.queryByText('Invite ranked-first')).toBeNull()
  expect(screen.getByText('Invite ranked-second')).toBeTruthy()
  expect(screen.getByText('You’ve explored these recommendations.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Meet the next teammate' })).toBeNull()
})

it('opens a dismissible modal and moves through four distinct campus scenes', () => {
  const candidates = Array.from({ length: 4 }, (_, i) => ({ ...rows[1], request_id: `peer-${i}` }))
  render(<PracticeGarden rows={candidates} request={request} />)
  walk('Explore the garden')
  expect(screen.getByRole('dialog').textContent).toContain('Campus garden')
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByRole('button', { name: 'Close teammate card' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement.textContent).toBe('Meet the next teammate')
  walk('Meet the next teammate')
  expect(screen.getByRole('dialog').textContent).toContain('Campus library')
  walk('Continue exploring')
  expect(screen.getByRole('dialog').textContent).toContain('Study room')
  walk('Continue exploring')
  expect(screen.getByRole('dialog').textContent).toContain('Fifth floor patio')
  expect(document.querySelector('.garden-stage img').src).toContain('practice-patio.webp')
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('lets users bypass the walk and keeps list filters real', () => {
  render(<PracticeGarden rows={rows} request={request} />)
  fireEvent.click(screen.getByRole('button', { name: 'List view' }))
  expect(screen.getAllByRole('button', { name: /^Invite/ }).map(button => button.textContent)).toEqual(['Invite ranked-first', 'Invite ranked-second'])
  fireEvent.click(screen.getByRole('button', { name: 'Case' }))
  expect(screen.queryByText('Invite ranked-first')).toBeNull()
  expect(screen.getByText('Invite ranked-second')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Behavioural' }))
  expect(screen.queryByText('Invite ranked-second')).toBeNull()
})
it('reveals immediately with reduced motion', () => {
  window.matchMedia.mockReturnValue({ matches: true })
  render(<PracticeGarden rows={rows} request={request} />)
  fireEvent.click(screen.getByRole('button', { name: 'Explore the garden' }))
  expect(screen.getByText('Invite ranked-first')).toBeTruthy()
  expect(screen.queryByText('Walking…')).toBeNull()
})
it('does not lose the encounter during polling and removes invitations that left the pool', () => {
  const { rerender } = render(<PracticeGarden rows={rows} request={request} />)
  walk('Explore the garden')
  rerender(<PracticeGarden rows={[...rows]} request={{ ...request }} />)
  expect(screen.getByText('Invite ranked-first')).toBeTruthy()
  rerender(<PracticeGarden rows={rows.slice(1)} request={request} />)
  expect(screen.queryByText('Invite ranked-first')).toBeNull()
  walk('Meet the next teammate')
  expect(screen.getByText('Invite ranked-second')).toBeTruthy()
})
it('cancels a stale walk if the candidate disappears or the category changes', () => {
  const { rerender } = render(<PracticeGarden rows={rows} request={request} />)
  fireEvent.click(screen.getByRole('button', { name: 'Explore the garden' }))
  rerender(<PracticeGarden rows={rows.slice(1)} request={request} />)
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.queryByRole('button', { name: /^Invite/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Explore the garden' }))
  fireEvent.click(screen.getByRole('button', { name: 'Behavioural' }))
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.queryByRole('button', { name: /^Invite/ })).toBeNull()
})
it('does not loop an old encounter after saved preferences change', () => {
  const { rerender } = render(<PracticeGarden rows={rows} request={request} resetKey="old" />)
  walk('Explore the garden')
  rerender(<PracticeGarden rows={[rows[1], rows[0]]} request={request} resetKey="new" />)
  expect(screen.queryByText('Invite ranked-first')).toBeNull()
  walk('Explore the garden')
  expect(screen.getByText('Invite ranked-second')).toBeTruthy()
})
it('offers recovery for an unselected type and an image failure', () => {
  const edit = vi.fn()
  render(<PracticeGarden rows={rows} request={{ ...request, want_types: ['case'] }} onPreferences={edit} />)
  fireEvent.error(document.querySelector('.garden-stage img'))
  expect(screen.getByRole('button', { name: 'Explore the garden' }).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Behavioural' }))
  expect(screen.getByText('Add this practice type to your preferences')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Edit practice types' }))
  expect(edit).toHaveBeenCalledOnce()
})

it('uses the selected profile avatar palette and accessory, including live changes', () => {
  const { rerender } = render(<PracticeGarden rows={rows} request={request} avatarSeed="av-12" />)
  expect(document.querySelector('.garden-walker svg').getAttribute('data-avatar-body')).toBe('#FFC0CC')
  for (const avatar of PRESET_AVATARS) {
    rerender(<PracticeGarden rows={rows} request={request} avatarSeed={avatar.seed} />)
    const sprite = document.querySelector('.garden-walker svg')
    const appearance = avatarAppearance(avatar.seed)
    expect(sprite.getAttribute('data-avatar-body')).toBe(appearance.palette.body)
    expect(sprite.getAttribute('data-avatar-accessory')).toBe(String(appearance.accessory))
  }
  rerender(<PracticeGarden rows={rows} request={request} />)
  expect(document.querySelector('.garden-walker svg').getAttribute('data-avatar-body')).toBe('#AADDF8')
})
