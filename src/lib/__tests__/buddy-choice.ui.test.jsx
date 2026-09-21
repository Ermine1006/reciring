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
 render(<BuddyChoiceProgram onBack={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Post a request →'}));await screen.findByRole('heading',{name:'Create a post'});fireEvent.click(screen.getByRole('button',{name:'Advice',exact:true}));fireEvent.change(screen.getByLabelText(/What would you like help with/),{target:{value:'Finance advice'}});fireEvent.click(screen.getByRole('button',{name:'Publish post anonymously',exact:true}));await screen.findByText(/Post published/);expect(posted).toBe(true);expect(screen.getByText('Finance advice',{exact:true})).toBeTruthy()
})
it('opens the first-year overview with real posts, recommendations and private invitations',async()=>{
 const post={id:'a',owner:'me',needs:'Settling into campus',offers:'Python skills',helpType:['Advice'],tags:['Advice'],time:'30 min',is_anonymous:true}
 let accepted=false
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_recommendations')return {items:[]}
  if(name==='buddy_choice_respond'){accepted=true;return null}
  return args?.p_program?{...base,role:'first',posts:[post],invitations:[{id:'invite',post_id:'a',status:accepted?'accepted':'pending',name:accepted?'Alex':null}]}:{programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}}/>);
 await screen.findByRole('heading',{name:'A little help finding your footing'});
 expect(screen.getByText('Settling into campus')).toBeTruthy();expect(screen.queryByText(/Connected with Alex/)).toBeNull();expect(screen.queryByRole('button',{name:'Manage access'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Accept buddy'}));await screen.findByText(/Connected with Alex/)
 expect(rpc).toHaveBeenCalledWith('buddy_choice_respond',{p_invite:'invite',p_action:'accept'})
 fireEvent.click(screen.getByRole('button',{name:'My posts',exact:true}));expect(screen.queryByRole('region',{name:'Recommended upper-year students'})).toBeNull();expect(screen.getByText('Settling into campus')).toBeTruthy()
})
it('explains full capacity and preserves disabled invitations and access to selections',async()=>{
 rpc.mockImplementation(async(name,args)=>name==='buddy_recommendations'?{}:args?.p_program?{...base,role:'upper',capacity:1,posts:[{id:'a',needs:'Finance help',helpType:['Advice'],tags:[],is_anonymous:true}],invitations:[{id:'i',post_id:'other',status:'pending'}]}:{programs:[{id:'p'}]})
 render(<BuddyChoiceProgram onBack={()=>{}}/>);
 await screen.findByText(/Your buddy places are full/);expect(screen.getByRole('button',{name:'I’d like to be your buddy'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'My selections'}));await screen.findByRole('heading',{name:'No selections yet'});fireEvent.click(screen.getAllByRole('button',{name:'Browse posts'})[1]);expect(screen.getByText('Finance help')).toBeTruthy()
})
it('shows approved upper-year posts and selects with a real API call',async()=>{
 rpc.mockImplementation(async(name,args)=>{if(name==='buddy_choice_select')return null;return args?.p_program?{...base,role:'upper',posts:[{id:'a',needs:'Finance help',offers:'Python skills',helpType:['Advice'],tags:['Advice'],time:'30 min',is_anonymous:true}]}:{programs:[{id:'p'}]}})
 render(<BuddyChoiceProgram onBack={()=>{}}/>);await screen.findByText('Finance help');fireEvent.click(screen.getByRole('button',{name:'I’d like to be your buddy'}));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('buddy_choice_select',{p_post:'a'}));expect(screen.queryByText(/Sample data/)).toBeNull()
})
