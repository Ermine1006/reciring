// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import SessionMeetingLinkEditor from '../practice/SessionMeetingLinkEditor'
const {save}=vi.hoisted(()=>({save:vi.fn()}))
vi.mock('../../lib/practice',()=>({updatePracticeMeetingLink:save}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const session={id:'session',status:'scheduled',location_type:'virtual'}
it('saves directly on the card and refreshes the shared session',async()=>{
 save.mockResolvedValue({error:null});const reload=vi.fn();render(<SessionMeetingLinkEditor session={session} onSaved={reload}/>);
 fireEvent.click(screen.getByText('Add meeting link'));fireEvent.change(screen.getByLabelText('Virtual meeting link'),{target:{value:'https://zoom.us/j/123'}});fireEvent.click(screen.getByText('Save meeting link'));
 await screen.findByText('Add meeting link');expect(save).toHaveBeenCalledWith('session','https://zoom.us/j/123');expect(reload).toHaveBeenCalledTimes(1)
})
it('rejects lookalike hosts and keeps the input available',()=>{
 render(<SessionMeetingLinkEditor session={session}/>);fireEvent.click(screen.getByText('Add meeting link'));fireEvent.change(screen.getByLabelText('Virtual meeting link'),{target:{value:'https://zoom.us.evil.test/j/1'}});fireEvent.click(screen.getByText('Save meeting link'));expect(screen.getByRole('alert')).toBeTruthy();expect(save).not.toHaveBeenCalled()
})
it('explains a missing migration without pretending to save',async()=>{
 save.mockResolvedValue({error:{code:'PGRST202'}});render(<SessionMeetingLinkEditor session={session}/>);fireEvent.click(screen.getByText('Add meeting link'));fireEvent.change(screen.getByLabelText('Virtual meeting link'),{target:{value:'https://meet.google.com/abc-defg-hij'}});fireEvent.click(screen.getByText('Save meeting link'));expect((await screen.findByRole('alert')).textContent).toContain('not available yet')
})
