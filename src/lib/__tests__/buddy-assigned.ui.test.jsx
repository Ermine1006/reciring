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

it('lets an upper year withdraw a pending school pairing without touching confirmed Buddies',async()=>{
 let withdrawn=false
 const rpc=vi.fn(async(name,args)=>{
  if(name==='buddy_assigned_withdraw'){
   expect(args).toEqual({p_pair:'pending-pair'})
   withdrawn=true
   return null
  }
  return {pairs:withdrawn?[
   {id:'confirmed-pair',name:'Milan',status:'confirmed',requests:[]}
  ]:[
   {id:'pending-pair',name:'Arza',status:'pending',requests:[]},
   {id:'confirmed-pair',name:'Milan',status:'confirmed',requests:[]}
  ]}
 })
 const confirmSpy=vi.spyOn(window,'confirm').mockReturnValue(true)
 render(<BuddyAssigned role="upper" program="p" rpc={rpc}/>)
 expect(await screen.findByText('Arza')).toBeTruthy()
 expect(screen.getByText('Awaiting confirmation')).toBeTruthy()
 const withdraw=screen.getByRole('button',{name:'Withdraw pairing'})
 fireEvent.click(withdraw)
 await waitFor(()=>expect(rpc).toHaveBeenCalledWith('buddy_assigned_withdraw',{p_pair:'pending-pair'}))
 await waitFor(()=>expect(screen.queryByText('Arza')).toBeNull())
 expect(screen.getByText('Milan')).toBeTruthy()
 expect(screen.queryAllByRole('button',{name:'Withdraw pairing'})).toHaveLength(0)
 expect(confirmSpy).toHaveBeenCalledWith('Withdraw this pairing request? The student will no longer see it in My Buddy.')
 confirmSpy.mockRestore()
})

it.each(['upper','first'])('opens a confirmed Buddy chat directly for %s without a question',async role=>{
 const onOpenChat=vi.fn(),rpc=vi.fn(async name=>name==='buddy_assigned_open_chat'?{match_id:'chat-sara'}:{pairs:[{id:'sara',name:'Sara',status:'confirmed',requests:[]}]})
 render(<BuddyAssigned role={role} program="p" rpc={rpc} onOpenChat={onOpenChat}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Open chat'}))
 await waitFor(()=>expect(onOpenChat).toHaveBeenCalledWith('chat-sara'))
 expect(rpc).toHaveBeenCalledWith('buddy_assigned_open_chat',{p_pair:'sara'})
 expect(screen.queryByText('No questions yet')).toBeNull()
})
it.each(['pending','declined'])('keeps %s pairings in their confirmation flow',async status=>{
 const rpc=vi.fn(async()=>({pairs:[{id:'sara',name:'Sara',status,requests:[]}]}))
 render(<BuddyAssigned role="upper" program="p" rpc={rpc} onOpenChat={vi.fn()}/>);
 await screen.findByText('Sara');expect(screen.queryByRole('button',{name:'Open chat'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Open →'}))
 expect(rpc).not.toHaveBeenCalledWith('buddy_assigned_open_chat',expect.anything())
})
it('prevents repeated chat requests and lets a failed opening retry',async()=>{
 let reject;const onOpenChat=vi.fn(),rpc=vi.fn(name=>name==='buddy_assigned_open_chat'?new Promise((_,r)=>{reject=r}):Promise.resolve({pairs:[{id:'sara',name:'Sara',status:'confirmed',requests:[]}]}))
 render(<BuddyAssigned role="upper" program="p" rpc={rpc} onOpenChat={onOpenChat}/>);
 const button=await screen.findByRole('button',{name:'Open chat'});fireEvent.click(button);fireEvent.click(button)
 expect(screen.getByRole('button',{name:'Opening chat…'}).disabled).toBe(true)
 expect(rpc.mock.calls.filter(([name])=>name==='buddy_assigned_open_chat')).toHaveLength(1)
 reject(Error('Connection interrupted'));await screen.findByText('Connection interrupted');expect(onOpenChat).not.toHaveBeenCalled()
 rpc.mockImplementation(async()=>({match_id:'chat-sara'}));fireEvent.click(screen.getByRole('button',{name:'Open chat'}))
 await waitFor(()=>expect(onOpenChat).toHaveBeenCalledWith('chat-sara'))
})
it('keeps existing questions accessible alongside the direct chat',async()=>{
 const rpc=vi.fn(async()=>({pairs:[{id:'sara',name:'Sara',status:'confirmed',requests:[{id:'r',body:'Help?',resolved:false,replied:false,replies:[]}]}]}))
 render(<BuddyAssigned role="upper" program="p" rpc={rpc} onOpenChat={vi.fn()}/>);
 await screen.findByRole('button',{name:'Open chat'});fireEvent.click(screen.getByRole('button',{name:'Reply to question'}))
 expect(screen.getByLabelText('Your reply')).toBeTruthy()
})
