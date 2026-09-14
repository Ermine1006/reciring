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
 render(<BuddyChoiceProgram onBack={()=>{}}/>);await screen.findByRole('heading',{name:'Create a post'});fireEvent.click(screen.getByRole('button',{name:'Advice',exact:true}));fireEvent.change(screen.getByLabelText(/What would you like help with/),{target:{value:'Finance advice'}});fireEvent.click(screen.getByRole('button',{name:'Publish post anonymously',exact:true}));await screen.findByText(/Post published/);expect(posted).toBe(true);expect(screen.getByText('Finance advice',{exact:true})).toBeTruthy()
})
it('shows approved upper-year posts and selects with a real API call',async()=>{
 rpc.mockImplementation(async(name,args)=>{if(name==='buddy_choice_select')return null;return args?.p_program?{...base,role:'upper',posts:[{id:'a',needs:'Finance help',offers:'Python skills',helpType:['Advice'],tags:['Advice'],time:'30 min',is_anonymous:true}]}:{programs:[{id:'p'}]}})
 render(<BuddyChoiceProgram onBack={()=>{}}/>);await screen.findByText('Finance help');fireEvent.click(screen.getByRole('button',{name:'I’d like to be your buddy'}));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('buddy_choice_select',{p_post:'a'}));expect(screen.queryByText(/Sample data/)).toBeNull()
})
