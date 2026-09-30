// @vitest-environment jsdom
import React from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import BuddyChoiceProgram from '../../components/buddy/BuddyChoiceProgram'
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../buddy/api',()=>({buddyRpc:rpc}))
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({profile:null})}))
// Modern browsers may return a Promise from scrollTo. React must never use it as effect cleanup.
HTMLElement.prototype.scrollTo = vi.fn(() => Promise.resolve())
afterEach(()=>{cleanup();vi.clearAllMocks()})
const base={role:null,coordinator:false,enabled:true,capacity:3,posts:[],invitations:[],upper_students:[]}
it('shows a setup error rather than old matching or sample posts when schema is missing',async()=>{
 rpc.mockRejectedValue(new Error('buddy_choice_state missing from schema cache'));render(<BuddyChoiceProgram onBack={()=>{}}/>);
 await screen.findByText(/waiting for its database update/);expect(screen.queryByText('Sample mentor')).toBeNull();expect(screen.queryByText(/automatically suggested/i)).toBeNull()
})
it('uses the actual Give and Ask composer and writes to the choice API',async()=>{
 let posted=false
 rpc.mockImplementation(async(name,args)=>{if(name==='buddy_choice_publish'){expect(args.p_post.needs).toContain('Finance advice');posted=true;return 'post'}return args?.p_program?{...base,role:'first',posts:posted?[{id:'post',owner:'me',needs:'Finance advice',offers:'',helpType:['Advice'],tags:['Advice'],time:'15 min',is_anonymous:true}]:[]}:{programs:[{id:'p',name:'Rotman'}]}})
 render(<BuddyChoiceProgram onBack={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Community',exact:true}));fireEvent.click(await screen.findByRole('button',{name:'Post a request →'}));await screen.findByRole('heading',{name:'Create a post'});fireEvent.click(screen.getByRole('button',{name:'Advice',exact:true}));fireEvent.change(screen.getByLabelText(/What would you like help with/),{target:{value:'Finance advice'}});fireEvent.click(screen.getByRole('button',{name:'Publish post anonymously',exact:true}));await screen.findByText(/Post published/);expect(posted).toBe(true);expect(screen.getByText('Finance advice',{exact:true})).toBeTruthy()
})
it('connects a Buddy help offer into the shared Matches chat',async()=>{
 const post={id:'a',owner:'me',needs:'Settling into campus',offers:'Python skills',helpType:['Advice'],tags:['Advice'],time:'30 min',is_anonymous:true}
 let accepted=false
 const openChat=vi.fn()
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_recommendations')return {items:[]}
  if(name==='buddy_choice_connection_links')return accepted?[{invite_id:'invite',match_id:'match-1'}]:[]
  if(name==='buddy_choice_connect'){accepted=true;return 'match-1'}
  return args?.p_program?{...base,role:'first',posts:[post],invitations:[{id:'invite',post_id:'a',status:accepted?'accepted':'pending',name:accepted?'Alex':null}]}:{programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}} onOpenChat={openChat}/>)
 fireEvent.click(await screen.findByRole('button',{name:'Community',exact:true}))
 await screen.findByRole('heading',{name:'A little help finding your footing'})
 expect(screen.getByText('Settling into campus')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Connect'}))
 await screen.findByText('Alex')
 expect(rpc).toHaveBeenCalledWith('buddy_choice_connect',{p_invite:'invite'})
 fireEvent.click(screen.getByRole('button',{name:/Alex/}))
 expect(openChat).toHaveBeenCalledWith('match-1')
 fireEvent.click(screen.getByRole('button',{name:'My posts',exact:true}))
 expect(screen.getByText('Settling into campus')).toBeTruthy()
 expect(screen.getByRole('button',{name:/Alex/})).toBeTruthy()
})

it('explains full capacity and preserves disabled invitations and access to selections',async()=>{
 rpc.mockImplementation(async(name,args)=>name==='buddy_recommendations'?{}:args?.p_program?{...base,role:'upper',capacity:1,posts:[{id:'a',needs:'Finance help',helpType:['Advice'],tags:[],is_anonymous:true}],invitations:[{id:'i',post_id:'other',status:'pending'}]}:{programs:[{id:'p'}]})
 render(<BuddyChoiceProgram onBack={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Community',exact:true}));await screen.findByText(/Your help spots are full/);expect(screen.getByRole('button',{name:'I’d like to help'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'My selections'}));await screen.findByRole('heading',{name:'No selections yet'});fireEvent.click(screen.getByRole('button',{name:'Browse posts'}));expect(screen.getByText('Finance help')).toBeTruthy()
})
it('shows upper-year posts and selects with a real API call',async()=>{
 rpc.mockImplementation(async(name,args)=>{if(name==='buddy_choice_select')return null;return args?.p_program?{...base,role:'upper',posts:[{id:'a',needs:'Finance help',offers:'Python skills',helpType:['Advice'],tags:['Advice'],time:'30 min',is_anonymous:true}]}:{programs:[{id:'p'}]}})
 render(<BuddyChoiceProgram onBack={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Community',exact:true}));await screen.findByText('Finance help');fireEvent.click(screen.getByRole('button',{name:'I’d like to help'}));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('buddy_choice_select',{p_post:'a'}));expect(screen.queryByText(/Sample data/)).toBeNull()
})
it('requires a first year student to request access from their assigned Buddy',async()=>{
 let request=null
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_first_year_request'){
   expect(args).toEqual({p_program:'p',p_mentor_email:'mentor@rotman.utoronto.ca'})
   request={status:'pending_verification',mentor_email:'mentor@rotman.utoronto.ca'}
   return 'request-1'
  }
  if(name==='buddy_first_year_access_state')return {request,incoming:[]}
  if(name==='buddy_recommendations')return {}
  return args?.p_program?{...base,role:null}:{programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>)
 fireEvent.click(await screen.findByRole('radio',{name:/I am a first/}))
 expect(screen.queryByRole('button',{name:'Join as a student'})).toBeNull()
 fireEvent.change(screen.getByLabelText('Assigned Buddy email'),{target:{value:'MENTOR@rotman.utoronto.ca'}})
 fireEvent.click(screen.getByRole('button',{name:'Request access →'}))
 expect(await screen.findByText('Waiting for your Buddy')).toBeTruthy()
 expect(screen.getByText('mentor@rotman.utoronto.ca')).toBeTruthy()
 expect(rpc).toHaveBeenCalledWith('buddy_first_year_request',{p_program:'p',p_mentor_email:'mentor@rotman.utoronto.ca'})
 expect(rpc.mock.calls.some(([name])=>name==='buddy_choice_join')).toBe(false)
})

it('requires an upper year application and keeps requests locked while pending',async()=>{
 let application=null
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_upper_apply'){
   expect(args).toEqual({p_program:'p',p_help:['Advice'],p_focus:['Consulting']})
   application={status:'pending',help_topics:['Advice'],career_focus:['Consulting']}
   return null
  }
  return args?.p_program?{...base,upper_application:application}:{programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>)
 fireEvent.click(await screen.findByRole('radio',{name:/I am a second/}))
 expect(screen.getByText('Help preferences')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Advice'}))
 fireEvent.click(screen.getByRole('button',{name:'Consulting'}))
 fireEvent.click(screen.getByRole('button',{name:'Submit application'}))
 expect(await screen.findByText('Application pending')).toBeTruthy()
 expect(screen.getByText(/First year requests stay private until you are approved/)).toBeTruthy()
 expect(screen.getByText(/year is locked to this application/i)).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Community',exact:true})).toBeNull()
 expect(screen.queryByRole('radio',{name:/I am a first/})).toBeNull()
 expect(screen.queryByRole('button',{name:'Join as a student'})).toBeNull()
 expect(rpc.mock.calls.some(([name])=>name==='buddy_choice_join_upper')).toBe(false)
 expect(rpc.mock.calls.some(([name])=>name==='buddy_choice_join')).toBe(false)
})

it('lets an admin approve an upper year application',async()=>{
 let status='pending'
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_upper_application_decide'){
   expect(args).toEqual({p_program:'p',p_user:'upper-1',p_action:'approve'})
   status='approved';return null
  }
  return args?.p_program?{...base,coordinator:true,upper_applications:[{user_id:'upper-1',name:'Alex Chen',email:'alex@example.test',status,help_topics:['Advice'],career_focus:['Finance']}]}:{programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>)
 expect(await screen.findByText('Upper year applications')).toBeTruthy()
 expect(screen.getByText('Alex Chen')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Approve'}))
 await screen.findByText('Application approved.')
 expect(rpc).toHaveBeenCalledWith('buddy_upper_application_decide',{p_program:'p',p_user:'upper-1',p_action:'approve'})
})

it.each(['first','upper'])('corrects a saved %s year and keeps it after reopening',async initial=>{
 let saved=initial
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_choice_change_year'){saved=args.p_role;return null}
  return args?.p_program?{...base,role:saved}:{programs:[{id:'p'}]}
 })
 const app=render(<BuddyChoiceProgram onBack={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Change year'}))
 expect(screen.getByRole('button',{name:'Save year'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('radio',{name:initial==='first'?/I am a second/:/I am a first/}))
 expect(saved).toBe(initial)
 fireEvent.click(screen.getByRole('button',{name:'Save year'}))
 await screen.findByText('Your year is updated.')
 const next=initial==='first'?'upper':'first'
 expect(rpc).toHaveBeenCalledWith('buddy_choice_change_year',{p_program:'p',p_role:next})
 expect(screen.getByRole('heading',{name:next==='upper'?'Meet your Buddy crew':'Your Buddy, right here.'})).toBeTruthy()
 app.unmount();render(<BuddyChoiceProgram onBack={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Change year'}))
 expect(screen.getByRole('radio',{name:next==='upper'?/I am a second/:/I am a first/}).checked).toBe(true)
})

it.each(['Cancel','‹ Back'])('returns without saving via %s',async action=>{
 const back=vi.fn()
 rpc.mockImplementation(async(name,args)=>args?.p_program?{...base,role:'first'}:{programs:[{id:'p'}]})
 render(<BuddyChoiceProgram onBack={back}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Change year'}))
 fireEvent.click(screen.getByRole('radio',{name:/I am a second/}))
 fireEvent.click(screen.getByRole('button',{name:action}))
 await screen.findByRole('heading',{name:'Your Buddy, right here.'})
 expect(rpc.mock.calls.some(([name])=>name==='buddy_choice_change_year')).toBe(false)
 expect(back).not.toHaveBeenCalled()
})

it('keeps the old year and selected correction when saving fails, then allows retry',async()=>{
 let fail=true,role='upper'
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_choice_change_year'){if(fail)throw new Error('buddy_choice_change_year missing from schema cache');role=args.p_role;return null}
  return args?.p_program?{...base,role}:{programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Change year'}));fireEvent.click(screen.getByRole('radio',{name:/I am a first/}))
 fireEvent.click(screen.getByRole('button',{name:'Save year'}))
 await screen.findByText(/Your current year is unchanged/)
 expect(role).toBe('upper');expect(screen.getByRole('radio',{name:/I am a first/}).checked).toBe(true)
 expect(screen.getByRole('button',{name:'Save year'}).disabled).toBe(false)
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Save year'}))
 await screen.findByText('Your year is updated.');expect(role).toBe('first')
})

it('marks an expired first year post and renews it without rewriting the post',async()=>{
 let renewed=false
 const past='2026-09-19T03:59:59.000Z'
 const future='2026-10-06T03:59:59.000Z'
 const post={id:'expired-post',owner:'me',needs:'General MBA advice',offers:'Presentation design',helpType:['Advice'],tags:['Advice'],time:'30 min',is_anonymous:false,expiresAt:past}
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_choice_renew_post'){
   expect(args).toEqual({p_post:'expired-post',p_days:7})
   renewed=true
   return null
  }
  if(name==='buddy_recommendations')return {items:[]}
  return args?.p_program
   ? {...base,role:'first',posts:[{...post,expiresAt:renewed?future:past}]}
   : {programs:[{id:'p',name:'Rotman'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>)
 fireEvent.click(await screen.findByRole('button',{name:'My posts',exact:true}))
 expect(await screen.findByText('Expired')).toBeTruthy()
 expect(screen.getByText(/cannot see this post right now/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Renew for 7 days'}))
 await screen.findByText(/Post renewed for 7 days/)
 expect(rpc).toHaveBeenCalledWith('buddy_choice_renew_post',{p_post:'expired-post',p_days:7})
 await waitFor(()=>expect(screen.queryByText('Expired')).toBeNull())
 expect(screen.getByText('General MBA advice',{exact:true})).toBeTruthy()
})

it('frames Community as optional help rather than a new Buddy commitment',async()=>{
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_recommendations')return {profile:{help_types:[],career_focus:[],discoverable:false},incoming_post_ids:[]}
  return args?.p_program
   ? {...base,role:'upper',posts:[{id:'a',needs:'MBA advice',offers:'Presentation help',helpType:['Advice'],tags:['Advice'],time:'30 min',is_anonymous:false}]}
   : {programs:[{id:'p',name:'Rotman'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>)
 fireEvent.click(await screen.findByRole('button',{name:'Community',exact:true}))
 expect(await screen.findByText('Offer help where your experience is useful.')).toBeTruthy()
 expect(screen.getByText('0 of 3 help spots in use')).toBeTruthy()
 expect(screen.getByText('Help preferences')).toBeTruthy()
 expect(screen.getByRole('button',{name:'I’d like to help'})).toBeTruthy()
 expect(screen.queryByText(/buddy places/i)).toBeNull()
})

it('keeps a declined upper year applicant on the upper year track',async()=>{
 let submitted=false
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_upper_apply'){submitted=true;return null}
  return args?.p_program
    ? {...base,upper_application:{status:submitted?'pending':'declined',help_topics:['Advice'],career_focus:['Finance']}}
    : {programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>)
 expect(await screen.findByText('Application not approved')).toBeTruthy()
 expect(screen.queryByRole('radio',{name:/I am a first/})).toBeNull()
 expect(screen.queryByRole('button',{name:'Join as a student'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Submit application again'}))
 await screen.findByText('Application pending')
 expect(rpc).toHaveBeenCalledWith('buddy_upper_apply',{p_program:'p',p_help:['Advice'],p_focus:['Finance']})
 expect(rpc.mock.calls.some(([name])=>name==='buddy_choice_join')).toBe(false)
})

it('lets only an approved upper year Buddy act on incoming mentee verification requests',async()=>{
 let incoming=[{id:'req-1',name:'Milan Patel',email:'milan@rotman.utoronto.ca'}]
 const rpcLocal=rpc
 rpcLocal.mockImplementation(async(name,args)=>{
  if(name==='buddy_first_year_verify'){
   expect(args).toEqual({p_request:'req-1',p_accept:true})
   incoming=[]
   return null
  }
  if(name==='buddy_first_year_access_state')return {request:null,incoming}
  if(name==='buddy_assigned_state')return {pairs:[]}
  if(name==='buddy_recommendations')return {items:[]}
  return args?.p_program?{...base,role:'upper'}:{programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>)
 expect(await screen.findByText('Buddy verification requests')).toBeTruthy()
 expect(screen.getByText('Milan Patel')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Verify Buddy'}))
 await waitFor(()=>expect(rpcLocal).toHaveBeenCalledWith('buddy_first_year_verify',{p_request:'req-1',p_accept:true}))
 await waitFor(()=>expect(screen.queryByText('Milan Patel')).toBeNull())
})
