// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import SessionTimeChange from '../practice/SessionTimeChange'
const mocks=vi.hoisted(()=>({propose:vi.fn(),respond:vi.fn()}))
vi.mock('../../lib/practice',()=>({proposePracticeTimeChange:mocks.propose,respondPracticeTimeChange:mocks.respond}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const session={id:'s',scheduled_start:'2099-09-30T16:00:00Z',duration_minutes:60,timezone:'America/Toronto'}
it('prefills existing local time and sends a proposal without modifying the current booking',async()=>{
 mocks.propose.mockResolvedValue({});const reload=vi.fn();render(<SessionTimeChange session={session} currentUserId="a" onSaved={reload}/>);fireEvent.click(screen.getByText('Suggest a new time'));
 expect(screen.getByLabelText('Time').value).toBe('12:00');fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2099-10-01'}});fireEvent.click(screen.getByText('Send new time'));await screen.findByText('Suggest a new time');expect(mocks.propose).toHaveBeenCalledWith('s','2099-10-01T16:00:00.000Z');expect(reload).toHaveBeenCalled()
})
it('allows only the recipient to accept and passes the displayed proposal ID',async()=>{
 mocks.respond.mockResolvedValue({});render(<SessionTimeChange session={{...session,time_change_id:'change',time_change_by:'a',time_change_start:'2099-10-01T16:00:00Z'}} currentUserId="b" onSaved={vi.fn()}/>);fireEvent.click(screen.getByText('Accept new time'));expect(mocks.respond).toHaveBeenCalledWith('s','change',true)
})
it('lets the sender withdraw but does not show self acceptance',()=>{
 render(<SessionTimeChange session={{...session,time_change_id:'change',time_change_by:'a',time_change_start:'2099-10-01T16:00:00Z'}} currentUserId="a"/>);expect(screen.queryByText('Accept new time')).toBeNull();expect(screen.getByText('Withdraw proposal')).toBeTruthy()
})
