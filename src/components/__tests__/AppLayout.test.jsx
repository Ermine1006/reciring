// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppNavigation, MessagesWorkspace } from '../AppLayout'
import MatchesList from '../MatchesList'

afterEach(cleanup)
const tabs = [{ id: 'home', label: 'Home', icon: () => null }, { id: 'discover', label: 'Give & Ask', icon: () => null }]
it('keeps the correct navigation destination for a composer and invokes existing navigation', () => {
  const navigate = vi.fn(), ask = vi.fn()
  render(<AppNavigation tabs={tabs} activeTab="post" postIsDiscover onNavigate={navigate} onAskMutu={ask} />)
  expect(screen.getByRole('button', { name: 'Give & Ask' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('button', { name: 'Home' }))
  expect(navigate).toHaveBeenCalledWith('home')
  fireEvent.click(screen.getByRole('button', { name: 'Ask Mutu' }))
  expect(ask).toHaveBeenCalledTimes(1)
})
it('preserves the Past filter while opening and closing a conversation', () => {
  const completed = new Set(['past'])
  const matches = [{ id: 'active' }, { id: 'past' }]
  function Workspace() {
    const [selected, select] = useState(null)
    return <MessagesWorkspace hasSelection={!!selected} list={<MatchesList matches={matches} completedMatchIds={completed} onOpenChat={select} selectedMatchId={selected} />}>
      <button onClick={() => select(null)}>Back to conversations</button>
    </MessagesWorkspace>
  }
  render(<Workspace />)
  fireEvent.click(screen.getByRole('tab', { name: 'Past' }))
  fireEvent.click(screen.getByRole('button', { name: /Anonymous peer/ }))
  expect(screen.getByRole('button', { name: /Anonymous peer/ }).getAttribute('aria-current')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }))
  expect(screen.getByRole('tab', { name: 'Past' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.getByText('Your conversations')).toBeTruthy()
})
it('uses semantic conversation buttons without revealing an unapproved profile name', () => {
  const open = vi.fn()
  render(<MatchesList matches={[{ id: 'private' }]} peerProfiles={{ private: { first_name: 'Hidden name' } }} onOpenChat={open} />)
  expect(screen.queryByText('Hidden name')).toBeNull()
  const row = screen.getByRole('button', { name: /Anonymous peer/ })
  row.focus()
  expect(document.activeElement).toBe(row)
  fireEvent.click(row)
  expect(open).toHaveBeenCalledWith('private')
})
