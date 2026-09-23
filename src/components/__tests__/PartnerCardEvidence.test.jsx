// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import PartnerCard from '../practice/PartnerCard'
afterEach(cleanup)
const base={request_id:'r',want_types:['case'],help_types:['case'],windows:[]}
it('shows truthful history and peer badges while preserving invitation actions',()=>{
 const invite=vi.fn();render(<PartnerCard row={{...base,recommendation:{practice_history:{sessions:12,partners:6},peer_strengths:[{skill:'responsive',partners:4}],response_record:{total:10,prompt:8}}}} myRequest={base} onInvite={invite}/>);
 expect(screen.getByText('12')).toBeTruthy();expect(screen.getByText(/✓ Responsive/)).toBeTruthy();expect(screen.getByText('Answered 8 of 10 invitations within 48h')).toBeTruthy();
 fireEvent.click(screen.getByText('Invite to practise'));expect(invite).toHaveBeenCalledWith(expect.objectContaining({request_id:'r'}),null)
})
it('does not turn unavailable or unshared history into a zero record',()=>{
 render(<PartnerCard row={base} myRequest={base} onInvite={vi.fn()}/>);expect(screen.queryByText('practices completed')).toBeNull();expect(screen.getByText('No shared partner feedback yet')).toBeTruthy();expect(screen.queryByText(/Self selected/)).toBeNull()
})
it('explains the selected category rather than a different saved focus',()=>{
 render(<PartnerCard row={{...base,help_types:['case','behavioural'],recommendation:{relevant_skills:['synthesis']}}}
   myRequest={{want_types:['behavioural'],help_types:['case']}} onInvite={vi.fn()}/>);
 expect(screen.getByText(/They can support your behavioural practice/)).toBeTruthy()
 expect(screen.queryByText(/your focus: Synthesis/)).toBeNull()
})
