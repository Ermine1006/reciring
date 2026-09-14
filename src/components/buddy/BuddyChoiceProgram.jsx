import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import AppScreen from '../AppScreen'
import SubmitRequest from '../SubmitRequest'
import { HELP_TYPES } from '../../data/requestOptions'
import { buddyRpc } from '../../lib/buddy/api'
import { Button, Post, Preview } from './BuddyChoiceDemo'
import './choice-demo.css'
import BuddyRecommendations, { UpperBuddyProfile } from './BuddyRecommendations'

export default function BuddyChoiceProgram({onBack,registerNavigationGuard}) {
 const [programs,setPrograms]=useState([]),[program,setProgram]=useState(null),[data,setData]=useState(null)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [view,setView]=useState('new'),[filter,setFilter]=useState('All'),[preview,setPreview]=useState(null),[email,setEmail]=useState(''),[consent,setConsent]=useState(false)
 const [interestPosts,setInterestPosts]=useState([])
 const [retry,setRetry]=useState(0),[formKey,setFormKey]=useState(0)
 const root=useRef(null),dirty=useRef(false),working=useRef(false)
 useEffect(()=>registerNavigationGuard?.(proceed=>{if(!dirty.current||window.confirm('Leave without publishing your post?'))proceed()}),[registerNavigationGuard])
 useLayoutEffect(()=>{
  // scrollTo may return a Promise; effects must return only a cleanup function.
  root.current?.closest('.phone-scroll')?.scrollTo({top:0})
 },[view,program])
 async function refresh(p=program){const next=await buddyRpc('buddy_choice_state',{p_program:p});setData(next);return next}
 useEffect(()=>{let mounted=true;setLoading(true);setError('');buddyRpc('buddy_choice_state').then(async result=>{
  if(!mounted)return;setPrograms(result.programs||[])
  if(result.programs?.length===1){const id=result.programs[0].id;const next=await buddyRpc('buddy_choice_state',{p_program:id});if(mounted){setProgram(id);setData(next);setView(next.role==='upper'?'browse':next.role==='first'?'new':next.coordinator?'access':'new')}}
 }).catch(e=>{if(mounted)setError(/buddy_choice|schema cache|function/i.test(e.message)?'The new Buddy Program is waiting for its database update. Please ask the program coordinator to finish setup.':e.message)}).finally(()=>{if(mounted)setLoading(false)});return()=>{mounted=false}},[retry])
 async function run(task,message){if(working.current)return;working.current=true;setBusy(true);setError('');try{await task();await refresh();setPreview(null);if(message)setNotice(message);return true}catch(e){setError(e.message);return false}finally{working.current=false;setBusy(false)}}
 function navigate(next){if(dirty.current&&!window.confirm('Leave without publishing your post?'))return;dirty.current=false;setView(next)}
 const role=data?.role,upper=role==='upper'
 const posts=(data?.posts||[]).filter(p=>upper?(filter==='All'||p.helpType?.includes(filter))&&(view!=='selected'||data.invitations.some(i=>i.post_id===p.id&&['pending','accepted'].includes(i.status))):p.owner==='me')
 const used=(data?.invitations||[]).filter(i=>['pending','accepted'].includes(i.status)).length
 function actions(post){const invites=(data.invitations||[]).filter(i=>i.post_id===post.id);return <div className="bc-actions">
  {invites.map(i=><div key={i.id}>{i.status==='accepted'?<p className="bc-success">Connected with {i.name||'your buddy'}. You have both agreed to connect.</p>:i.status==='pending'?upper?<span>Waiting for student confirmation</span>:<div className="bc-invite"><strong>An upper-year buddy would like to support you.</strong><p>Accept to share your names with each other.</p><Button primary disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_respond',{p_invite:i.id,p_action:'accept'}),'Buddy invitation accepted.')}>Accept buddy</Button><Button disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_respond',{p_invite:i.id,p_action:'decline'}),'Invitation declined.')}>Decline</Button></div>:<small>{i.status==='declined'?'Invitation declined':'Invitation withdrawn'}</small>}
   {upper&&['pending','accepted'].includes(i.status)&&<Button disabled={busy} onClick={()=>run(()=>buddyRpc('buddy_choice_respond',{p_invite:i.id,p_action:'withdraw'}),'Invitation withdrawn.')}>{i.status==='accepted'?'End connection':'Withdraw invitation'}</Button>}
  </div>)}
  {upper&&!invites.some(i=>['pending','accepted','declined'].includes(i.status))&&<Button primary disabled={busy||used>=data.capacity||!data.enabled} onClick={()=>run(()=>buddyRpc('buddy_choice_select',{p_post:post.id}),'Invitation sent. The first-year student can accept or decline.')}>I’d like to be your buddy</Button>}
  {!upper&&<Button disabled={busy} onClick={()=>{if(window.confirm('Remove this post and end its buddy invitations?'))run(()=>buddyRpc('buddy_choice_remove',{p_post:post.id}),'Post removed.')}}>Remove post</Button>}
 </div>}
 return <AppScreen background="transparent"><main className="bc-shell" ref={root}>
 <header className="bc-header"><Button onClick={()=>{if(!dirty.current||window.confirm('Leave without publishing your post?'))onBack()}}>← Together</Button><strong>Mutu · Buddy Program</strong></header>
 {error&&<section className="bc-card" role="alert"><p>{error}</p><Button disabled={busy} onClick={()=>{if(program)run(()=>Promise.resolve());else setRetry(r=>r+1)}}>Try again</Button></section>}
 {notice&&<p className="bc-notice" role="status">{notice}</p>}
 {loading?<p role="status">Opening Buddy Program…</p>:!data?<section className="bc-card"><h1>Buddy Program</h1><p>First-year students share what they need and can offer. Approved upper-year students choose whom they can support.</p>{programs.length?programs.map(p=><Button key={p.id} onClick={async()=>{setLoading(true);try{const next=await refresh(p.id);setProgram(p.id);setView(next.role==='upper'?'browse':next.coordinator?'access':'new')}catch(e){setError(e.message)}finally{setLoading(false)}}}>{p.name}</Button>):!error&&<p>Join your student community to access its Buddy Program.</p>}</section>:<>
 <div className="bc-toolbar"><h1>{view==='access'?'Buddy access':upper?'First-year posts':'My buddy posts'}</h1>{role==='first'&&<Button primary onClick={()=>navigate('new')}>+ New post</Button>}{upper&&<span>{used} / {data.capacity} buddy places</span>}</div>
 <nav className="bc-tabs" aria-label="Buddy views">{(upper?[['browse','Browse posts'],['selected','My selections']]:role==='first'?[['new','New post'],['mine','My posts']]:[]).concat(data.coordinator?[['access','Manage access']]:[]).map(([id,label])=><Button key={id} aria-pressed={view===id} onClick={()=>navigate(id)}>{label}</Button>)}</nav>
 {view==='access'&&data.coordinator?<section className="bc-card"><h2>Upper-year access</h2><p>Verify that the student is an upper-year MBA student, then grant their registered account access to browse posts and choose a buddy.</p><form onSubmit={e=>{e.preventDefault();run(()=>buddyRpc('buddy_choice_access',{p_program:program,p_email:email,p_active:true}),'Upper-year access granted.')}}><label className="bc-access">Registered email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="student@example.com"/></label><button className="bc-button" type="submit" disabled={busy}>Grant access</button><Button disabled={busy||!email.trim()} onClick={()=>run(()=>buddyRpc('buddy_choice_access',{p_program:program,p_email:email,p_active:false}),'Access revoked. Active invitations have ended.')}>Revoke access</Button></form><div className="bc-access">{data.upper_students.map(s=><p key={s.id}>{s.name} · {s.active?'Access granted':'Access revoked'}</p>)}</div><p>First-year students can join themselves. Their year is self-declared; upper-year browsing access is granted by you.</p></section>
 :!role?<section className="bc-card"><h2>Join as a first-year student</h2><p>You can publish what you need and what you would enjoy helping with. Only approved upper-year buddies can browse the posts.</p><label className="bc-access"><span><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I am a first-year student and would like to participate.</span></label><Button primary disabled={busy||!consent||!data.enabled} onClick={()=>run(()=>buddyRpc('buddy_choice_join',{p_program:program}),'You can now create your first post.')}>Join and create a post</Button><p>Upper-year student? Ask the coordinator to grant your registered account browsing access.</p></section>
 :role==='first'&&view==='new'?<><p className="bc-audience">Visible to approved upper-year buddies.</p>{!data.enabled?<p>Posting is paused by the program coordinator.</p>:<div onChangeCapture={()=>{dirty.current=true}} onClickCapture={e=>{if(e.target.closest('button'))dirty.current=true}}><SubmitRequest key={formKey} audience="Approved upper-year buddies" onSubmitted={async payload=>{const ok=await run(()=>buddyRpc('buddy_choice_publish',{p_program:program,p_post:payload}),'Post published. Upper-year buddies can now choose to help.');if(!ok)return {error:{message:'Your post was not published. Please try again.'}};dirty.current=false;setFormKey(k=>k+1);setView('mine');return {}}}/></div>}</>
 :<>{upper&&<UpperBuddyProfile program={program} onInterestPosts={setInterestPosts}/ >}{upper&&<div className="bc-filter"><label>Help type<select aria-label="Filter by help type" value={filter} onChange={e=>setFilter(e.target.value)}>{['All',...HELP_TYPES].map(t=><option key={t}>{t}</option>)}</select></label><p>Choose a student whose request you can help with.</p></div>}
 <div className="bc-list">{posts.length?posts.map(post=><article className="bc-card" key={post.id}>{upper&&interestPosts.includes(post.id)&&<p className="br-interest-badge">This student is interested in connecting with you.</p>}<button className="bc-open" onClick={()=>setPreview(post)} aria-label="Preview full post"><Post post={post}/><span className="bc-preview-link">View full post ↗</span></button>{actions(post)}</article>):<section className="bc-card"><h2>{view==='selected'?'No selections yet':'No posts here yet'}</h2><p>{upper?'New first-year posts will appear here.':'Share what you need and what you can offer.'}</p></section>}</div></>}
 {role==='first'&&view!=='access'&&<BuddyRecommendations program={program} posts={data.posts||[]} version={data}/>}
 </>}
 {preview&&<Preview post={preview} onClose={()=>setPreview(null)}>{actions(preview)}</Preview>}
 </main></AppScreen>
}
