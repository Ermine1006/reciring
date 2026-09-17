// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PracticeQuest from '../practice/PracticeQuest'
vi.mock('../practice/PartnerCard', () => ({ default: () => <div>Live recommendation</div> }))
vi.mock('../practice/InvitationsList', () => ({ default: () => null }))
afterEach(cleanup)
const base = { request: null, rows: [], pairings: [], names: {}, passport: { verified: 2, partners: 2 }, onPublish: vi.fn(), onProgress: vi.fn() }
it('starts with quest selection and keeps progress server sourced', () => {
 render(<PracticeQuest {...base} />)
 expect(screen.getByText('2 completed')).toBeTruthy()
 expect(screen.getByText('Pick your quest')).toBeTruthy()
 expect(screen.getByRole('button', { name: 'Find my teammate →' }).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button', { name: /Grow together/ }))
 expect(screen.getByText('2 verified sessions · 2 teammates')).toBeTruthy()
})
it('opens the existing platform messages using the real match ID', () => {
 const chat=vi.fn(), practice=vi.fn()
 render(<PracticeQuest {...base} request={{ want_types: ['case'] }} pairings={[{id:'pair',status:'accepted',match_id:'match',counterpart_user_id:'peer'}]} names={{peer:'Maya'}} onChat={chat} onPractice={practice} />)
 fireEvent.click(screen.getByRole('button', {name:'Open Messages ↗'}))
 expect(chat).toHaveBeenCalledWith('match')
 expect(screen.queryByRole('textbox')).toBeNull()
 fireEvent.click(screen.getByRole('button', {name:'Continue practice →'}))
 expect(practice).toHaveBeenCalledWith('pair')
})
it('shows a real empty pool instead of invented people or reliability scores', () => {
 render(<PracticeQuest {...base} request={{want_types:['case']}} />)
 expect(screen.getByText('No new practice matches right now')).toBeTruthy()
 expect(screen.queryByText(/response rate|9 of 10/)).toBeNull()
})

it('separates fetch errors from a genuine empty pool', () => {
 const retry = vi.fn()
 render(<PracticeQuest {...base} request={{want_types:['case']}} browseError onRetry={retry} />)
 expect(screen.queryByText('No new practice matches right now')).toBeNull()
 fireEvent.click(screen.getByRole('button', {name:'Try again'}))
 expect(retry).toHaveBeenCalledOnce()
})
it('directs already matched people to their existing partnership', () => {
 render(<PracticeQuest {...base} request={{want_types:['case']}} pairings={[{id:'p',status:'accepted',match_id:'m'}]} />)
 fireEvent.click(screen.getByRole('button',{name:/Find your teammate/}))
 expect(screen.getByText('Your teammate is already matched')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Open my teammates'}))
 expect(screen.getByRole('button',{name:'Open Messages ↗'})).toBeTruthy()
})
