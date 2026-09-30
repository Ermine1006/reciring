// @vitest-environment jsdom
import React from 'react'
import {afterEach,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor,act} from '@testing-library/react'
import AssignedBuddyInvitations from '../../components/buddy/AssignedBuddyInvitations'
import BuddyChoiceProgram from '../../components/buddy/BuddyChoiceProgram'
const {api}=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../buddy/api',()=>({buddyRpc:api}))
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({profile:null})}))
HTMLElement.prototype.scrollTo=vi.fn()
afterEach(()=>{cleanup();vi.clearAllMocks()})
const invite={id:'pair',program_id:'rotman',program_name:'Rotman Buddy Program',mentor_name:'Serine',can_accept:true}
const result={program_id:'rotman',pair_id:'pair',status:'confirmed'}

it('automatically shows an existing invitation on mount and can defer it without declining',async()=>{
 const rpc=vi.fn(async()=>({invitations:[invite]}))
 render(<AssignedBuddyInvitations rpc={rpc}/>);
 expect(await screen.findByRole('dialog',{name:'You have an invitation from an upper year Buddy'},{timeout:5000})).toBeTruthy()
 expect(screen.getByText('Serine')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Not now'}))
 expect(screen.queryByRole('dialog')).toBeNull()
 await act(async()=>{window.dispatchEvent(new Event('focus'))})
 expect(screen.queryByRole('dialog')).toBeNull()
 expect(rpc.mock.calls.every(([name])=>name==='buddy_assigned_invitations')).toBe(true)
 render(<AssignedBuddyInvitations program="rotman" presentation="inline" rpc={rpc}/>);
 expect(await screen.findByRole('button',{name:'Accept invitation'})).toBeTruthy()
})
it('accepts once and routes to the confirmed program',async()=>{
 let resolve;const onAccepted=vi.fn()
 const rpc=vi.fn(name=>name==='buddy_assigned_invitations'?Promise.resolve({invitations:[invite]}):new Promise(r=>{resolve=r}))
 render(<AssignedBuddyInvitations rpc={rpc} onAccepted={onAccepted}/>);
 const accept=await screen.findByRole('button',{name:'Accept invitation'});fireEvent.click(accept);fireEvent.click(accept)
 expect(screen.getByRole('button',{name:'Updating…'}).disabled).toBe(true)
 expect(rpc.mock.calls.filter(([name])=>name==='buddy_assigned_respond')).toHaveLength(1)
 await act(async()=>resolve(result))
 await waitFor(()=>expect(onAccepted).toHaveBeenCalledWith(result))
 expect(screen.queryByRole('dialog')).toBeNull()
})
it('declines without opening first year access',async()=>{
 const onAccepted=vi.fn(),rpc=vi.fn(async name=>name==='buddy_assigned_invitations'?{invitations:[invite]}:{...result,status:'declined'})
 render(<AssignedBuddyInvitations rpc={rpc} onAccepted={onAccepted}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Decline'}))
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
 expect(rpc).toHaveBeenCalledWith('buddy_assigned_respond',{p_pair:'pair',p_accept:false})
 expect(onAccepted).not.toHaveBeenCalled()
})
it('preserves a failed invitation action for retry and respects an unavailable account role',async()=>{
 let fail=true
 const rpc=vi.fn(async name=>{
  if(name==='buddy_assigned_invitations')return {invitations:[invite]}
  if(fail)throw Error('Connection interrupted')
  return result
 })
 const onAccepted=vi.fn();render(<AssignedBuddyInvitations rpc={rpc} onAccepted={onAccepted}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Accept invitation'}))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Connection interrupted')
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Accept invitation'}))
 await waitFor(()=>expect(onAccepted).toHaveBeenCalledTimes(1))
 cleanup()
 render(<AssignedBuddyInvitations rpc={async()=>({invitations:[{...invite,can_accept:false,unavailable_reason:'Your account is on the upper year track.'}]})}/>);
 expect((await screen.findByRole('button',{name:'Accept invitation'})).disabled).toBe(true)
 expect(screen.getByText('Your account is on the upper year track.')).toBeTruthy()
})
it('discards an old account response after unmount and discovers new invitations on focus',async()=>{
 let resolve,items=[]
 const first=render(<AssignedBuddyInvitations rpc={()=>new Promise(r=>{resolve=r})}/>);first.unmount()
 const rpc=vi.fn(async()=>({invitations:items}));render(<AssignedBuddyInvitations rpc={rpc}/>);
 await act(async()=>resolve({invitations:[invite]}));expect(screen.queryByRole('dialog')).toBeNull()
 items=[invite];await act(async()=>{window.dispatchEvent(new Event('focus'))})
 expect(await screen.findByRole('dialog')).toBeTruthy()
})
it('replaces the year chooser with an incoming invitation and opens My Buddy after acceptance',async()=>{
 let accepted=false
 api.mockImplementation(async(name,args)=>{
  if(name==='buddy_assigned_invitations')return {invitations:accepted?[]:[invite]}
  if(name==='buddy_assigned_respond'){accepted=true;return result}
  if(name==='buddy_assigned_state')return {pairs:accepted?[{id:'pair',name:'Serine',status:'confirmed',requests:[],posts:[]}]:[]}
  if(name==='buddy_choice_connection_links')return []
  if(name==='buddy_first_year_access_state')return {request:null,incoming:[]}
  if(name==='buddy_recommendations')return {items:[]}
  return args?.p_program?{role:accepted?'first':null,enabled:true,coordinator:false,posts:[],invitations:[],upper_students:[]}:{programs:[{id:'rotman'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}} onOpenChat={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Accept invitation'}))
 expect(await screen.findByRole('button',{name:'Open chat'})).toBeTruthy()
 expect(screen.queryByText('How would you like to take part?')).toBeNull()
 expect(api).not.toHaveBeenCalledWith('buddy_first_year_request',expect.anything())
})
it('opens the accepted program when more than one program is available',async()=>{
 api.mockImplementation(async(name,args)=>{
  if(name==='buddy_assigned_invitations')return {invitations:[]}
  if(name==='buddy_assigned_state')return {pairs:[]}
  if(name==='buddy_choice_connection_links')return []
  if(name==='buddy_first_year_access_state')return {request:null,incoming:[]}
  return args?.p_program?{role:'first',enabled:true,coordinator:false,posts:[],invitations:[]}:{programs:[{id:'other',name:'Other program'},{id:'rotman',name:'Rotman'}]}
 })
 render(<BuddyChoiceProgram initialProgramId="rotman" onBack={()=>{}}/>);
 expect(await screen.findByRole('button',{name:'My Buddy',exact:true})).toBeTruthy()
 expect(api).toHaveBeenCalledWith('buddy_choice_state',{p_program:'rotman'})
 expect(api).not.toHaveBeenCalledWith('buddy_choice_state',{p_program:'other'})
})
