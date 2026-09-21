// @vitest-environment jsdom
import React from 'react'
import {afterEach,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import BuddyAssigned,{parseBuddyList} from '../../components/buddy/BuddyAssigned'
import BuddyAssignedDemo from '../../components/buddy/BuddyAssignedDemo'
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({profile:null})}))
afterEach(()=>cleanup())
it('parses and deduplicates school assignment emails without looking up accounts',()=>{
 expect(parseBuddyList('Milan Patel <milank.patel@rotman.utoronto.ca>\nMilan <MILANK.PATEL@rotman.utoronto.ca>')).toEqual([{name:'Milan Patel',email:'milank.patel@rotman.utoronto.ca'}])
 expect(()=>parseBuddyList('no email')).toThrow('school email')
})
it('leaves a failed reply in the draft and reports the error',async()=>{
 const rpc=vi.fn(async(name)=>{if(name==='buddy_assigned_reply')throw Error('Connection interrupted');return {pairs:[{id:'p',name:'Milan',status:'confirmed',requests:[{id:'r',body:'Help?',resolved:false,replied:false,replies:[]}]}]}})
 render(<BuddyAssigned role="upper" program="p" rpc={rpc}/>);fireEvent.click(await screen.findByRole('button',{name:'Reply →'}));fireEvent.change(screen.getByLabelText('Your reply'),{target:{value:'A useful reply'}});fireEvent.click(screen.getByRole('button',{name:'Send reply →'}));await screen.findByText('Connection interrupted');expect(screen.getByLabelText('Your reply').value).toBe('A useful reply')
})
it('runs the isolated demo from adding a roster to confirmation, question, reply and resolution',async()=>{
 render(<BuddyAssignedDemo onBack={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Add my Buddies →'}));expect(screen.getByLabelText('School names and emails').value).toContain('thomas.peng@rotman.utoronto.ca');fireEvent.click(screen.getByRole('button',{name:'Review my Buddies →'}));fireEvent.click(screen.getByRole('button',{name:'Add 3 Buddies'}));await screen.findByText('Milan Patel')
 fireEvent.change(screen.getByLabelText('Demo perspective'),{target:{value:'first'}});fireEvent.click(await screen.findByRole('button',{name:'Confirm',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Confirm my Buddy'}));fireEvent.click(await screen.findByRole('button',{name:'Ask my Buddy'}));fireEvent.change(screen.getByLabelText('What would help?'),{target:{value:'How do I prepare?'}});fireEvent.click(screen.getByRole('button',{name:'Send question →'}));await screen.findByText('Question sent.')
 fireEvent.change(screen.getByLabelText('Demo perspective'),{target:{value:'upper'}});fireEvent.click(await screen.findByRole('button',{name:'Reply →'}));fireEvent.click(screen.getByRole('button',{name:'Suggest a quick chat'}));fireEvent.click(screen.getByRole('button',{name:'Send reply →'}));await screen.findByText('Reply sent.')
 fireEvent.change(screen.getByLabelText('Demo perspective'),{target:{value:'first'}});fireEvent.click(await screen.findByRole('button',{name:'Open →'}));await screen.findByText(/Happy to help/);fireEvent.click(screen.getByRole('button',{name:'This helped ✓'}));await screen.findByText('Marked resolved by the student.')
})
