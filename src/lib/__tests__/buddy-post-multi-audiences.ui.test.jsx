// @vitest-environment jsdom
import React from 'react'
import {afterEach,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import BuddyChoiceProgram from '../../components/buddy/BuddyChoiceProgram'
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../buddy/api',()=>({buddyRpc:rpc}))
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({profile:null})}))
HTMLElement.prototype.scrollTo=vi.fn()
afterEach(()=>{cleanup();vi.clearAllMocks()})

function setup({buddy=true,post=null,fail=false}={}){
 const refreshCommunity=vi.fn()
 let saved=post
 rpc.mockImplementation(async(name,args)=>{
  if(name==='buddy_assigned_state')return {pairs:buddy?[{id:'pair',name:'Serine',status:'confirmed',posts:[],requests:[]}]:[]}
  if(name==='buddy_choice_connection_links')return []
  if(name==='buddy_first_year_access_state')return {request:null,incoming:[]}
  if(name==='buddy_recommendations')return {items:[]}
  if(name==='buddy_choice_publish_multi'||name==='buddy_choice_update_multi'){
   if(fail)throw Error('buddy_choice_publish_multi missing from schema cache')
   saved={...(args.p_post||args.p_payload),id:'post',owner:'me'};return 'post'
  }
  return args?.p_program?{role:'first',enabled:true,coordinator:false,capacity:3,posts:saved?[saved]:[],invitations:[],upper_students:[]}:{programs:[{id:'p'}]}
 })
 render(<BuddyChoiceProgram onBack={()=>{}} onCommunityPostChanged={refreshCommunity}/>);
 return refreshCommunity
}
async function composer(){
 fireEvent.click(await screen.findByRole('button',{name:'Community',exact:true}))
 fireEvent.click(await screen.findByRole('button',{name:'Post a request →'}))
 await screen.findByText(/Select any combination/)
 fireEvent.click(screen.getByRole('button',{name:'Advice',exact:true}))
 fireEvent.change(screen.getByLabelText(/What would you like help with/),{target:{value:'Recruiting advice'}})
}
const buddyButton=()=>screen.getByRole('button',{name:/My Buddy.*Your assigned Buddy: Serine/})
const programButton=()=>screen.getByRole('button',{name:/Buddy Program.*Approved upper year/})
const communityButton=()=>screen.getByRole('button',{name:/Whole community.*Everyone/})

it('publishes all three selected audiences in one request and restores them when editing',async()=>{
 const refresh=setup();await composer()
 if(buddyButton().getAttribute('aria-pressed')==='false')fireEvent.click(buddyButton())
 if(programButton().getAttribute('aria-pressed')==='false')fireEvent.click(programButton())
 fireEvent.click(communityButton())
 expect(screen.getByText('Select any combination · 3 selected')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Publish post anonymously'}))
 await screen.findByText('Post published.')
 const calls=rpc.mock.calls.filter(([name])=>name==='buddy_choice_publish_multi')
 expect(calls).toHaveLength(1)
 expect(calls[0][1].p_post.audiences).toEqual(expect.arrayContaining(['assigned_buddy','buddy_program','whole_community']))
 expect(refresh).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('button',{name:'Edit post'}))
 expect(screen.getByText('Select any combination · 3 selected')).toBeTruthy()
 fireEvent.click(communityButton())
 fireEvent.click(screen.getByRole('button',{name:'Save changes'}))
 await screen.findByText('Post updated.')
 expect(rpc).toHaveBeenCalledWith('buddy_choice_update_multi',expect.objectContaining({p_payload:expect.objectContaining({audiences:expect.not.arrayContaining(['whole_community'])})}))
 expect(refresh).toHaveBeenCalledTimes(2)
})
it('requires at least one selected audience before publishing',async()=>{
 setup();await composer()
 for(const button of [buddyButton(),programButton(),communityButton()])if(button.getAttribute('aria-pressed')==='true')fireEvent.click(button)
 expect(screen.getByText('Choose at least one place to publish.')).toBeTruthy()
 expect(screen.getByRole('button',{name:'Publish post anonymously'}).disabled).toBe(true)
 fireEvent.click(communityButton())
 expect(screen.getByRole('button',{name:'Publish post anonymously'}).disabled).toBe(false)
})
it('does not enable My Buddy without a confirmed pairing',async()=>{
 setup({buddy:false});await composer()
 expect(screen.getByRole('button',{name:/My Buddy.*Available once/}).disabled).toBe(true)
 fireEvent.click(communityButton())
 expect(screen.getByText('Select any combination · 2 selected')).toBeTruthy()
})
it('preserves selections and the draft when the server is not updated yet',async()=>{
 setup({fail:true});await composer();fireEvent.click(communityButton())
 fireEvent.click(screen.getByRole('button',{name:'Publish post anonymously'}))
 await screen.findByText('Posting to multiple places is waiting for a program update. Your draft is still here.')
 expect(screen.getByLabelText(/What would you like help with/).value).toBe('Recruiting advice')
 expect(communityButton().getAttribute('aria-pressed')).toBe('true')
 await waitFor(()=>expect(screen.getByRole('button',{name:'Publish post anonymously'}).disabled).toBe(false))
})
