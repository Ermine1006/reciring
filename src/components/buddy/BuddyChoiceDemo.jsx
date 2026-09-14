import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SubmitRequest from '../SubmitRequest'
import AppScreen from '../AppScreen'
import { HELP_TYPES } from '../../data/requestOptions'
import { matchaCta } from '../../lib/matchaCta'
import './choice-demo.css'

const sampleDraft = { title: 'Finding my feet at Rotman and exploring finance', details: 'I’m a first-year MBA student moving from engineering into finance. I’d love advice on recruiting, choosing clubs and settling into Toronto.', offers: 'Happy to share Python skills and practical AI tools for coursework.', helpType: ['Coffee Chat', 'Advice'], industry: ['Finance'] }
const initialPosts = [
 { id:'finance', ...sampleDraft, needs: `${sampleDraft.title}\n\n${sampleDraft.details}`, time:'30 min', owner:'me', is_anonymous:true, tags:['Coffee Chat','Advice','Finance'] },
 { id:'consulting', needs:'Getting started with consulting recruiting\n\nI’m new to case interviews and would love an upper-year buddy’s perspective on planning practice alongside first-year classes.', offers:'Happy to share consumer research experience and help with presentation design.', time:'30 min', helpType:['Advice'], tags:['Advice','Consulting'], is_anonymous:true },
 { id:'community', needs:'Finding my community at Rotman\n\nI’ve just moved to Toronto. I’d love to hear how you made friends, chose clubs and found your routine during the first term.', offers:'I enjoy cooking and would be happy to share easy recipes or practise conversational Mandarin.', time:'15 min', helpType:['Coffee Chat'], tags:['Coffee Chat'], is_anonymous:true },
]
export function Button({ primary, children, ...props }) { return <button className="bc-button" style={primary?matchaCta:undefined} type="button" {...props}>{children}</button> }
export function Post({ post }) { return <><div className="bc-meta"><span>{post.helpType?.[0] || 'Advice'}</span><span>{post.time}</span><small>{post.is_anonymous?'First-year student':`${post.name || 'First-year student'} · First-year student`}</small></div><p className="bc-label">Looking for</p><p className="bc-copy">{post.needs}</p><p className="bc-label bc-give">Also happy to help with</p><p className="bc-copy">{post.offers || 'Open to discovering how I can help.'}</p><div className="bc-tags">{post.tags?.map(t=><span key={t}>{t}</span>)}</div></> }
export function Preview({post,onClose,children}) {
 const ref=useRef(null)
 useLayoutEffect(()=>{ref.current.showModal()},[])
 return createPortal(<dialog ref={ref} className="bc-dialog" onClose={onClose} onClick={e=>{if(e.target===ref.current)onClose()}}><div><header><h2>Post preview</h2><Button onClick={onClose}>Close</Button></header><Post post={post}/>{children}</div></dialog>,document.body)
}
export default function BuddyChoiceDemo({onBack}) {
 const [role,setRole]=useState('first')
 const [granted,setGranted]=useState(false)
 const [view,setView]=useState('new')
 const [posts,setPosts]=useState(initialPosts)
 const [invitations,setInvitations]=useState({})
 const [filter,setFilter]=useState('All')
 const [preview,setPreview]=useState(null)
 const [prefill,setPrefill]=useState(null)
 const [formKey,setFormKey]=useState(0)
 const [notice,setNotice]=useState('')
 const root=useRef(null)
 useLayoutEffect(()=>{root.current?.closest('.phone-scroll')?.scrollTo({top:0})},[role,view,formKey])
 function switchRole(next){setRole(next);setView(next==='first'?'mine':'browse');setPreview(null);setNotice('')}
 function choose(post){setInvitations(v=>({...v,[post.id]:'pending'}));setNotice('Sample invitation sent. The first-year student can accept or decline.');setPreview(null)}
 function respond(id,status){setInvitations(v=>({...v,[id]:status}));setNotice(status==='accepted'?'You’re connected. Arrange a first conversation when it works for both of you.':'Invitation declined. Your post remains available.');setPreview(null)}
 const owned=posts.filter(p=>p.owner==='me')
 const visible=role==='first'?owned:posts.filter(p=>(filter==='All'||p.helpType.includes(filter))&&(view!=='selected'||['pending','accepted'].includes(invitations[p.id])))
 const selected=Object.values(invitations).filter(v=>['pending','accepted'].includes(v)).length
 function action(post){const status=invitations[post.id];return role==='upper'?<div className="bc-actions">{status==='accepted'?<p className="bc-success">Connected · Jamie · jamie@example.test</p>:status==='pending'?<><span>Waiting for student confirmation</span><Button onClick={()=>{setInvitations(v=>{const n={...v};delete n[post.id];return n});setNotice('Sample invitation withdrawn.')}}>Withdraw invitation</Button></>:status==='declined'?<span>Invitation declined</span>:<Button primary disabled={selected>=3} onClick={()=>choose(post)}>I’d like to be your buddy</Button>}</div>:status==='pending'?<div className="bc-invite"><strong>An upper-year buddy would like to help</strong><p>“I can share my experience of finance recruiting and settling into Rotman.”</p><Button primary onClick={()=>respond(post.id,'accepted')}>Accept buddy</Button><Button onClick={()=>respond(post.id,'declined')}>Decline</Button></div>:status==='accepted'?<p className="bc-success">Connected with Alex · alex@example.test</p>:null}
 return <AppScreen background="transparent"><main className="bc-shell" ref={root}>
  <header className="bc-header"><Button onClick={onBack}>← Together</Button><strong>Mutu · Buddy Program</strong></header>
  <details className="bc-demo"><summary>Interactive demo · Sample data only</summary><div className="bc-controls"><label>Preview as<select aria-label="Preview as" value={role} onChange={e=>switchRole(e.target.value)}><option value="first">First-year student</option><option value="upper">Upper-year student</option><option value="coordinator">Coordinator</option></select></label><Button onClick={()=>{setPosts(initialPosts);setInvitations({});setGranted(false);setPrefill(null);setFormKey(k=>k+1);setRole('first');setView('new');setNotice('Demo reset.')}}>Reset demo</Button></div><small>No posts or invitations are sent. Role and access controls here are simulations.</small></details>
  {notice&&<p className="bc-notice" role="status">{notice}</p>}
  {role==='coordinator'?<section className="bc-card"><h1>Buddy access</h1><p>First-year students can post without being individually assigned a buddy. Grant upper-year students access to browse requests and choose whom they can support.</p><div className="bc-access"><strong>Alex · Upper-year MBA student</strong><span>{granted?'Access granted':'Access not granted'}</span><Button primary onClick={()=>{setGranted(!granted);setNotice(granted?'Sample access removed.':'Sample access granted. Switch to Upper-year student to browse.')}}>{granted?'Revoke demo access':'Grant demo access'}</Button></div><p>No manual pairing. Upper-year students choose from the posts.</p></section>
  :role==='upper'&&!granted?<section className="bc-card"><h1>Upper-year buddy access</h1><p>The program coordinator needs to grant your upper-year account access before you can browse first-year posts.</p><Button primary onClick={()=>switchRole('coordinator')}>Demo: view coordinator access</Button></section>
  :<>
   <div className="bc-toolbar"><h1>{role==='first'?'My buddy posts':'First-year posts'}</h1>{role==='first'?<Button primary onClick={()=>{setPrefill(null);setFormKey(k=>k+1);setView('new')}}>+ New post</Button>:<span>{selected} / 3 buddy places</span>}</div>
   <nav className="bc-tabs" aria-label="Buddy views">{(role==='first'?[['new','New post'],['mine','My posts']]:[['browse','Browse posts'],['selected','My selections']]).map(([id,label])=><Button key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</Button>)}</nav>
   {role==='first'&&view==='new'?<><p className="bc-audience">For first-year students · Visible to approved upper-year buddies.</p><Button onClick={()=>{setPrefill(sampleDraft);setFormKey(k=>k+1)}}>Fill sample post</Button><SubmitRequest key={formKey} demoMode audience="Approved upper-year buddies" prefill={prefill} onSubmitted={async payload=>{setPosts(v=>[{...payload,id:`post-${Date.now()}`,owner:'me'},...v]);setView('mine');setNotice('Sample post published. Approved upper-year buddies can now choose to help.');return {}}}/></>
   :<>{role==='upper'&&<div className="bc-filter"><label>Help type<select aria-label="Filter by help type" value={filter} onChange={e=>setFilter(e.target.value)}>{['All',...HELP_TYPES].map(t=><option key={t}>{t}</option>)}</select></label><p>Choose a student whose request you can help with.</p></div>}
    <div className="bc-list">{visible.length?visible.map(post=><article className="bc-card" key={post.id}><button className="bc-open" onClick={()=>setPreview(post)} aria-label={`Preview ${post.needs.split('\n')[0]}`}><Post post={post}/><span className="bc-preview-link">View full post ↗</span></button>{action(post)}</article>):<section className="bc-card"><h2>{view==='selected'?'No selections yet':'No posts here yet'}</h2><p>{view==='selected'?'Browse first-year posts and choose someone you can support.':'Try another filter or create a post.'}</p></section>}</div>
   </>}
  </>}
  {preview&&<Preview post={preview} onClose={()=>setPreview(null)}>{action(preview)}</Preview>}
 </main></AppScreen>
}
